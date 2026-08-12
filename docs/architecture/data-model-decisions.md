# 데이터 모델 구현 결정

기준 문서는 개발 포털의 `Expresso 데이터 모델 명세서` v1.0과 `Expresso ERD`입니다. 물리적인 의미는 데이터 모델 명세서를 우선하고, 필드 누락처럼 명세의 전역 규칙과 충돌하는 경우 ERD로 보완합니다.

## 문서 간 차이

| 테이블 | 차이 | 구현 결정 |
|---|---|---|
| `skill_evidence` | ERD에만 `id`가 있음 | 모든 PK는 UUID라는 전역 규칙에 따라 포함 |
| `brew_source` | ERD에만 `id`가 있음 | 모든 PK는 UUID라는 전역 규칙에 따라 포함 |
| `interest` | ERD에만 `memo`가 있음 | 사용자 메모 기능을 보존하기 위해 포함 |
| `job_analysis` | ERD에만 `analyzed_at`이 있음 | 완료 시각을 보존하기 위해 포함 |
| `recipe_item` | ERD에만 `order_no`가 있음 | 섹션 안의 안정적인 순서를 위해 포함 |
| `recipe_item.evidence` | 명세는 `jsonb[]`, ERD는 `jsonb` | JSON 배열을 담는 단일 `jsonb`로 구현하고 배열·비어 있지 않음 제약 적용 |
| `deployment` | 명세에만 `has_unpublished_changes`가 있음 | 편집본과 공개본의 분리를 위해 포함 |
| `insight` | 명세에만 `generated_at`이 있음 | 생성 시각을 보존하기 위해 포함 |

## 아직 확정하지 않는 항목

명세의 Q1–Q5는 이번 초기 스키마에서 제품 결정으로 확정하지 않습니다.

- 원시 방문 이벤트 보관 기간은 운영 정책으로 남깁니다.
- 협업용 편집 세션·코멘트 테이블은 추가하지 않습니다.
- 공고 수집 방식별 정규화 파이프라인은 구현하지 않습니다.
- 범용 `evidence` 테이블로 정규화하지 않습니다.
- `brew`에서 여러 `portfolio`를 만들 수 있는 현재 1:N 구조를 유지합니다.

