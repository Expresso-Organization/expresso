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

PREVIOUS="$(git rev-parse HEAD)"
echo "현재 커밋 $PREVIOUS"

# 되돌릴 때 쓸 커밋을 남긴다. 롤백은 이 파일 하나만 보면 된다.
echo "$PREVIOUS" > "$ROOT/.last-deployed-commit"

git fetch origin main
git checkout --detach "$TARGET"
echo "배포 대상 $(git rev-parse HEAD)"

pnpm install --frozen-lockfile

# 웹과 백엔드가 계약의 타입을 그대로 쓴다. 순서를 바꾸면 빌드가 깨진다.
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

# 새 편집기는 명시적으로 true를 넣기 전까지 API·WebSocket 등록을 열지 않는다.
# 기존 서버의 .env에는 이 줄이 없을 수 있으므로 배포 중 기본값을 안전하게 보완한다.
if ! grep -q '^CAREER_EDITOR_V2_ENABLED=' services/backend/.env; then
  echo 'CAREER_EDITOR_V2_ENABLED=false' >> services/backend/.env
fi

pnpm --filter @expresso/backend build

# NEXT_PUBLIC_* 은 빌드 시점에 번들로 치환돼 들어간다. start 앞에 붙이면 늦다.
NEXT_PUBLIC_API_BASE_URL="$SITE_URL" pnpm --filter @expresso/web build

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

sudo systemctl restart expresso-web

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
if [ "$home_code" != "307" ]; then
  echo "경고: /home 이 307이 아닙니다. proxy.ts가 걸리지 않았을 수 있습니다" >&2
fi

echo "배포 완료 $(git rev-parse --short HEAD) (이전 ${PREVIOUS:0:7})"
