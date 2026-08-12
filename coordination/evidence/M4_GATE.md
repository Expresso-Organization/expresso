# G04 생성·편집·복원 종단 게이트 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M4-07

## 실제 종단 흐름

1. 임시 PostgreSQL DB에 0001–0015 마이그레이션을 적용했다.
2. 실제 HTTP로 generation job을 제출하고 outbox→Redis/BullMQ Worker로 portfolio를 생성했다.
3. quota가 1회만 증가하고 세 block 모두 sentence evidence trace를 갖는지 확인했다.
4. edit preview/apply API로 한 block을 사용자 문장으로 바꾸고 자동 잠금을 확인했다.
5. Worker 재시작 상황을 주입해 잠긴 문장과 다른 재생성을 validator가 거부하는지 확인했다.
6. initial generation snapshot을 API로 복원해 원래 문장·잠금 상태가 돌아오는지 검증했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| fresh DB + HTTP + PostgreSQL/Redis generation Worker | PASS — 1 test |
| quota 1회 / 3 sentence traces | PASS |
| preview/apply auto-lock / locked rewrite reject | PASS |
| initial snapshot full restore | PASS |
| 전체 `pnpm test` | PASS — contracts 13 + database 11 + backend 61 = 85 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
| `git diff --check` | PASS |
