# T06 공고 분석 Worker·근거 증거

- 상태: verified
- 일자: 2026-08-09 (Asia/Seoul)
- 체크리스트: M2-04, M2-05, M2-06

## M2-04 재시도 가능한 분석 작업

- `job_analysis`에 실제 처리 단계, 시도 횟수, 목표/결과 버전, 실패 코드와 재시도 가능성을 저장한다.
- API는 owner scope로 현재 job 상태와 단계를 반환하고 완료된 분석만 재분석 queue에 넣는다.
- 실제 Redis/BullMQ Worker에서 `running` 상태 작업 재개와 중복 전달을 실행해 결과 버전·요구사항 행·시도 횟수가 한 번만 반영됨을 검증했다.
- 원문 근거 오류는 `INVALID_SOURCE_SPAN/retryable=false`, 일시적 provider 오류는 `EXTRACTION_FAILED/retryable=true`로 보존한다.

## M2-05 요구 역량과 원문 인용

- 계약에서 요구 역량 수를 3–6개로 제한하고 각 항목에 code-point 기반 start/end/quote를 요구한다.
- 서비스 validator와 PostgreSQL trigger가 모두 보존된 `description_raw`의 동일 구간과 quote가 정확히 일치하는지 확인한다.
- 한국어와 영문이 섞인 Unicode fixture를 사용했고 서비스 변조 fixture와 DB 직접 삽입 변조를 모두 거부했다.

## M2-06 커버리지와 재분석 이력

- 활성 record의 제목·본문·속성을 대상으로 요구사항별 covered/partial/missing과 근거 record UUID를 저장한다.
- 재분석 요청은 영향을 받는 brew/recipe 개수를 반환하고 새 목표 버전을 outbox에 기록한다.
- 세 세대까지 재분석해 현재 결과와 바로 직전 한 세대만 조회·보존됨을 검증했다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| migration 0008 PGlite/Compose PostgreSQL 적용 | PASS |
| source span·coverage focused unit | PASS — 2 tests |
| 실제 PostgreSQL/Redis analysis integration | PASS — 3 tests |
| contracts | PASS — 11 tests |
| database | PASS — 11 tests |
| backend | PASS — 18 files, 42 tests |
| 전체 `pnpm test` | PASS — 64 tests |
| 전체 `pnpm typecheck` / `pnpm build` | PASS |
