# Expresso Contracts

백엔드와 web/mobile/desktop 클라이언트가 공유하는 `/v1` HTTP·비동기 작업 계약입니다.

## 제공 계약

- 오류 응답과 안정적인 오류 코드
- cursor pagination과 리소스 version/`If-Match`
- `Idempotency-Key` 검증
- versioned background job envelope와 progress event
- OpenAPI 3.1 component document

## 명령

```bash
pnpm --filter @expresso/contracts test
pnpm --filter @expresso/contracts typecheck
pnpm --filter @expresso/contracts build
```

도메인별 DTO를 추가할 때는 기존 이름이나 의미를 조용히 바꾸지 않고 새 schema/version을 추가합니다. 유효 fixture와 거부 fixture를 함께 테스트해야 합니다.
