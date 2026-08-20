#!/usr/bin/env python3
"""문서를 브라우저에서 고쳐 파일로 되돌려 쓰는 서버.

`python3 -m http.server`를 대신합니다. 하는 일은 둘입니다.

1. HTML을 내보낼 때 편집기를 끼워 넣습니다. **파일에는 아무것도 남지 않습니다.**
   그래서 문서를 남에게 줄 때 걷어낼 것이 없습니다.

2. 고친 문장을 원본 파일에 되돌려 씁니다. 이때 **문서 전체를 저장하지 않습니다.**
   양식의 스크립트가 목차와 앵커를 DOM에 만들어 넣기 때문에, 통째로 저장하면
   생성물이 원본에 눌어붙습니다. 대신 고친 조각만 「바뀌기 전 문자열 → 바뀐
   문자열」로 받아 원본에서 정확히 한 번 찾아 바꿉니다.

   찾지 못하거나 두 군데 이상에서 찾으면 **하나도 쓰지 않고 거절합니다.** 어디가
   왜 실패했는지 브라우저에 그대로 돌려주므로, 조용히 망가지는 일이 없습니다.

    python3 scripts/doc-server.py [포트]
"""

from __future__ import annotations

import http.server
import io
import json
import os
import posixpath
import re
import socketserver
import sys
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 내보내기 작업. 브라우저가 진행을 물어볼 수 있게 줄 단위로 쌓아 둔다.
JOBS: dict[str, dict] = {}
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8901

