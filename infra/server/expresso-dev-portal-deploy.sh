#!/usr/bin/env bash
#
# dev.expresso.ai.kr 발행 — 서버에 놓이는 쪽.
#
# 서버 사본: /usr/local/bin/expresso-dev-portal-deploy
#
# GitHub Actions 가 배포 키로 접속하면 authorized_keys 의 `command=` 가 이 스크립트만
# 실행한다. 그 키로는 셸이 열리지 않는다 — 이 기계는 남의 서비스가 함께 도는
# 공용이라, CI 에 셸을 주지 않는다.
#
# 요청한 명령은 SSH_ORIGINAL_COMMAND 로 들어온다. 거기서 커밋 해시만 받고,
# 해시가 아니면 아무것도 하지 않는다 — 바깥에서 온 문자열을 셸에 그대로 넘기지
# 않기 위해서다.
#
# 포털용 클론(`~/expresso-dev-portal`)을 쓴다. 제품이 도는 `~/expresso` 에서
# 브랜치를 오가면 돌고 있는 API·웹이 함께 흔들린다.

set -euo pipefail

REPO=/home/ubuntu/expresso-dev-portal
ROOT=/var/www/dev.expresso.ai.kr

ref="${SSH_ORIGINAL_COMMAND:-}"
ref="${ref##* }"

if ! [[ "$ref" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "커밋 해시를 받지 못했습니다: '${ref}'" >&2
  exit 2
fi

cd "$REPO"
git fetch --quiet --no-tags origin
git checkout --quiet --detach "$ref"

sudo rsync -a --delete "$REPO/docs/" "$ROOT/"
sudo chown -R www-data:www-data "$ROOT"

echo "발행 ${ref} · $(find "$ROOT" -type f | wc -l) 개 파일 · $(du -sh "$ROOT" | cut -f1)"
