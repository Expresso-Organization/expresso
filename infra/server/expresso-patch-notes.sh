#!/usr/bin/env bash
#
# 패치노트 생성 — 서버에 놓이는 쪽. systemd 타이머(expresso-patch-notes.timer)가 15분마다 부른다.
#
# 서버 사본: /usr/local/bin/expresso-patch-notes
#
# 전용 클론(~/expresso-patch-notes)을 origin/main 으로 맞추고, 그 클론 안의 생성기
# (services/dev-portal/status/patch-notes/main.ts)를 돌린다. 생성기 · 정리본(seed.json) · 설정도
# main 에서 오므로 고쳐 머지하면 다음 실행부터 바뀐다.
#
# 진행 현황 스캔 클론(~/expresso-status-scan)과 나누지 않는다 — 두 타이머가 같은 클론에서 동시에
# checkout 하면 서로의 실행을 흔든다.
#
# 결과는 진행 현황과 같은 /var/lib/expresso-status 에 patch-notes.json 으로 쓴다. nginx 가
# /status/data/ 로 내보낸다(infra/nginx/dev.expresso.ai.kr.conf). nginx 는 바꾸지 않는다.
set -euo pipefail

CLONE="${PATCH_NOTES_CLONE:-/home/ubuntu/expresso-patch-notes}"
OUT="${PATCH_NOTES_OUT:-/var/lib/expresso-status}"
NODE="${PATCH_NOTES_NODE:-/home/ubuntu/.nvm/versions/node/v24.13.1/bin}"
export PATH="$NODE:/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"
export CLAUDE_CLI_PATH="${CLAUDE_CLI_PATH:-/home/ubuntu/.local/bin/claude}"

if [ ! -d "$CLONE/.git" ]; then
  git clone --quiet https://github.com/Expresso-Organization/expresso.git "$CLONE"
fi

cd "$CLONE"
git fetch --quiet --no-tags origin main
before=$(git rev-parse HEAD)
git checkout --quiet --detach origin/main
git reset --quiet --hard origin/main

APP="$CLONE/services/dev-portal/status"
# 생성기가 쓰는 의존성(zod)은 이 폴더의 독립 잠금 파일에서 온다. 잠금 파일이 바뀌었을 때만 설치한다.
if [ ! -d "$APP/node_modules" ] || ! git diff --quiet "$before" HEAD -- services/dev-portal/status/pnpm-lock.yaml; then
  (cd "$APP" && pnpm install --frozen-lockfile --silent)
fi

cd "$APP"
exec node patch-notes/main.ts --out "$OUT" "$@"
