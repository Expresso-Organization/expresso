#!/usr/bin/env bash
set -euo pipefail
ROOT="${EXPRESSO_ROOT:-/home/ubuntu/expresso}"
MODEL_ROOT="${EXPRESSO_MATCH_ROOT:-$ROOT/var/match-model}"
STATE_DIR="${EXPRESSO_MATCH_STATE_DIR:-/var/lib/expresso-match}"
RELEASE="$(python3 "$ROOT/scripts/operations/match-release.py" --root "$MODEL_ROOT" verify current)"
EXTERNAL_ARGS=()
if [ "${EXPRESSO_MATCH_DECISIONS:-0}" = 1 ]; then
  if [ -z "${OPENAI_API_KEY:-}" ]; then echo 'Decisions 실행 환경의 키가 필요합니다' >&2; exit 1; fi
  EXTERNAL_ARGS=(--decisions-cache "$STATE_DIR/decisions" --policy "$RELEASE/evidence-policy.json")
fi
exec "$RELEASE/venv/bin/python" "$ROOT/services/match-inference/server.py" \
  --bundle "$RELEASE/cpu" --threads 1 --port "${EXPRESSO_MATCH_PORT:-4810}" --vector-dir "$STATE_DIR" "${EXTERNAL_ARGS[@]}"
