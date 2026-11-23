#!/usr/bin/env bash
# Oracle 격리 검증 전용입니다. 실제 운영 유닛과 current는 사용하지 않습니다.
set -euo pipefail
ROOT="${MATCH_VALIDATION_CODE_ROOT:?격리 후보 코드 경로 필요}"
case "$ROOT" in /home/ubuntu/expresso/var/match-validation-*/code) ;; *) echo '격리 검증 경로만 허용' >&2; exit 1 ;; esac
cd "$ROOT"
WORK="$(dirname "$ROOT")"
export EXPRESSO_ROOT="$ROOT" EXPRESSO_SYSTEMD_DIR=/run/systemd/system
export EXPRESSO_MATCH_SERVICE=expresso-match-validation
export EXPRESSO_API_SERVICE=expresso-match-validation-api
export EXPRESSO_WORKER_SERVICE=expresso-match-validation-worker
export EXPRESSO_MATCH_PORT=4898
export EXPRESSO_MATCH_UNIT_FILE="$WORK/activation.service"
export MONGODB_DATABASE=expresso_match_validation_20261122
export MONGODB_URL='mongodb://127.0.0.1:57177/?replicaSet=rs0&directConnection=true'
export REDIS_URL=redis://127.0.0.1:56479
export NODE_ENV=test LOG_LEVEL=error
RELEASE=3a6d6fbf131096ce-31dd18d5847ee015
MODEL_ROOT="$ROOT/var/match-model"
sudo install -d -o ubuntu -g ubuntu -m 700 /var/lib/expresso-match-validation

python3 - "$ROOT" "$WORK" <<'PY'
from pathlib import Path
import sqlite3,sys
root,work=map(Path,sys.argv[1:])
template=(root/'infra/systemd/expresso-match-inference.service').read_text()
template=template.replace('/home/ubuntu/expresso',str(root)).replace('StateDirectory=expresso-match','StateDirectory=expresso-match-validation')
template=template.replace('/etc/expresso/match-inference.conf','/nonexistent/expresso-match-validation.conf')
template=template.replace('Environment=TOKENIZERS_PARALLELISM=false','Environment=TOKENIZERS_PARALLELISM=false\nEnvironment=EXPRESSO_ROOT='+str(root)+'\nEnvironment=EXPRESSO_MATCH_PORT=4898\nEnvironment=EXPRESSO_MATCH_STATE_DIR=/var/lib/expresso-match-validation')
(work/'activation.service').write_text(template)
source=next((work/'vectors').glob('*.sqlite3'))
target=Path('/var/lib/expresso-match-validation')/source.name
with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as src, sqlite3.connect(target) as dst:
    src.backup(dst)
PY

# 첫 활성화의 준비 실패는 링크와 연결 설정을 모두 회수해야 합니다.
rm -f "$MODEL_ROOT/current"
if MONGODB_URL='mongodb://127.0.0.1:57178/?directConnection=true' bash scripts/operations/match-service.sh activate "$RELEASE" > "$WORK/activation-first-failure.log" 2>&1; then
  echo '실패 주입을 통과해 잘못 활성화됐습니다' >&2; exit 1
fi
test ! -L "$MODEL_ROOT/current"
test ! -f /run/systemd/system/expresso-match-validation-api.service.d/30-match-model.conf

bash scripts/operations/match-service.sh activate "$RELEASE" > "$WORK/activation-success.log" 2>&1
test "$(basename "$(readlink -f "$MODEL_ROOT/current")")" = "$RELEASE"
curl -fsS --max-time 3 -H 'content-type: application/json' -d '{}' http://127.0.0.1:4898/v1/vector-stats > "$WORK/activation-vectors.json"
grep -q '"prepared":true' "$WORK/activation-success.log"

# 기존 모델이 있으면 실패 후 그 링크와 서비스를 복원해야 합니다.
if MONGODB_URL='mongodb://127.0.0.1:57178/?directConnection=true' bash scripts/operations/match-service.sh activate "$RELEASE" > "$WORK/activation-rollback.log" 2>&1; then
  echo '실패 주입을 통과해 잘못 활성화됐습니다' >&2; exit 1
fi
test "$(basename "$(readlink -f "$MODEL_ROOT/current")")" = "$RELEASE"
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:4898/health > /dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 3 http://127.0.0.1:4898/health > /dev/null
bash scripts/operations/match-service.sh disable > "$WORK/activation-disable.log" 2>&1
test ! -L "$MODEL_ROOT/current"
test ! -f /run/systemd/system/expresso-match-validation-worker.service.d/30-match-model.conf
sudo rm /run/systemd/system/expresso-match-validation.service
sudo rmdir /run/systemd/system/expresso-match-validation-{api,worker}.service.d
sudo systemctl daemon-reload
python3 - "$WORK" <<'PY'
import json,sys
from pathlib import Path
work=Path(sys.argv[1]);stats=json.loads((work/'activation-vectors.json').read_text())
assert stats['encoded']==0
report={'firstFailureCleaned':True,'activationPrepared':True,'failureRestoredPrevious':True,'disableCleaned':True,'productionUnitsUsed':False,**stats}
(work/'activation-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
PY
