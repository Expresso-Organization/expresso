# MySQL 백업·복구 runbook

## 백업

저장 위치를 명시해 논리 백업을 만든다. 트리거와 저장 프로시저까지 함께 담는다 —
규칙이 스키마 안에 들어 있어서, 빼고 받으면 복구한 데이터베이스가 잘못된 데이터를
받아들인다.

```bash
scripts/operations/backup-mysql.sh /secure/path/expresso-$(date +%Y%m%dT%H%M%S).sql
```

서버에서 받을 때는 `EXPRESSO_COMPOSE_FILE=infra/compose.server.yaml` 과
`EXPRESSO_MYSQL_PASSWORD` 를 함께 넘긴다.

백업 파일은 애플리케이션 checkout 밖의 암호화 저장소로 옮기고 접근 권한과 보존
기간을 따로 적용한다.

## 격리 복구 검증

아래 명령은 고정 이름 `expresso_restore_rehearsal` 데이터베이스만 새로 만들고
끝날 때 지운다. 운영 `expresso` 데이터베이스와 볼륨은 건드리지 않는다.

```bash
scripts/operations/rehearse-mysql-restore.sh /secure/path/expresso-TIMESTAMP.sql
```

복구한 뒤 마이그레이션 수, 사용자·기록·배포 줄 수, 배포 스냅샷 체크섬을 원본과
견준다. `restore_rehearsal=PASS` 가 나오기 전에는 그 백업을 복구할 수 있다고
판정하지 않는다.

## 장애 복구 순서

1. 쓰기 트래픽과 Worker를 멈추고 마지막 outbox·queue lag를 적어 둔다.
2. 새 MySQL 환경에 검증된 백업을 복원한다.
3. API와 Worker가 쓰는 `DATABASE_URL`을 새 환경으로 바꾼다.
4. 마이그레이션 체크섬, 핵심 줄 수, 배포 스냅샷 체크섬을 다시 확인한다.
5. API가 준비되면 Worker를 한 인스턴스로 먼저 띄워 outbox가 겹쳐 돌지 않는지 본다.
6. API 트래픽을 단계적으로 열고 오류율·queue lag·quota ledger를 지켜본다.

## 마이그레이션 rollback 원칙

운영 마이그레이션은 기존 열을 지우거나 뜻을 바꾸지 않는 expand 단계로만 배포한다.
장애가 나면 데이터베이스를 되돌리는 대신 이전 API·Worker 이미지를 다시 배포한다.
파괴적인 contract 단계는 별도 백업과 호환 기간을 둔 뒤 다음 릴리스에서 한다.

## MySQL 에서 달라지는 것

- **트리거와 저장 프로시저를 함께 받는다.** `mysqldump --routines --triggers` 다.
  받는 사람에게 `SHOW_ROUTINE` 권한이 필요하다.
- **DDL 은 문장마다 커밋한다.** 마이그레이션 파일 하나가 중간에 실패하면 그때까지
  적용된 문장이 남는다. 마이그레이션은 파일 하나를 되돌릴 수 있는 크기로 쓴다.
- **바이너리 로그가 켜져 있으면 트리거를 만들 때 SUPER 를 요구한다.**
  `infra/compose.server.yaml` 이 `--log-bin-trust-function-creators=1` 로 그 검사를
  끈다. 새 환경을 세울 때 같은 설정을 넣는다.
