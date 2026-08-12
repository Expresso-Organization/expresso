#!/usr/bin/env python3
"""화면 정의서에서 화면 하나를 꺼내 보기 좋게 출력한다.

`docs/Expresso Screens.dc.html`는 29개 화면이 한 파일에 들어 있고 전부 인라인
스타일이라 그대로 읽기 어렵다. 화면 번호로 잘라서 들여쓰기해 준다.

    python3 scripts/extract-screen.py            # 화면 목록
    python3 scripts/extract-screen.py 05         # 05 내 커리어
    python3 scripts/extract-screen.py 05 -o /tmp # 파일로 저장

프론트엔드 화면을 새로 만들 때는 눈대중으로 다시 그리지 말고 여기서 꺼낸
마크업의 색·치수·문구를 그대로 옮긴다.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SCREENS = Path(__file__).resolve().parent.parent / "docs" / "Expresso Screens.dc.html"

# 스스로 닫는 태그. 들여쓰기 깊이를 늘리지 않는다.
VOID_TAGS = {
    "area", "base", "br", "circle", "col", "ellipse", "embed", "hr", "img",
    "input", "line", "link", "meta", "path", "polygon", "polyline", "rect",
    "source", "stop", "track", "use", "wbr",
}


def split_screens(source: str) -> dict[str, str]:
    marks = [
        (m.start(), m.group(1))
        for m in re.finditer(r'data-screen-label="([^"]+)"', source)
    ]
    screens: dict[str, str] = {}
    for index, (position, label) in enumerate(marks):
        end = marks[index + 1][0] if index + 1 < len(marks) else len(source)
        start = source.rfind("<div", 0, position)
        screens[label] = source[start:end]
    return screens


def pretty(html: str) -> str:
    lines = re.sub(r">\s*<", ">\n<", html).split("\n")
    out: list[str] = []
    depth = 0
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if re.match(r"</\w", line):
            depth = max(0, depth - 1)
        out.append("  " * depth + line)
        opening = re.match(r"<(\w[\w-]*)", line)
        if (
            opening
            and not line.startswith("</")
            and not line.endswith("/>")
            and opening.group(1).lower() not in VOID_TAGS
            and not re.search(rf"</{opening.group(1)}>$", line)
        ):
            depth += 1
    return "\n".join(out)


def title_of(chunk: str) -> str:
    heading = re.search(r"<h2[^>]*>(.*?)</h2>", chunk, re.S)
    note = re.search(r"</h2>\s*<span[^>]*>(.*?)</span>", chunk, re.S)
    parts = [
        re.sub(r"<[^>]+>", "", value.group(1)).strip()
        for value in (heading, note)
        if value
    ]
    return " — ".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("screen", nargs="?", help='화면 번호 (예: 00, 05, 10b)')
    parser.add_argument("-o", "--out-dir", help="파일로 저장할 디렉터리")
    args = parser.parse_args()

    if not SCREENS.exists():
        print(f"화면 정의서를 찾지 못했습니다: {SCREENS}", file=sys.stderr)
        return 1

    screens = split_screens(SCREENS.read_text(encoding="utf-8"))

    if not args.screen:
        for label, chunk in screens.items():
            print(f"{label:5} {title_of(chunk)}")
        return 0

    chunk = screens.get(args.screen)
    if chunk is None:
        print(
            f"화면 {args.screen}이(가) 없습니다. 사용 가능: {', '.join(screens)}",
            file=sys.stderr,
        )
        return 1

    rendered = pretty(chunk)
    if args.out_dir:
        target = Path(args.out_dir) / f"screen-{args.screen}.html"
        target.write_text(rendered, encoding="utf-8")
        print(target)
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
