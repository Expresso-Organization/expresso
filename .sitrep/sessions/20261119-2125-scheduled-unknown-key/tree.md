# 작업 트리: 배포 중 새 예약 작업의 첫 실행 보존
갱신 2026-11-19 22:00 · 진행률 100%

- [x] T1 원인 확인: `deploy.sh` 순서 · 워커 폴링 · `scheduleDue` · `process` · `#execute`
- [x] T2 방법 결정과 intent · spec · plan (`scheduled-unknown-key`)
- [x] T3 구현
  - [x] T3.1 통합 시험 `unknown-keys.integration.test.ts`(수정 전 실패 확인)
  - [x] T3.2 `scheduleDue` 조회를 아는 키로 제한, 생성자 `keys` 주입 (`scheduling/service.ts`)
  - [x] T3.3 `SCHEDULED_JOB_KEYS` 주석 수정 (`scheduling/public.ts`)
- [x] T4 문서: `docs/operations/DEPLOYMENT.md` 「실행」에 배포 뒤 확인과 적용 시점
- [x] T5 검증: `pnpm typecheck` · `pnpm test` · `pnpm test:infra`
- [x] T6 커밋 · 푸시 · PR ← 현재

## 열린 결정

없음