EDITOR = r"""
<style id="ex-edit-style">
  #ex-edit { position: fixed; right: 22px; bottom: 22px; z-index: 9999;
    display: flex; gap: 8px; align-items: center;
    font-family: var(--ex-font-mono, ui-monospace, monospace); font-size: 11px; letter-spacing: .08em; }
  #ex-edit button { border: 1px solid var(--ex-line-200, #e3e7ef); background: var(--ex-white, #fff);
    color: var(--ex-ink-900, #16223a); border-radius: 10px; cursor: pointer;
    font: inherit; letter-spacing: inherit; box-shadow: 0 6px 20px rgba(22,34,58,.10);
    width: 38px; height: 38px; padding: 0; display: inline-flex; gap: 5px;
    align-items: center; justify-content: center; font-size: 17px; line-height: 1; }
  #ex-edit button.wide { width: auto; padding: 0 12px; }   /* 개수가 붙으면 넓어진다 */
  #ex-edit button .n { font-size: 11px; letter-spacing: .04em; }
  #ex-edit button.text { width: auto; padding: 0 14px; font-size: 11px; }  /* 아이콘 글꼴이 없을 때 */
  #ex-edit button:disabled { opacity: .4; cursor: default; }
  #ex-edit button.on { background: var(--ex-espresso, #9a4030); border-color: var(--ex-espresso, #9a4030); color: #fff; }
  #ex-edit .msg { max-width: 340px; padding: 9px 12px; border-radius: 10px; background: var(--ex-white, #fff);
    border: 1px solid var(--ex-line-200, #e3e7ef); box-shadow: 0 6px 20px rgba(22,34,58,.10);
    line-height: 1.5; letter-spacing: 0; font-family: var(--ex-font-ui, sans-serif); font-size: 12px; display: none; }
  #ex-edit .msg.show { display: block; }
  #ex-edit .msg.bad { border-color: var(--ex-espresso, #9a4030); }
  #ex-edit .bar { height: 3px; margin-top: 8px; border-radius: 2px;
    background: var(--ex-line-200, #e3e7ef); overflow: hidden; display: none; }
  #ex-edit .bar.show { display: block; }
  #ex-edit .bar i { display: block; height: 100%; width: 0;
    background: var(--ex-espresso, #9a4030); transition: width .35s ease; }
  html.ex-editing [data-ex-edit] { outline: 1px dashed transparent; outline-offset: 3px; border-radius: 3px; }
  html.ex-editing [data-ex-edit]:hover { outline-color: var(--ex-line-300, #cfd6e4); }
  html.ex-editing [data-ex-edit]:focus { outline: 1px solid var(--ex-espresso, #9a4030); }
  html.ex-editing [data-ex-edit].dirty { background: var(--ex-bean-50, #fbf1ea); }
  @media print { #ex-edit { display: none; } }
</style>
<div id="ex-edit">
  <div class="msg" id="exMsg"><span id="exMsgText"></span><div class="bar" id="exBar"><i></i></div></div>
  <button id="exToggle" type="button" title="편집" aria-label="편집"><i class="ph ph-pencil-simple"></i></button>
  <button id="exSave" type="button" title="저장 · ⌘S" aria-label="저장" disabled><i class="ph ph-floppy-disk"></i><span class="n"></span></button>
</div>
<script>
(function () {
  /* 고칠 수 있는 것은 글입니다. 코드 그림과 SVG 라벨은 제외합니다 —
     엔티티와 줄바꿈이 브라우저를 오가며 모양이 바뀌어, 되돌려 쓸 때
     원본과 글자가 어긋납니다. */
  const SEL = [
    'h1', 'h2', 'h3', 'h4', 'p', 'li', 'td', 'th', 'caption', 'figcaption', 'blockquote',
    '.kicker', '.box > .t', '.meta .v', '.stat > .k', '.stat > .v', '.stat > .d',
    '.sec-head .num', '.sec-head .aside',
  ].join(',');

  const sheet = document.querySelector('main');
  if (!sheet) return;

  const targets = [...sheet.querySelectorAll(SEL)].filter((el) => {
    if (el.closest('figure.code')) return false;      // 코드 그림
    if (el.closest('svg')) return false;              // 다이어그램 라벨
    if (el.querySelector(SEL)) return false;          // 편집 대상이 겹치면 바깥은 건드리지 않는다
    return true;
  });

  /* 기준선은 **문서를 연 순간**의 innerHTML입니다. 양식 스크립트는 h2 뒤에
     앵커를 형제로 붙일 뿐 안쪽을 고치지 않으므로, 이 값이 파일의 글자와 같습니다. */
  const base = new Map();
  const outer = new Map();
  const at = new Map();

  /* 자리는 **편집 대상만이 아니라 main 안의 모든 요소**를 세어 매깁니다.
     서버는 원본을 같은 방식으로 세므로 둘의 번호가 맞아떨어집니다. */
  const ordinal = new Map();
  const seen = {};
  [...sheet.querySelectorAll('*')].forEach((el) => {
    const tag = el.tagName.toLowerCase();
    seen[tag] = seen[tag] || 0;
    ordinal.set(el, seen[tag]++);
  });

  targets.forEach((el, i) => {
    base.set(el, el.innerHTML);
    outer.set(el, el.outerHTML);   // 속성을 붙이기 **전**에 떠 둔다 — 파일의 글자와 같아야 한다
    /* 같은 글이 표에 여러 번 나오면 내용으로는 어느 칸인지 가릴 수 없습니다.
       그래서 **자리**로 보냅니다 — main 안에서 몇 번째 <td>인가. 서버는 원본을
       같은 순서로 세어 그 범위를 직접 집고, 내용은 대조에만 씁니다. */
    at.set(el, { tag: el.tagName.toLowerCase(), nth: ordinal.get(el) });
    el.dataset.exEdit = String(i);
  });

  const toggle = document.getElementById('exToggle');
  const saveBtn = document.getElementById('exSave');
  const msg = document.getElementById('exMsg');
  let editing = false;

  const msgText = document.getElementById('exMsgText');
  const bar = document.getElementById('exBar');
  const progress = (ratio) => {
    bar.classList.toggle('show', ratio !== null);
    if (ratio !== null) bar.firstElementChild.style.width = Math.round(ratio * 100) + '%';
  };

  const say = (text, bad) => {
    msgText.textContent = text;
    msg.classList.toggle('bad', !!bad);
    msg.classList.toggle('show', !!text);
  };

  const dirty = () => targets.filter((el) => el.innerHTML !== base.get(el));

  const count = saveBtn.querySelector('.n');
  const refresh = () => {
    const n = dirty().length;
    saveBtn.disabled = n === 0;
    count.textContent = n ? String(n) : '';
    saveBtn.classList.toggle('wide', n > 0);
    saveBtn.title = n ? `고친 ${n}곳을 저장 · ⌘S` : '저장 · ⌘S';
  };

  /* 아이콘 글꼴이 없는 페이지에서는 글자로 돌아갑니다 — 빈 사각형만 남는 것보다 낫습니다. */
  if (!getComputedStyle(toggle.querySelector('i')).fontFamily.toLowerCase().includes('phosphor')) {
    [toggle, saveBtn].forEach((b) => {
      b.classList.add('text');
      b.querySelector('i').replaceWith(b.getAttribute('aria-label'));
    });
  }

  const tocLinkFor = (el) => {
    if (el.tagName !== 'H2') return null;
    const sec = el.closest('.sec');
    const i = [...document.querySelectorAll('main .sec')].indexOf(sec);
    return document.querySelectorAll('#tocList a .l')[i] || null;
  };

  targets.forEach((el) => {
    el.addEventListener('input', () => {
      el.classList.toggle('dirty', el.innerHTML !== base.get(el));
      const link = tocLinkFor(el);         // 목차는 h2를 읽어 만들어졌으니 함께 따라간다
      if (link) link.textContent = el.textContent.trim();
      refresh();
    });
  });

  toggle.addEventListener('click', () => {
    editing = !editing;
    document.documentElement.classList.toggle('ex-editing', editing);
    toggle.classList.toggle('on', editing);
    toggle.title = editing ? '편집 끄기' : '편집';
    targets.forEach((el) => {
      if (editing) el.setAttribute('contenteditable', 'true');
      else el.removeAttribute('contenteditable');
    });
    say(editing ? '문장을 눌러 고칩니다. ⌘S로 저장합니다.' : '');
  });

  const save = async () => {
    const edits = dirty().map((el) => ({
      orig: base.get(el), next: el.innerHTML, outer: outer.get(el), at: at.get(el),
    }));
    if (!edits.length) return;
    saveBtn.disabled = true;
    say('저장하는 중…');
    try {
      const res = await fetch('/__save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: location.pathname, edits }),
      });
      const out = await res.json();
      if (!res.ok) { say(out.error || ('저장 실패 ' + res.status), true); refresh(); return; }
      dirty().forEach((el) => { base.set(el, el.innerHTML); el.classList.remove('dirty'); });
      say(out.applied + '곳을 파일에 썼습니다.');
      setTimeout(() => say(editing ? '문장을 눌러 고칩니다. ⌘S로 저장합니다.' : ''), 2600);
    } catch (err) {
      say('서버에 닿지 못했습니다 — ' + err.message, true);
    }
    refresh();
  };

  saveBtn.addEventListener('click', save);

  /* 상단의 인쇄 버튼을 실제 내보내기로 갈아 끼웁니다. 브라우저의 인쇄 대화상자는
     머리말 · 쪽 번호 · 목차를 넣지 못하므로, 서버가 같은 저장소의 내보내기
     스크립트를 돌려 제출용 PDF를 만들어 보냅니다. 서버가 없으면 이 자리가
     그대로 인쇄 대화상자로 남습니다. */
  const printBtn = [...document.querySelectorAll('.topbar button')]
    .find((b) => /인쇄|PDF/.test(b.textContent));
  if (printBtn) {
    printBtn.textContent = 'PDF로 저장';
    printBtn.onclick = null;
    printBtn.addEventListener('click', async () => {
      if (printBtn.disabled) return;
      const was = 'PDF로 저장';
      printBtn.disabled = true;
      printBtn.textContent = '만드는 중…';
      say('표지 · 목차 · 쪽 번호를 넣어 PDF를 만듭니다.');
      progress(0.06);
      try {
        const start = await fetch('/__pdf', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: location.pathname }),
        });
        const begun = await start.json();
        if (!start.ok || !begun.jobId) throw new Error(begun.error || ('시작 실패 ' + start.status));

        /* 막대는 시계가 아니라 **내보내기가 실제로 알려 준 차수**로 움직입니다.
           목차 쪽 번호가 멎을 때까지 여러 차례 찍으므로 차수가 곧 진행입니다. */
        let lines = [];
        for (;;) {
          await new Promise((r) => setTimeout(r, 400));
          const res = await fetch('/__pdf?id=' + begun.jobId);
          const st = await res.json();
          if (st.error) throw new Error(st.error);
          lines = st.lines || [];
          const passes = lines.filter((l) => /^[0-9]+차/.test(l));
          const last = passes[passes.length - 1];
          if (last) {
            say(last.includes('멎음') ? last + ' — 쪽 번호가 맞았습니다' : last + ' — 목차를 다시 잽니다');
            progress(Math.min(0.85, 0.15 + passes.length * 0.24));
          }
          if (st.done) break;
        }

        say('내려받는 중…');
        progress(0.93);
        const file = await fetch('/__pdf-file?id=' + begun.jobId);
        if (!file.ok) throw new Error(((await file.json()) || {}).error || '내려받기 실패');
        const blob = await file.blob();
        const name = decodeURIComponent(
          (file.headers.get('content-disposition') || '').split("UTF-8''")[1] || 'document.pdf');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
        progress(1);
        const size = Math.round(blob.size / 1024 / 1024 * 10) / 10;
        const pages = (lines.find((l) => l.includes('쪽 ·')) || '').match(/([0-9]+)쪽/);
        say(name + ' · ' + (pages ? pages[1] + '쪽 · ' : '') + size + 'MB 를 내려받았습니다.');
        setTimeout(() => { progress(null); say(editing ? '문장을 눌러 고칩니다. ⌘S로 저장합니다.' : ''); }, 4000);
      } catch (err) {
        progress(null);
        say('내보내기 실패 — ' + err.message, true);
      } finally {
        printBtn.disabled = false;
        printBtn.textContent = was;
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty().length) { e.preventDefault(); e.returnValue = ''; }
  });
})();
</script>
"""


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


