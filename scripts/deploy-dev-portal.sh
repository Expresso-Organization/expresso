#!/usr/bin/env bash
#
# 개발 포털을 dev.expresso.ai.kr 에 손으로 올린다.
#
#   scripts/deploy-dev-portal.sh              # 지금 브랜치의 HEAD
#   scripts/deploy-dev-portal.sh <커밋|브랜치>  # 지정한 것
#
# 평소에는 이것을 부를 일이 없다 — `docs/` 를 고쳐 푸시하면 GitHub Actions
# (`.github/workflows/dev-portal-oracle.yml`)가 같은 일을 한다. 이 스크립트는
# 액션이 막혔을 때와, 푸시한 것이 정말 올라갔는지 확인할 때 쓴다.
#
# 서버는 origin 에서 당긴다. **밀어 넣지 않는다** — 커밋되지 않은 것은 올라가지
# 않는다. 발행되는 것은 항상 GitHub 에 있는 커밋이다.

set -euo pipefail

HOST="${DEV_PORTAL_HOST:-Oracle-Server}"
URL="${DEV_PORTAL_URL:-https://dev.expresso.ai.kr/}"
REF="${1:-HEAD}"

SHA=$(git rev-parse "$REF")

if ! git branch -r --contains "$SHA" 2>/dev/null | grep -q origin/; then
  echo "$SHA 가 origin 에 없습니다. 먼저 푸시하십시오." >&2
  exit 1
fi

echo "→ ${HOST} 가 ${SHA:0:12} 를 당겨 발행합니다"
ssh "$HOST" "SSH_ORIGINAL_COMMAND='deploy $SHA' /usr/local/bin/expresso-dev-portal-deploy" \
  | sed 's/^/   /'

echo "→ 확인"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL")
echo "   HTTP $code  $URL"
[ "$code" = "200" ] || { echo "200 이 아닙니다"; exit 1; }
