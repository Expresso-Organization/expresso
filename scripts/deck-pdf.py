#!/usr/bin/env python3
"""HTML 발표 자료를 제출용 PDF로 내보낸다.

    python3 scripts/deck-pdf.py docs/최종-발표-개정.html docs/downloads/final-presentation.pdf

작업대의 「내보내기 → PDF」는 장마다 1920×1080 화면을 찍어 그림으로 넣는다. 확대하면
글자가 흐리고 검색이 안 된다. 이 스크립트는 두 가지를 섞는다.

- 보통 장은 브라우저 인쇄(덱의 `@media print` · 1920×1080 한 장에 한 쪽)로 뽑는다.
  글자와 도형이 벡터로 남아 확대해도 선명하고, 글자를 검색 · 복사할 수 있다.
- 요소 추출 재생 장(`.slide.rx`)은 인쇄하면 빈 지면이 된다. 녹화를 단계마다 재생해
  설명(말풍선)이 떠 있는 순간을 2배 해상도로 찍고, 단계마다 한 쪽으로 넣는다.
  설명이 없는 마지막 단계(화면 전체로 물러나는 장면)는 넣지 않는다.

덱 파일은 고치지 않는다. 인쇄에서 깨지는 표현은 내보낼 때만 고친다(PRINT_FIX).
쪽마다 장 제목으로 PDF 책갈피를 단다.

필요한 것: Playwright · pypdf · Pillow. html-presentation 스킬의 내보내기 환경
(`~/.local/share/html-presentation/export-venv`)에 모두 들어 있다. Chrome을 쓴다.
"""
from __future__ import annotations

import argparse
import functools
import html
import http.server
import io
import re
import sys
import threading
from pathlib import Path
from urllib.parse import quote

from PIL import Image
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent.parent
W, H = 1920, 1080
SCALE = 2           # 재생 장을 찍는 배율 — 3840×2160
JPEG_QUALITY = 92

# 워드마크의 「0」은 화면에서 `background-clip: text` 그러데이션으로 대각선 아래만 색을
# 바꾼다. Chrome PDF에서는 글자 옆에 세로 머리카락 선이 생기고, macOS 미리보기에서는 대각선이
# 사라져 글자 전체가 한 색이 된다. 내보낼 때만 같은 모양을 두 겹 글자 + clip-path로 다시 그린다.
# 135deg 그러데이션의 62.5% 경계는 상자 안에서 x + y = 0.625 × (w + h) 인 직선이다.
PRINT_FIX = r"""
() => {
  const rgb = (s) => s.match(/rgba?\([^)]*\)/g) || [];
  document.querySelectorAll('.vh-wm i').forEach((el) => {
    if (el.dataset.pdfFixed) return;
    const cs = getComputedStyle(el);
    const layers = cs.backgroundImage.split(/,\s*(?=linear-gradient)/);
    const cols = rgb(layers[layers.length - 1]).filter((c) => !/,\s*0\)$/.test(c));
    if (cols.length < 2) return;
    const a = cols[0], b = cols[cols.length - 1];
    const r = el.getBoundingClientRect();
    const zoom = r.width / el.offsetWidth || 1;
    const w = el.offsetWidth, h = el.offsetHeight, c = 0.625 * (w + h);
    const pts = [[c, 0], [w, 0], [w, h], [Math.max(0, c - h), h]];
    if (c > w) { pts[0] = [w, c - w]; pts.splice(1, 1); }
    el.dataset.pdfFixed = '1';
    el.style.cssText += `;background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;color:${a}!important;-webkit-text-fill-color:${a}!important;position:relative;display:inline-block;animation:none!important`;
    const o = document.createElement('span');
    o.setAttribute('aria-hidden', 'true');
    o.textContent = el.textContent;
    o.style.cssText = `position:absolute;left:0;top:0;color:${b};-webkit-text-fill-color:${b};clip-path:polygon(${pts.map(([x, y]) => `${x}px ${y}px`).join(',')})`;
    el.appendChild(o);
  });
}
"""

HIDE_UI = ".deck-controls,.deck-progress,.overview,.de-bar,.de-undo,.deck-export-dialog{display:none!important}"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class QuietServer(http.server.ThreadingHTTPServer):
    # 탭을 닫을 때 받던 영상 요청이 끊기는 것은 오류가 아니다.
    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


def serve(directory: Path) -> tuple[QuietServer, int]:
    handler = functools.partial(QuietHandler, directory=str(directory))
    server = QuietServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


def open_deck(browser, url: str, scale: int):
    ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=scale)
    # 덱이 PDF 전용 장면(재생 장의 pdfCam 등)을 고르도록 알린다.
    ctx.add_init_script("window.__deckPdf = true")
    page = ctx.new_page()
    page.set_default_timeout(60000)
    # 편집 도구의 저장 요청이 원본을 덮지 않도록 읽기 요청만 통과시킨다.
    page.route("**/*", lambda route: route.continue_() if route.request.method in ("GET", "HEAD") else route.abort())
    page.goto(url, wait_until="load")
    page.evaluate("document.fonts.ready")
    page.add_style_tag(content=HIDE_UI)
    page.wait_for_timeout(1500)
    return ctx, page


