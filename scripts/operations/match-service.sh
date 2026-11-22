#!/usr/bin/env bash
# 운영 배포에서만 호출합니다. prepare/verify는 match-release.py가 서비스 변경 없이 수행합니다.
set -euo pipefail
ROOT="${EXPRESSO_ROOT:-/home/ubuntu/expresso}"
MODEL_ROOT="${EXPRESSO_MATCH_ROOT:-$ROOT/var/match-model}"
SERVICE="${EXPRESSO_MATCH_SERVICE:-expresso-match-inference}"
API_SERVICE="${EXPRESSO_API_SERVICE:-expresso-api}"
WORKER_SERVICE="${EXPRESSO_WORKER_SERVICE:-expresso-worker}"
UNIT_DIR="${EXPRESSO_SYSTEMD_DIR:-/etc/systemd/system}"
UNIT_FILE="${EXPRESSO_MATCH_UNIT_FILE:-$ROOT/infra/systemd/expresso-match-inference.service}"
MODEL_URL="http://127.0.0.1:${EXPRESSO_MATCH_PORT:-4810}"
ENABLE_ARGS=()
if [ "$UNIT_DIR" = /run/systemd/system ]; then ENABLE_ARGS=(--runtime); fi
TOOL="$ROOT/scripts/operations/match-release.py"
NODE="${EXPRESSO_NODE_BIN:-/home/ubuntu/.nvm/versions/node/v24.13.1/bin}/node"
COMMAND="${1:?activate RELEASE 또는 rollback 필요}"
TARGET="${2:-previous}"
exec 9>"$MODEL_ROOT/.activate.lock"
flock -n 9 || { echo '다른 모델 전환이 진행 중입니다' >&2; exit 1; }
if [ "$COMMAND" = disable ]; then
  sudo systemctl disable --now "$SERVICE"
  sudo rm -f "$UNIT_DIR/$API_SERVICE.service.d/30-match-model.conf" "$UNIT_DIR/$WORKER_SERVICE.service.d/30-match-model.conf"
  rm -f "$MODEL_ROOT/current" "$MODEL_ROOT/runtime.conf"
  sudo systemctl daemon-reload
  echo '모델 비활성화 완료: API·Worker 재시작 후 기존 추천 사용'
  exit 0
fi
if [ "$COMMAND" = rollback ]; then COMMAND=activate; TARGET=previous; fi
if [ "$COMMAND" != activate ]; then echo 'activate 또는 rollback 필요' >&2; exit 2; fi

# 전환 전에 파일·환경을 검사합니다. 실패하면 서비스와 current를 그대로 둡니다.
python3 "$TOOL" --root "$MODEL_ROOT" verify "$TARGET" > /dev/null
OLD=""
if [ -L "$MODEL_ROOT/current" ]; then OLD="$(readlink -f "$MODEL_ROOT/current")"; fi

recover() {
  code="${1:-$?}"
  trap - ERR INT TERM HUP
  echo '모델 활성화 실패: 직전 배포본 복원' >&2
  if [ -n "$OLD" ]; then
    python3 "$TOOL" --root "$MODEL_ROOT" switch "$(basename "$OLD")" || true
    sudo systemctl restart "$SERVICE" || true
  else
    rm -f "$MODEL_ROOT/current"
    sudo systemctl disable --now "$SERVICE" || true
    sudo rm -f "$UNIT_DIR/$API_SERVICE.service.d/30-match-model.conf" "$UNIT_DIR/$WORKER_SERVICE.service.d/30-match-model.conf"
    rm -f "$MODEL_ROOT/runtime.conf"
    sudo systemctl daemon-reload || true
  fi
  exit "$code"
}
trap recover ERR
trap 'recover 130' INT
trap 'recover 143' TERM
trap 'recover 129' HUP
python3 "$TOOL" --root "$MODEL_ROOT" switch "$TARGET" > /dev/null
sudo install -m 644 "$UNIT_FILE" "$UNIT_DIR/$SERVICE.service"
printf 'MATCH_MODEL_URL=%s\n' "$MODEL_URL" > "$MODEL_ROOT/runtime.conf"
for app in "$API_SERVICE" "$WORKER_SERVICE"; do
  sudo install -d "$UNIT_DIR/$app.service.d"
  printf '[Service]\nEnvironmentFile=%s/runtime.conf\n' "$MODEL_ROOT" | \
    sudo tee "$UNIT_DIR/$app.service.d/30-match-model.conf" > /dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable "${ENABLE_ARGS[@]}" "$SERVICE"
sudo systemctl restart "$SERVICE"
healthy=false
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 2 "$MODEL_URL/health" > /dev/null 2>&1; then healthy=true; break; fi
  sleep 1
done
if [ "$healthy" != true ]; then echo '추론 서비스 준비 실패' >&2; false; fi

# 기존 API·Worker를 바꾸기 전에 최신 코드로 전체 벡터를 준비합니다.
# 환경 파일은 Node의 정상 실행 경로로만 전달하며 값을 출력하지 않습니다.
MATCH_MODEL_URL="$MODEL_URL" "$NODE" \
  --env-file-if-exists="$ROOT/services/backend/.env" \
  "$ROOT/services/backend/dist/cli/match-embeddings.js"
trap - ERR INT TERM HUP
echo "모델 활성화 완료: $(basename "$(readlink -f "$MODEL_ROOT/current")")"
