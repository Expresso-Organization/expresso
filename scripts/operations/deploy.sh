#!/usr/bin/env bash
#
# expresso.ai.kr 배포. 서버에서 실행한다 — 사람이 SSH로 들어와서든,
# GitHub Actions가 SSH로 부르든 같은 스크립트를 쓴다.
#
# 서버는 ubuntu 사용자의 홈에 있다(/home/ubuntu/expresso). 위치·포트·node
# 자리는 모두 아래에서 환경 변수로 덮을 수 있다.
#
#   scripts/operations/deploy.sh [커밋-ish]
#
# 인자가 없으면 origin/main의 최신 커밋으로 간다.
set -euo pipefail

ROOT="${EXPRESSO_ROOT:-/home/ubuntu/expresso}"
SITE_URL="${EXPRESSO_SITE_URL:-https://expresso.ai.kr}"
TARGET="${1:-origin/main}"

# 서비스가 듣는 자리. nginx가 /v1은 API로, 나머지는 웹으로 보낸다.
# infra/nginx/expresso.ai.kr.conf 와 같은 숫자여야 한다.
API_PORT="${EXPRESSO_API_PORT:-4500}"
WEB_PORT="${EXPRESSO_WEB_PORT:-3500}"

# nvm은 로그인 셸에서만 PATH에 붙어서, Actions가 SSH로 부르면 node가 없다.
# 그래서 자리를 직접 적는다. **infra/systemd/*.service 의 ExecStart 와 같은
# 버전이어야 한다** — 여기만 올리면 배포는 새 node로 짓고 서비스는 옛 node로
# 돈다. nvm의 default 별칭(22)은 일부러 쓰지 않는다.
NODE_BIN="${EXPRESSO_NODE_BIN:-/home/ubuntu/.nvm/versions/node/v24.13.1/bin}"
export PATH="$NODE_BIN:$PATH"

if ! command -v pnpm > /dev/null; then
  echo "pnpm을 찾지 못했습니다 — NODE_BIN=$NODE_BIN 이 맞는지 확인하세요" >&2
  exit 1
fi

cd "$ROOT"

# 새 스크립트로 다시 시작한 경우에는 이미 새 커밋에 있으므로, 배포 전 커밋을 넘겨받는다.
PREVIOUS="${EXPRESSO_DEPLOY_PREVIOUS:-$(git rev-parse HEAD)}"
echo "현재 커밋 $PREVIOUS"

# 되돌릴 때 쓸 커밋을 남긴다. 롤백은 이 파일 하나만 보면 된다.
echo "$PREVIOUS" > "$ROOT/.last-deployed-commit"

git fetch origin main
# next build가 이 파일을 다시 쓴다. 지난 배포가 남긴 변경이 있으면 이 파일이 바뀐 커밋으로 넘어가지 못한다.
git checkout -- services/web/next-env.d.ts
git checkout --detach "$TARGET"
echo "배포 대상 $(git rev-parse HEAD)"

# git은 checkout할 때 파일을 지우고 새로 만든다. 지금 도는 bash는 열어 둔 이전 파일을
# 끝까지 읽으므로, 그대로 이어 가면 이 커밋이 바꾼 배포 단계가 이번 배포에서 돌지 않는다.
# 처음 실행이면 배포할 커밋의 스크립트로 처음부터 다시 시작한다.
if [ -z "${EXPRESSO_DEPLOY_REEXEC:-}" ]; then
  echo "새 배포 스크립트로 다시 시작"
  EXPRESSO_DEPLOY_REEXEC=1 EXPRESSO_DEPLOY_PREVIOUS="$PREVIOUS" \
    exec bash "$ROOT/scripts/operations/deploy.sh" "$(git rev-parse HEAD)"
fi

# 커밋 사이에서 워크스페이스가 추가되면 pnpm이 기존 importer 연결을 그대로 둔 채
# 설치 완료로 판단할 수 있다. 공용 저장소는 유지하고 다시 만들 수 있는 연결만 비운다.
rm -rf -- \
  "$ROOT/packages/contracts/node_modules" \
  "$ROOT/packages/database/node_modules" \
  "$ROOT/packages/editor/node_modules" \
  "$ROOT/services/backend/node_modules" \
  "$ROOT/services/web/node_modules"