def print_pages(browser, url: str) -> tuple[bytes, list[dict]]:
    ctx, page = open_deck(browser, url, 1)
    slides = page.evaluate("""() => [...document.querySelectorAll('#deckStage > section.slide')]
        .map((s) => ({
          // 끝장의 data-title은 편집 도구용 이름이라 책갈피에는 지면의 인사말을 쓴다.
          title: (s.dataset.kind === '끝장' && s.querySelector('.thanks, h1, h2')?.textContent.trim()) || s.dataset.title || '',
          rx: s.classList.contains('rx'),
        }))""")
    page.emulate_media(media="print")
    page.evaluate(PRINT_FIX)
    page.wait_for_timeout(300)
    pdf = page.pdf(width=f"{W}px", height=f"{H}px", print_background=True, prefer_css_page_size=True)
    ctx.close()
    return pdf, slides


def rx_frames(browser, url: str, index: int) -> list[bytes]:
    """재생 장 하나를 단계마다 끝까지 재생하고, 설명이 떠 있는 단계만 찍는다."""
    ctx, page = open_deck(browser, url, SCALE)
    page.evaluate("i => window.deck.show(i)", index)
    page.wait_for_function("i => window.deck.slides[i].dataset.step === '1'", arg=index, timeout=30000)
    total = page.evaluate("i => JSON.parse(window.deck.slides[i].querySelector('.rx-cfg').textContent).steps.length", index)
    frames = []
    for n in range(1, total + 1):
        if n > 1:
            page.evaluate("window.deck.next()")
        settle = page.evaluate(
            "([i, n]) => JSON.parse(window.deck.slides[i].querySelector('.rx-cfg').textContent).steps[n - 1].settle || 4000",
            [index, n])
        page.wait_for_timeout(settle + 900)
        notes = page.evaluate("i => window.deck.slides[i].querySelectorAll('.rx-note.on').length", index)
        if not notes:
            continue
        png = page.screenshot(type="png", animations="disabled")
        im = Image.open(io.BytesIO(png)).convert("RGB")
        buf = io.BytesIO()
        # 1920×1080 CSS px 지면 = 1440×810 pt. 3840 px 폭이면 192 dpi.
        im.save(buf, "PDF", resolution=72 * im.width / (W * 0.75), quality=JPEG_QUALITY)
        frames.append(buf.getvalue())
        print(f"  {n}/{total} 단계", flush=True)
    ctx.close()
    return frames


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("deck", type=Path, help="docs/ 아래 HTML 발표 자료")
    ap.add_argument("output", type=Path, nargs="?", default=None)
    ap.add_argument("--title", default=None, help="PDF 문서 제목(기본: 덱의 <title>)")
    args = ap.parse_args()

    deck = args.deck.resolve()
    out = (args.output or deck.with_suffix(".pdf")).resolve()
    docs = ROOT / "docs"
    server, port = serve(docs)
    url = f"http://127.0.0.1:{port}/" + quote(str(deck.relative_to(docs)))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        try:
            print("인쇄 지면 만드는 중", flush=True)
            printed, slides = print_pages(browser, url)
            reader = PdfReader(io.BytesIO(printed))
            if len(reader.pages) != len(slides):
                raise SystemExit(f"인쇄 쪽 수({len(reader.pages)})와 장 수({len(slides)})가 다릅니다.")
            writer = PdfWriter()
            for i, s in enumerate(slides):
                start = len(writer.pages)
                if s["rx"]:
                    print(f"{i + 1:02d} {s['title']} — 단계 재생", flush=True)
                    frames = rx_frames(browser, url, i)
                    if not frames:
                        raise SystemExit(f"{s['title']}: 설명이 뜬 단계를 찾지 못했습니다.")
                    for f in frames:
                        writer.add_page(PdfReader(io.BytesIO(f)).pages[0])
                else:
                    writer.add_page(reader.pages[i])
                writer.add_outline_item(s["title"], start)
        finally:
            browser.close()
            server.shutdown()

    m = re.search(r"<title>([^<]*)</title>", deck.read_text(encoding="utf-8"))
    title = args.title or (html.unescape(m.group(1)).strip() if m else deck.stem)
    writer.add_metadata({"/Title": title, "/Creator": "scripts/deck-pdf.py"})
    writer.page_mode = "/UseOutlines"
    for p in writer.pages:
        p.compress_content_streams()
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("wb") as fh:
        writer.write(fh)
    print(f"{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} · {len(writer.pages)}쪽 · {out.stat().st_size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
