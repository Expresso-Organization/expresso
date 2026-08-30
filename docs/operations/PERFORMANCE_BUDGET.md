# MongoDB 성능 예산

## 기준

성능 suite는 다른 통합 테스트와 동시에 실행하지 않습니다. 로컬 fixture 결과를
운영 규모의 보장으로 해석하지 않습니다.

| 경로 | p95 예산 |
| --- | ---: |
| 일반 읽기 | 300ms 미만 |
| 기록 쓰기 | 300ms 미만 |
| 방문 이벤트 | 150ms 미만 |
| 큐 등록 | 200ms 미만 |

`services/backend/test/load/performance-budget.test.ts`는 위 네 경로와 hot visitor
20건 중 10건 수락, 기록 1,000건 query plan을 확인합니다. 공고 전체 필터·정렬,
큰 snapshot, 생성 완료 경로는 동일한 fixture 크기와 `executionStats`를 함께
기록합니다.

```bash
TEST_MONGODB_URL='mongodb://admin:...@127.0.0.1:57017/?authSource=admin&replicaSet=rs0' \
TEST_REDIS_URL=redis://127.0.0.1:56379 \
pnpm --filter @expresso/backend test:load
```

보고할 값은 p50/p95, 실행 건수, `totalDocsExamined`, `totalKeysExamined`,
반환 건수입니다. COLLSCAN이 남으면 대상 건수와 이유를 명시하고 예산을 넘으면
index 또는 집계를 수정합니다.

## 2026-08-30 로컬 리허설 결과

MongoDB 8.0 단일 노드 rs0에서 다른 suite와 분리해 실행했습니다. 이 수치는 운영
트래픽이나 운영 데이터 크기의 보장이 아니라 회귀 기준입니다.

| 항목 | 결과 | 예산 |
| --- | ---: | ---: |
| 일반 읽기 p95, 100회 | 225.35ms | 300ms |
| 기록 쓰기 p95, 40회 | 11.05ms | 300ms |
| 방문 이벤트 p95, 60회 | 7.63ms | 150ms |
| 큐 등록 p95, 40회 | 7.15ms | 200ms |
| 공고 1,000건 필터·목록 | 120.43ms | 3,000ms 리허설 상한 |
| 9MiB snapshot 10조각 쓰기/읽기 | 83.73ms / 61.03ms | 각각 3,000ms |

공고 인덱스 검사는 50건 반환에 문서 50건·키 50개를 조사했고, 생성 완료 guard는
문서 1건·키 1개를 조사했습니다. 기록 1,000건 목록과 hot visitor 20건 중
10건 수락·10건 제한도 같은 suite에서 통과했습니다. 원문 출력은
`coordination/mongodb/evidence/T18-performance-detailed.log`에 있습니다.
