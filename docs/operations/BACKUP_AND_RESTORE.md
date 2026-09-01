# MongoDB 백업과 복원

## 백업 경계

백업 전에 API, Worker, 수집기와 예약 발행기를 모두 중단합니다. Redis를 비우지
않고 기존 MySQL volume도 지우지 않습니다. 백업 위치는 서버와 다른 승인된
저장소여야 합니다.

```mermaid
flowchart LR
    STOP["쓰기 중단"] --> DB["mongodump archive"]
    STOP --> REDIS["Redis RDB"]
    STOP --> FILES["미디어 파일"]
    DB --> META["commit · image digest<br/>prefix · config version"]
    REDIS --> META
    FILES --> META
    META --> OFFSITE["서버 밖 승인 저장소"]
```

MongoDB Database Tools 설정 파일에는 URI를 적고 권한을 `600`으로 제한합니다.
비밀번호를 명령 인자나 백업 이름에 넣지 않습니다.

```yaml
uri: mongodb://backup-user:REDACTED@127.0.0.1:57017/expresso?authSource=expresso&replicaSet=rs0
```

```bash
export EXPRESSO_WRITES_STOPPED=1
export MONGODB_TOOLS_CONFIG=/secure/mongodb-backup.yml
export MONGODB_DATABASE=expresso
export QUEUE_PREFIX=expresso-mongo-v1
export EXPRESSO_CONFIG_VERSION=mongodb-v1
scripts/operations/backup-mongodb.sh /approved/off-host/expresso-20260830T120000Z
```

결과에는 `mongodb.archive`, `redis.rdb`, 선택적인 `media.tar.gz`,
`metadata.json`, `SHA256SUMS`가 들어갑니다. dump에는 collection validator,
index, `snapshot_chunks`를 포함한 모든 문서가 들어갑니다.

## 복원 리허설

복원은 원본과 다른 hostname 또는 port의 별도 rs0 인스턴스에서만 실행합니다.
대상 DB 이름은 원본과 다르고 `restore` 또는 `rehearsal`을 포함해야 합니다.
스크립트는 이 경계를 확인한 뒤에만 `--drop`을 사용합니다.

```bash
export MONGODB_TOOLS_CONFIG=/secure/mongodb-restore.yml
export MONGODB_RESTORE_URL='mongodb://restore-user:...@127.0.0.1:57117/?authSource=admin&replicaSet=rs0'
export MONGODB_RESTORE_HOST=127.0.0.1
export MONGODB_RESTORE_PORT=57117
export MONGODB_RESTORE_DATABASE=expresso_restore_rehearsal
scripts/operations/rehearse-mongodb-restore.sh /approved/off-host/expresso-20260830T120000Z
```

복원 검증은 rs0 primary, migration version, collection별 건수, 공고 자산의
SHA-256과 snapshot chunk 연결을 확인하고 `restore-report.json`을 남깁니다. Redis는 별도 prefix에서,
미디어는 별도 디렉터리에서 검증한 뒤 운영 경로로 승격합니다.