pnpm install --frozen-lockfile

# 워커가 생성한 지면을 재는 브라우저입니다. 백엔드의 playwright 판에 맞는 chromium-headless-shell만 받습니다.
# 이미 받은 판이면 건너뜁니다. 시스템 라이브러리와 한국어 폰트는 처음 한 번 설치합니다
# — docs/operations/DEPLOYMENT.md 「측정 브라우저」.
pnpm --filter @expresso/backend exec playwright install --only-shell chromium

# 계약이 편집기의 문서 타입을, 웹과 백엔드가 계약의 타입을 그대로 쓴다.
# 이 의존 순서를 바꾸면 깨끗한 서버 체크아웃에서 빌드가 깨진다.
pnpm --filter @expresso/editor build
pnpm --filter @expresso/contracts build
pnpm --filter @expresso/database build

# MongoDB replica set과 제한된 runtime/migration 계정을 먼저 준비한다. 기존
# MySQL volume은 이 절차에서 참조하거나 삭제하지 않는다.
COMPOSE_ENV_ARGS=()
if [ -f infra/.env ]; then COMPOSE_ENV_ARGS=(--env-file infra/.env); fi
docker compose -f infra/compose.server.yaml "${COMPOSE_ENV_ARGS[@]}" up -d --wait mongodb redis
docker compose -f infra/compose.server.yaml "${COMPOSE_ENV_ARGS[@]}" run --rm mongodb-init

# schema 변경은 migration 계정으로만 수행한다. runtime 계정에는 DDL 권한이 없다.
if [ -z "${MONGODB_MIGRATE_URL:-}" ] && ! grep -q '^MONGODB_MIGRATE_URL=' services/backend/.env; then
  echo "services/backend/.env에 MONGODB_MIGRATE_URL이 필요합니다" >&2
  exit 1
fi
pnpm db:migrate

pnpm --filter @expresso/backend build

# 웹은 운영 웹이 쓰지 않는 폴더(.next-build)에 짓는다. 운영 .next를 그 자리에서 다시 지으면
# 빌드하는 1~2분 동안 /_next/static 요청이 500을 내고 모든 화면이 오류 경계로 넘어간다
# (2026-11-10 #186·#187 배포). 빌드가 실패해도 운영 .next는 그대로 남는다.
# 이름을 바꿔도 되는 근거: next start는 요청마다 서버의 실제 distDir로 덮어쓴다
# (next/dist/server/route-modules/route-module.js, Next 16.3.0).
WEB_DIR="$ROOT/services/web"
rm -rf -- "$WEB_DIR/.next-build"
mkdir -p "$WEB_DIR/.next-build"
# Turbopack 빌드 캐시를 이어 쓴다. 같은 파일 시스템의 rename이라 운영 웹은 영향이 없고,
# 이미지 캐시가 필요하면 .next/cache를 다시 만든다.
if [ -d "$WEB_DIR/.next/cache" ]; then
  mv "$WEB_DIR/.next/cache" "$WEB_DIR/.next-build/cache"
fi

# NEXT_PUBLIC_* 은 빌드 시점에 번들로 치환돼 들어간다. start 앞에 붙이면 늦다.
NEXT_DIST_DIR=.next-build NEXT_PUBLIC_API_BASE_URL="$SITE_URL" pnpm --filter @expresso/web build

# 배포 전에 열어 둔 탭은 이전 판 JS를 요청한다. 없으면 404로 오류 화면이 나므로 함께 남긴다.
# 새 판에 없는 파일만 복사한다. cp -p로 원래 수정 시각을 지켜 아래 7일 정리가 오래된 것만 지운다.
# cp -n은 쓰지 않는다 — 건너뛴 파일이 있을 때 종료 코드가 coreutils 판과 macOS에서 서로 다르다.
if [ -d "$WEB_DIR/.next/static" ]; then
  (cd "$WEB_DIR/.next/static" && find . -type f) | while IFS= read -r file; do
    if [ ! -e "$WEB_DIR/.next-build/static/$file" ]; then
      mkdir -p "$(dirname "$WEB_DIR/.next-build/static/$file")"
      cp -p "$WEB_DIR/.next/static/$file" "$WEB_DIR/.next-build/static/$file"
    fi
  done
