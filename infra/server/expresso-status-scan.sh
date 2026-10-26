#!/usr/bin/env bash
#
# 개발 현황 스캔 — 서버에 놓이는 쪽. systemd 타이머(expresso-status-scan.timer)가 15분마다 부른다.
#
# 서버 사본: /usr/local/bin/expresso-status-scan
#
# 스캔 전용 클론(~/expresso-status-scan)을 origin/main 으로 맞추고, 그 클론 안의 스캐너
# (services/dev-portal/status/scanner/main.ts)를 돌린다. 스캐너 코드도 main 에서 오므로
# 스캐너를 고쳐 머지하면 다음 실행부터 바뀐다.
#
# 제품이 도는 ~/expresso 와 포털 발행용 ~/expresso-dev-portal 은 건드리지 않는다 —
# 거기서 브랜치를 오가면 돌고 있는 서비스와 공개된 문서가 함께 흔들린다.
#
# 결과는 /var/lib/expresso-status 에 쓴다. 포털 웹루트는 발행 때마다 rsync --delete 로
# 덮이므로 그 밖에 두고, nginx 가 /status/data/ 로 내보낸다(infra/nginx/dev.expresso.ai.kr.conf).
set -euo pipefail

CLONE="${STATUS_SCAN_CLONE:-/home/ubuntu/expresso-status-scan}"
OUT="${STATUS_SCAN_OUT:-/var/lib/expresso-status}"
NODE="${STATUS_SCAN_NODE:-/home/ubuntu/.nvm/versions/node/v24.13.1/bin}"
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
# 스캐너가 쓰는 의존성(zod)은 이 폴더의 독립 잠금 파일에서 온다. 잠금 파일이 바뀌었을 때만 설치한다.
if [ ! -d "$APP/node_modules" ] || ! git diff --quiet "$before" HEAD -- services/dev-portal/status/pnpm-lock.yaml; then
  (cd "$APP" && pnpm install --frozen-lockfile --silent)
fi

cd "$APP"
exec node scanner/main.ts --repo "$CLONE" --out "$OUT" --no-fetch "$@"
