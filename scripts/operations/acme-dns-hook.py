#!/usr/bin/env python3
"""인증 전용 acme-dns CNAME의 TXT 값을 갱신하는 Certbot 훅."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

DOMAIN = "expresso.ai.kr"
ENDPOINT = "https://auth.acme-dns.io/update"
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}\Z")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def update_token(config, domain, token, opener=None):
    if domain not in (DOMAIN, "*." + DOMAIN) or not TOKEN.fullmatch(token):
        raise ValueError("인증 도메인 또는 토큰 형식이 올바르지 않습니다")
    if not config["fulldomain"].endswith(".auth.acme-dns.io"):
        raise ValueError("승인된 인증 DNS 영역이 아닙니다")
    payload = json.dumps({"subdomain": config["subdomain"], "txt": token}).encode()
    req = urllib.request.Request(ENDPOINT, data=payload, headers={"Content-Type": "application/json", "X-Api-User": config["username"], "X-Api-Key": config["password"]})
    opener = opener or urllib.request.build_opener(NoRedirect())
    with opener.open(req, timeout=15) as response:
        result = json.load(response)
    if result.get("txt") != token:
        raise RuntimeError("DNS 서비스가 토큰 저장을 확인하지 않았습니다")


def wait_for_dns(token):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        result = subprocess.run(["dig", "+time=2", "+tries=1", "+short", "@1.1.1.1", "_acme-challenge." + DOMAIN, "TXT"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and token in [x.strip('"') for x in result.stdout.splitlines()]:
            return
        time.sleep(5)
    raise RuntimeError("인증 DNS 전파를 확인하지 못했습니다")


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("auth", "cleanup"):
        raise ValueError("auth 또는 cleanup을 지정하세요")
    # acme-dns는 최근 두 공개 검증값을 유지한다. cleanup으로 다른 도전을 덮어쓰지 않는다.
    if sys.argv[1] == "cleanup":
        return
    config_file = Path("/etc/expresso-acme-dns.json")
    if config_file.is_symlink() or config_file.stat().st_mode & 0o077:
        raise PermissionError("인증 DNS 키 파일은 일반 파일·소유자 전용 권한이어야 합니다")
    token = os.environ["CERTBOT_VALIDATION"]
    update_token(json.loads(config_file.read_text()), os.environ["CERTBOT_DOMAIN"], token)
    wait_for_dns(token)


if __name__ == "__main__":
    main()
