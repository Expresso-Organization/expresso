# G03 분석·인터뷰·레시피 종단 게이트 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M3-06

## 실제 종단 흐름

1. 임시 PostgreSQL DB에 0001–0011 마이그레이션을 처음부터 적용했다.
2. 실제 TCP API로 커리어 기록과 공고를 입력하고 outbox→Redis/BullMQ Worker로 분석을 완료했다.
3. 분석 결과로 정리된 기록 3개를 자동 선택해 brew를 만들었다.
4. 근거 질문 세션을 만들고 pause/resume 후 답변을 저장해 interview origin 기록을 생성했다.
5. 기록·요구사항·답변을 연결한 최소 3개 evidence path의 레시피를 생성했다.
6. 실제 API 편집으로 한 항목을 사용자 소유 locked 상태로 바꾸고 DB 경로 수를 재검증했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| fresh DB migration + HTTP + PostgreSQL/Redis Worker E2E | PASS — 1 test |
| 분석→재료→pause/resume→답변 기록→recipe | PASS |
| source→target DB path / 사용자 잠금 assertion | PASS |
| 전체 `pnpm test` | PASS — contracts 13 + database 11 + backend 52 = 76 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
