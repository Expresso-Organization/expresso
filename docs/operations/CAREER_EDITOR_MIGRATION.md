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