class InnerRanges(HTMLParser):
    """`<main>` 안의 요소를 태그별 등장 순서로 세고, 원본에서 안쪽이 차지하는
    범위를 기억한다. 브라우저의 `querySelectorAll('*')`과 같은 순서다.

    끝 태그가 어긋나면 그 요소는 **범위를 남기지 않는다.** 알 수 없는 자리에
    쓰느니 실패하는 편이 낫다."""

    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0]
        for line in source.splitlines(keepends=True):
            self.lines.append(self.lines[-1] + len(line))
        self.ranges: dict[tuple[str, int], tuple[int, int]] = {}
        self._count: dict[str, int] = {}
        self._stack: list = []
        self._depth = 0          # <main> 안인지
        self.feed(source)

    def _pos(self) -> int:
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self._depth += 1
            return
        if self._depth == 0 or tag in VOID:
            return
        nth = self._count.get(tag, 0)
        self._count[tag] = nth + 1
        self._stack.append((tag, nth, self._pos() + len(self.get_starttag_text())))

    def handle_startendtag(self, tag, attrs):
        # <rect …/> 처럼 스스로 닫는 것. 셈에는 넣되 안쪽은 없다.
        if self._depth and tag != "main":
            self._count[tag] = self._count.get(tag, 0) + 1

    def handle_endtag(self, tag):
        if tag == "main":
            self._depth = max(0, self._depth - 1)
            return
        if self._depth == 0:
            return
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                open_tag, nth, inner_start = self._stack[i]
                self.ranges[(open_tag, nth)] = (inner_start, self._pos())
                del self._stack[i:]          # 그 위에 열린 것들은 짝을 잃었다 — 버린다
                return