fi

# 큐 소비자를 먼저 올려 새 스키마의 작업을 받을 수 있게 한 뒤 API를 바꾼다.
sudo systemctl restart expresso-worker
sudo systemctl restart expresso-api

# API가 실제로 준비될 때까지 기다린다. ready는 rs0 primary·schema·Redis를 함께 본다.
for attempt in $(seq 1 30); do
  # 첫 시도는 아직 안 뜬 API에 붙으므로 거의 늘 실패한다. curl의 오류 문구까지
  # 버린다 — 정상인 자리에 "Connection refused"가 찍히면 배포 로그를 읽는 사람이
  # 매번 멈춰 선다.
  if curl -fsS --max-time 5 "http://127.0.0.1:$API_PORT/health/ready" > /dev/null 2>&1; then
    echo "API 준비됨 (시도 $attempt)"
    break
  fi
  if [ "$attempt" = "30" ]; then
    echo "API가 60초 안에 준비되지 않았습니다" >&2
    journalctl -u expresso-api -n 40 --no-pager >&2 || true
    exit 1
  fi
  sleep 2
done

# 멈춘 뒤 바꾼다. 먼저 바꾸면 아직 도는 옛 프로세스가 새 판 서버 파일을 읽는다.
# 직전 판은 .next-prev로 남긴다 — 되돌리기는 DEPLOYMENT.md 「실패와 복구」.
sudo systemctl stop expresso-web
rm -rf -- "$WEB_DIR/.next-prev"
if [ -d "$WEB_DIR/.next" ]; then
  mv "$WEB_DIR/.next" "$WEB_DIR/.next-prev"
fi
mv "$WEB_DIR/.next-build" "$WEB_DIR/.next"
sudo systemctl start expresso-web
# 이전 판에서 넘어온 정적 파일은 7일까지만 둔다. 이번 판 파일은 방금 만들어져 지워지지 않는다.
find "$WEB_DIR/.next/static" -type f -mtime +7 -delete

for attempt in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$WEB_PORT/login" || true)"
  if [ "$code" = "200" ]; then
    echo "웹 준비됨 (시도 $attempt)"
    break
  fi
  if [ "$attempt" = "30" ]; then
    echo "웹이 60초 안에 준비되지 않았습니다 (마지막 HTTP $code)" >&2
    journalctl -u expresso-web -n 40 --no-pager >&2 || true
    exit 1
  fi
  sleep 2
done

# 바깥에서 본 모습까지 확인한다. nginx 라우팅이 틀리면 여기서 걸린다.
login_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SITE_URL/login")"
home_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SITE_URL/home")"
echo "$SITE_URL/login → $login_code"
echo "$SITE_URL/home  → $home_code (세션 없이 307이 정상)"

if [ "$login_code" != "200" ]; then
  echo "로그인 화면이 200이 아닙니다 — nginx 설정을 확인하세요" >&2
  exit 1
fi
# 커리어 본문 저장은 /v1/ 아래 WebSocket이다. nginx가 Upgrade를 넘기지 않으면 101 대신 404가 온다.
# --http1.1이 필요하다. HTTP/2로 협상되면 Upgrade 헤더가 무효라 늘 404다.
ws_code="$(curl --http1.1 -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H "Origin: $SITE_URL" \
  "$SITE_URL/v1/career/records/00000000-0000-4000-8000-000000000000/session" || true)"
echo "$SITE_URL/v1/…/session (WebSocket) → $ws_code (101이 정상)"
if [ "$ws_code" != "101" ]; then
  echo "커리어 본문 저장 WebSocket이 열리지 않습니다 — nginx location /v1/의 Upgrade 헤더를 확인하세요" >&2
  exit 1
fi
if [ "$home_code" != "307" ]; then
  echo "경고: /home 이 307이 아닙니다. proxy.ts가 걸리지 않았을 수 있습니다" >&2
fi

echo "배포 완료 $(git rev-parse --short HEAD) (이전 ${PREVIOUS:0:7})"
