# 경력 문서 편집기 마이그레이션

## 순서

1. `mongodump`로 `career_records`, `career_document_snapshots`, `career_document_updates`를 백업한다. 백업 경로와 SHA-256을 배포 기록에 남긴다.
2. `pnpm backfill:career-documents -- --dry-run --batch-size=100`을 실행한다. JSON의 `mismatches`가 비어 있을 때만 다음 단계로 진행한다.
3. 동일한 명령의 `--apply`를 실행하고 `scanned`, `eligible`, `migrated`, `skipped`, `writes`를 기록한다. `writes`는 실제 생성한 snapshot 수다.
4. 같은 apply를 다시 실행한다. 이미 `documentVersion`이 있는 행은 skip되어 `writes: 0`이어야 한다.
5. 샘플 레코드의 `bodyMd`와 문서 체크섬, 사용자 소유자(`userId`)를 대조한다.

마이그레이션은 `_id` 오름차순으로 배치 처리하고 `bodyMd`를 삭제하거나 비우지 않는다. round-trip이 정규화된 Markdown과 일치하지 않는 행은 snapshot을 만들지 않고 ID와 이유만 보고한다.

## 롤백

새 편집기 기능 플래그를 끄고 레거시 `bodyMd` projection을 계속 제공한다. 필요하면 백업한 세 컬렉션을 별도 복구 DB에서 검증한 뒤 대상 컬렉션을 복원하고, 복원 전후 레코드 수와 컬렉션 체크섬을 비교한다. 운영 컬렉션을 직접 삭제하기 전에 복구 시점을 승인하고 보존 기간을 확인한다.

레거시 PATCH의 `bodyMd` 저장은 기대 버전(`If-Match`)과 문서 버전을 함께 확인하고 새 snapshot을 만든다. 대기 중인 Yjs 업데이트가 있으면 충돌을 반환하므로 조용히 덮어쓰지 않는다.

## BlockNote 본문 옮기기 (schemaVersion 2)

2026-10-28부터 본문 편집기는 BlockNote입니다. 일괄 쓰기 단계는 없습니다. 기록을 처음 여는 문서 bootstrap이 그 기록을 옮깁니다.

- 옮길 때 v1 스냅샷과 업데이트로 문서를 복원하고, BlockNote Yjs 상태를 담은 v2 스냅샷을 씁니다. 블록 ID는 v1 블록 ID를 그대로 씁니다.
- 같은 자리에서 `bodyMd`를 BlockNote 본문의 Markdown으로 바꾸고 `documentBodyHash`를 남깁니다.
- v1 업데이트는 압축 처리만 하고 지우지 않습니다.
- 열지 않은 기록은 그대로 둡니다. 매칭 · 생성은 그 기록의 `bodyMd`를 읽고, 그 값은 이미 맞습니다.

배포 전에 운영 복제본에서 dry-run으로 손실을 잽니다. 이 도구는 DB에 쓰지 않습니다.

```bash
cd services/backend
MONGODB_URL='<복제본 URL>' MONGODB_DATABASE='<복제본 DB>' node --import tsx src/modules/career-editor/migration-report.ts
```

출력 표의 `lost`(사라진 글자 수)가 모든 기록에서 0이어야 합니다. `degraded`는 대응 블록이 없어 문단으로 낮춘 블록입니다(근거 참조 등). 이 값이 있는 기록은 배포 전에 목록을 남깁니다.

### 편집기 밖의 bodyMd 쓰기

인터뷰 답변이나 옛 `bodyMd` 쓰기 API가 `bodyMd`를 바꾸면 `documentBodyHash`와 어긋납니다. 다음 bootstrap이 이를 보고 문서를 그 내용으로 맞춥니다. 이 동기화는 업데이트 원장에 `actor: "migration"`으로 남습니다.

### 되돌리기

**주의:** BlockNote 기록이 생긴 뒤 이전 버전을 다시 배포하지 않습니다. 그러면 이전 코드가 v2 스냅샷을 읽지 못해 그 기록의 문서 bootstrap이 422를 냅니다.

되돌릴 때는 이전 버전을 배포하기 전에 아래 도구로 BlockNote 기록을 v1 문서로 바꿉니다.

1. 위 「순서」 1번처럼 세 컬렉션을 백업합니다.
2. dry-run으로 대상 기록과 버전을 확인합니다.
3. API · Worker를 멈춘 뒤 `--apply`로 실행합니다. 실행 중 들어온 편집은 버전 조건에 걸려 건너뛰고 목록에 남습니다.
4. 이전 버전을 배포합니다.

```bash
cd services/backend
node --env-file=.env --import tsx src/modules/career-editor/blocknote-rollback.ts           # dry-run
node --env-file=.env --import tsx src/modules/career-editor/blocknote-rollback.ts --apply
```

도구는 기록마다 현재 BlockNote 상태를 v1 문서로 바꿔 새 v1 스냅샷(문서 버전 + 1)을 씁니다. v2 업데이트는 압축 처리하고 지우지 않습니다. 콜아웃 · 이미지 같은 블록은 v1 블록으로 돌아가지만, 색 같은 BlockNote 전용 스타일은 남지 않습니다.
