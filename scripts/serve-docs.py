#!/usr/bin/env python3
"""docs/ 를 띄우고, 브라우저가 고친 문서를 그 자리에 저장해 주는 개발용 서버.

    python3 scripts/serve-docs.py          # http://127.0.0.1:8901
    python3 scripts/serve-docs.py 8080

`python3 -m http.server` 와 같은 정적 서버인데 PUT 을 하나 더 받습니다.
발표 자료의 편집 도구(docs/templates/deck-editor.js)가 「저장」을 누르면
자기 주소로 PUT 을 보내고, 이 서버가 그 파일을 덮어씁니다. 그래서 파일
선택 창이 뜨지 않고, 열어 둔 그 파일이 그대로 갱신됩니다.

이 서버가 없어도 편집은 됩니다 — 도구가 파일 선택으로 물러섭니다.

지키는 선
  · 127.0.0.1 에만 붙습니다. 밖에서 오는 요청을 받지 않습니다.
  · 저장 경로는 이 저장소 안으로 한정합니다. `..` 로 빠져나갈 수 없습니다.
  · `.html` 만 씁니다. 스크립트나 설정 파일은 이 길로 바뀌지 않습니다.
  · 임시 파일에 쓰고 바꿔치기합니다. 쓰다 끊겨도 원본이 반쯤 남지 않습니다.
"""

from __future__ import annotations

import os
import sys
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
WRITABLE_SUFFIXES = {".html"}
MAX_BYTES = 32 * 1024 * 1024



class Handler(SimpleHTTPRequestHandler):
    # 고친 것이 바로 보여야 합니다 — 캐시가 남으면 방금 저장한 것이 안 보입니다.
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def resolve(self) -> Path | None:
        """요청 주소를 저장소 안의 실제 경로로 옮깁니다. 밖이면 None."""
        rel = unquote(urlparse(self.path).path).lstrip("/")
        target = (ROOT / rel).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            return None
        return target

    def do_PUT(self) -> None:  # noqa: N802  (BaseHTTPRequestHandler 규약)
        target = self.resolve()
        if target is None:
            return self.fail(403, "저장소 밖입니다")
        if target.suffix.lower() not in WRITABLE_SUFFIXES:
            return self.fail(403, f"{target.suffix or '확장자 없음'} 은 이 길로 쓰지 않습니다")
        if not target.parent.is_dir():
            return self.fail(404, "폴더가 없습니다")

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self.fail(400, "내용이 비어 있습니다")
        if length > MAX_BYTES:
            return self.fail(413, "너무 큽니다")

        body = self.rfile.read(length)

        # 임시 파일에 먼저 쓰고 바꿔치기합니다 — 쓰다 끊겨도 원본이 살아 있습니다.
        fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".save-", suffix=target.suffix)
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(body)
            os.replace(tmp, target)
        except OSError as err:
            Path(tmp).unlink(missing_ok=True)
            return self.fail(500, str(err))

        self.log_message("저장 %s (%d bytes)", target.relative_to(ROOT), len(body))
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def fail(self, code: int, message: str) -> None:
        payload = message.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8901
    handler = partial(Handler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"  저장소   {ROOT}")
        print(f"  포털     http://127.0.0.1:{port}/docs/index.html?index")
        print("  저장     켜짐 — 편집 도구의 「저장」이 파일을 바로 덮습니다")
        print("  멈추기   Ctrl+C\n")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n  멈췄습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
