# 출시 보안 감사

- 감사일: 2026-08-09
- 결론: 미해결 P0/P1 없음

## 자동 검사 범위

| 영역 | 검사 | 결과 |
|---|---|---|
| 인증 | owner-scoped route inventory 23개가 handler 전에 bearer 401 | PASS |
| 인가/IDOR | identity session, career record, job, portfolio, analytics의 user UUID scope 회귀 | PASS |
| mass assignment | strict DTO의 `userId` 등 미정의 필드 거부 | PASS |
| 입력 | 공고 200자, event 8KB/rate limit, 텍스트 상한, UUID/slug 검증 | PASS |
| 파일 | resume storage key는 pdf/doc/docx만 허용 | PASS |
| 자산 | HMAC asset/version/nonce/expiry, 교체·삭제 요청 시 이전 링크 무효 | PASS |
| 비밀 | token hash 저장, DB URL/token/원문 오류 로그 부정 검사, DLQ error class만 보존 | PASS |
| 삭제 | deletion request 즉시 session/public/asset 접근 차단 | PASS |

공개 route는 readiness, public portfolio snapshot/redirect, signed asset resolve, analytics collection, deletion cancellation로 제한된다. 공개 입력도 strict schema, size/rate/signature/token 검사를 통과해야 한다.

## 발견 사항과 조치

- resume asset 입력이 임의 확장자를 허용하던 항목을 발견해 `pdf`, `doc`, `docx` storage key로 제한했다.
- generation provider 호출에 30초 typed timeout을 추가하고 Fastify request timeout 기본값을 30초로 고정했다.
- 조치 후 security, contract, 전체 regression을 재실행했으며 P0/P1은 남지 않았다.