def _inner_at(ranges: dict, where: dict):
    """자리로 원본의 안쪽 범위를 집는다. 못 집으면 None."""
    if not where:
        return None
    key = (str(where.get("tag", "")).lower(), int(where.get("nth", -1)))
    return ranges.get(key)


def _swap_nbsp(text: str, to_entity: bool) -> str:
    return text.replace(" ", "&nbsp;") if to_entity else text.replace("&nbsp;", " ")


def apply_edits(source: str, edits: list) -> tuple[str, list]:
    """고친 조각을 원본에 반영한다. 하나라도 어긋나면 아무것도 쓰지 않는다.

    찾는 순서는 **자리 → 내용**이다. 자리로 집으면 같은 글이 표에 몇 군데 있든
    상관없고, 내용은 「그 사이 파일이 바뀌지 않았는가」를 확인하는 데만 쓴다.
    자리를 못 집는 문서(끝 태그가 어긋난 경우)에서만 내용으로 찾는다.
    """
    failures: list[str] = []
    ranges = InnerRanges(source).ranges
    placed: list[tuple[int, int, str]] = []      # 자리로 집은 것
    leftover: list[tuple[int, str, str, str]] = []  # 내용으로 찾아야 하는 것

    for index, edit in enumerate(edits):
        orig, nxt = edit.get("orig", ""), edit.get("next", "")
        if orig == nxt:
            continue
        # contenteditable은 닫는 태그 앞 들여쓰기를 없애 버린다. 화면에는 보이지
        # 않지만 파일에서는 줄이 통째로 바뀐 것처럼 보이므로, 원본의 앞뒤 공백을
        # 그대로 씌워 diff에 **고친 문장만** 남게 한다.
        nxt = re.match(r"\s*", orig).group(0) + nxt.strip() + re.search(r"\s*\Z", orig).group(0)

        span = _inner_at(ranges, edit.get("at"))
        if span is None:
            leftover.append((index, orig, nxt, edit.get("outer") or ""))
            continue

        begin, finish = span
        if source[begin:finish] in (orig, _swap_nbsp(orig, True), _swap_nbsp(orig, False)):
            placed.append((begin, finish, nxt))
            continue
        head = " ".join(orig.split())[:40]
        failures.append(
            f"{index + 1}번째 — 그 사이 파일이 바뀌었습니다. 새로고침하고 다시 고치십시오: 「{head}」"
        )

    # 앞에서부터 쓰면 뒤쪽 범위가 밀린다. 뒤에서부터 쓴다.
    out = source
    for begin, finish, text in sorted(placed, reverse=True):
        out = out[:begin] + text + out[finish:]

    for index, orig, nxt, outer in leftover:
        pairs = [(orig, nxt)]
        if outer and orig in outer:
            pairs.append((outer, outer.replace(orig, nxt, 1)))
        for needle, replacement in pairs:
            # 브라우저는 &nbsp;를 실제 문자로 돌려주고 원본은 엔티티로 적혀 있을 수 있다.
            hit = next(
                (c for c in (needle, _swap_nbsp(needle, True), _swap_nbsp(needle, False))
                 if out.count(c) == 1),
                None,
            )
            if hit is not None:
                out = out.replace(hit, replacement, 1)
                break
        else:
            head = " ".join(orig.split())[:60]
            seen = out.count(orig)
            reason = "찾지 못했습니다" if seen == 0 else f"{seen}군데가 똑같아 어느 쪽인지 모릅니다"
            failures.append(f"{index + 1}번째 — 파일에서 {reason}: 「{head}」")

    return out, failures


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):  # 조용히 — 저장 결과만 알린다
        pass

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _resolve(self, url_path: str) -> Path | None:
        rel = urllib.parse.unquote(urllib.parse.urlsplit(url_path).path).lstrip("/")
        target = (ROOT / posixpath.normpath(rel)).resolve()
        if ROOT not in target.parents or target.suffix != ".html" or not target.is_file():
            return None
        return target

    def do_POST(self):
        if self.path == "/__pdf":
            self._export_pdf()
            return
        if self.path != "/__save":
            self.send_error(404)
            return
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            payload = json.loads(raw)
            target = self._resolve(payload["path"])
            if target is None:
                self._json(400, {"error": "저장소 안의 .html 파일이 아닙니다"})
                return

            source = target.read_text(encoding="utf-8")
            updated, failures = apply_edits(source, payload.get("edits", []))
            if failures:
                self._json(409, {"error": "아무것도 쓰지 않았습니다 · " + " / ".join(failures)})
                print(f"거절 {target.relative_to(ROOT)} — {failures}", flush=True)
                return

            tmp = target.with_suffix(".html.tmp")
            tmp.write_text(updated, encoding="utf-8")
            os.replace(tmp, target)
            applied = sum(1 for e in payload["edits"] if e.get("orig") != e.get("next"))
            print(f"저장 {target.relative_to(ROOT)} — {applied}곳", flush=True)
            self._json(200, {"applied": applied})
        except Exception as err:  # noqa: BLE001 — 무엇이 터지든 브라우저가 이유를 받아야 한다
            self._json(500, {"error": f"{type(err).__name__}: {err}"})

    def _export_pdf(self):
        """브라우저의 인쇄 대화상자는 머리말 · 쪽 번호 · 목차를 넣지 못한다. 그래서
        같은 저장소의 내보내기 스크립트를 돌린다. 목차 쪽 번호를 맞추느라 여러 차례
        찍으므로 시간이 걸린다 — **작업 번호만 먼저 돌려주고**, 진행은 스크립트가
        내놓는 줄을 그대로 물어보게 한다. 가짜로 채우는 막대를 만들지 않기 위해서다."""
        import subprocess, threading, uuid

        try:
            payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            target = self._resolve(payload["path"])
            if target is None:
                self._json(400, {"error": "저장소 안의 .html 파일이 아닙니다"})
                return
        except Exception as err:  # noqa: BLE001
            self._json(400, {"error": f"{type(err).__name__}: {err}"})
            return

        rel = str(target.relative_to(ROOT))
        job_id = uuid.uuid4().hex
        job = JOBS[job_id] = {"lines": [], "done": False, "error": None, "pdf": target.with_suffix(".pdf")}

        def run():
            print(f"PDF 만드는 중 — {rel}", flush=True)
            try:
                proc = subprocess.Popen(
                    ["node", "scripts/doc-pdf.mjs", rel],
                    cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
                for line in proc.stdout:
                    line = line.strip()
                    if line:
                        job["lines"].append(line)
                        print(f"  {line}", flush=True)
                if proc.wait() != 0:
                    job["error"] = "\n".join(job["lines"][-4:]) or "내보내기가 실패했습니다"
                elif not job["pdf"].is_file():
                    job["error"] = "PDF가 만들어지지 않았습니다"
            except Exception as err:  # noqa: BLE001
                job["error"] = f"{type(err).__name__}: {err}"
            finally:
                job["done"] = True

        threading.Thread(target=run, daemon=True).start()
        self._json(202, {"jobId": job_id})

    def _export_status(self, job_id):
        job = JOBS.get(job_id)
        if job is None:
            self._json(404, {"error": "그런 작업이 없습니다"})
            return
        self._json(200, {"lines": job["lines"], "done": job["done"], "error": job["error"]})

    def _export_file(self, job_id):
        job = JOBS.get(job_id)
        if job is None or not job["done"] or job["error"]:
            self._json(409, {"error": (job or {}).get("error") or "아직 끝나지 않았습니다"})
            return
        blob = job["pdf"].read_bytes()
        name = urllib.parse.quote(job["pdf"].name)
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{name}")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)
        print(f"보냄 {job['pdf'].name} · {len(blob) // 1024}KB", flush=True)
        JOBS.pop(job_id, None)

    def do_GET(self):
        parts = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parts.query)
        if parts.path == "/__pdf":
            self._export_status((query.get("id") or [""])[0])
            return
        if parts.path == "/__pdf-file":
            self._export_file((query.get("id") or [""])[0])
            return
        super().do_GET()

    def send_head(self):
        """HTML에만 편집기를 끼워 넣는다. 파일은 그대로 둔다."""
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not path.endswith(".html") or not os.path.isfile(path):
            return super().send_head()

        body = Path(path).read_text(encoding="utf-8")
        marker = "</body>"
        body = body.replace(marker, EDITOR + marker, 1) if marker in body else body + EDITOR
        blob = body.encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(blob)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        return io.BytesIO(blob)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"docs → http://localhost:{PORT}/docs/  (편집 켜짐 · Ctrl-C로 멈춤)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
