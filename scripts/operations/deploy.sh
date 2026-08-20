#!/usr/bin/env bash
#
# expresso.ai.kr 배포. 서버에서 실행한다 — 사람이 SSH로 들어와서든,
# GitHub Actions가 SSH로 부르든 같은 스크립트를 쓴다.
#
#   scripts/operations/deploy.sh [커밋-ish]
#
# 인자가 없으면 origin/main의 최신 커밋으로 간다.
set -euo pipefail

ROOT="${EXPRESSO_ROOT:-/opt/expresso}"
SITE_URL="${EXPRESSO_SITE_URL:-https://expresso.ai.kr}"
TARGET="${1:-origin/main}"

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

# expand-only 마이그레이션만 여기서 돈다. 파괴적 변경은 STAGED_ROLLOUT.md를 따른다.
pnpm db:migrate

pnpm --filter @expresso/backend build

# NEXT_PUBLIC_* 은 빌드 시점에 번들로 치환돼 들어간다. start 앞에 붙이면 늦다.
NEXT_PUBLIC_API_BASE_URL="$SITE_URL" pnpm --filter @expresso/web build

# 큐 소비자를 먼저 올려 새 스키마의 작업을 받을 수 있게 한 뒤 API를 바꾼다.
sudo systemctl restart expresso-worker
sudo systemctl restart expresso-api

# API가 실제로 준비될 때까지 기다린다. ready는 PostgreSQL과 Redis를 함께 본다.
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:4000/health/ready > /dev/null; then
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
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login || true)"
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
