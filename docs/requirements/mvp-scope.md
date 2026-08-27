# Expresso 1차 MVP 범위 초안

이 문서는 현재 선정한 Expresso 1차 MVP 구현 범위를 정리한 초안이다.

MVP 분류는 구현 범위 및 우선순위를 나타내며
SRS Requirement의 `CONFIRMED` 상태를 의미하지 않는다.

팀 논의에 따라 현재 범위는 변경될 수 있다.

## 1. MVP 분류 정의

| MVP 분류 | 현재 1차 MVP 포함 여부 | 의미 |
| --- | --- | --- |
| `MVP_CORE` | 포함 | 최소 End-to-End 흐름과 서비스 핵심 가치 시연을 위해 우선 구현한다. 이 항목이 빠지면 핵심 사용자 흐름을 완성하기 어렵다. |
| `MVP_SUPPORTING` | 포함 | `MVP_CORE`보다 구현 우선순위는 낮지만, 기본 E2E 이후 사용성, 데이터 정정 및 결과 품질을 높이기 위해 구현한다. |
| `POST_MVP` | 미포함 | SRS에는 존재하지만 현재 1차 MVP에서는 구현하지 않는다. Requirement가 삭제된 것은 아니며 후속 개발 후보로 유지한다. |
| `DEFERRED_ALREADY` | 미포함 | SRS 단계에서 이미 `DEFERRED`인 항목이다. 단순 일정 문제가 아니라 역할 또는 정책에 추가 논의가 필요하므로 현재 1차 MVP에서도 구현하지 않는다. |

`MVP_CORE`와 `MVP_SUPPORTING`은 모두 현재 1차 MVP에 포함한다.
구현 순서는 `MVP_CORE` 안정화 후 `MVP_SUPPORTING`으로 한다.

## 2. SRS 상태와 MVP 분류의 차이

SRS 상태와 MVP 분류는 서로 다른 축이다.

SRS 상태는 다음과 같이 요구사항의 합의 및 검토 상태를 나타낸다.

- `PROPOSED`
- `CONFIRMED`
- `NEED_DECISION`
- `DEFERRED`
- `REMOVED`

MVP 분류는 현재 구현 범위와 우선순위를 나타낸다.

- `MVP_CORE`
- `MVP_SUPPORTING`
- `POST_MVP`
- `DEFERRED_ALREADY`

따라서 `PROPOSED + MVP_CORE`와 같은 조합이 가능하다.

- `PROPOSED`: 요구사항의 합의 상태
- `MVP_CORE`: 현재 1차 MVP 구현 범위와 우선순위

MVP에 포함되었다는 이유로 SRS Requirement의 상태를
`PROPOSED`에서 `CONFIRMED`로 변경하지 않는다.

## 3. 현재 1차 MVP 목표

사용자가 자신의 핵심 Career 정보를 생성하고 관리하며,
여러 Career Category의 Record 중 원하는 재료를 선택하여
AI를 통해 Portfolio를 생성하고 결과를 조회하고 최소한으로 수정할 수 있는
End-to-End 흐름을 구현한다.

기능 수를 최대화하는 것이 목적이 아니라
핵심 사용자 흐름이 실제로 동작하는 것을 목표로 한다.

## 4. 최소 End-to-End 흐름

최소 End-to-End 흐름은 다음과 같다.

1. 로그인
2. Career 생성 및 관리
3. 재료 고르기
4. 생성 가능한 Career 후보 조회
5. 일부 또는 전체 Career Record 선택
6. Portfolio 생성 요청
7. Backend의 선택 재료 전체 재검증
8. AI 생성 요청
9. AI 결과 수신 및 검증
10. 최소 1개의 유효한 Section과 실제 콘텐츠 확인
11. Portfolio 저장
12. 내 Portfolio 목록 조회
13. 내 Portfolio 단일 결과 조회
14. 필요한 경우 Portfolio 제목 또는 기존 Section 콘텐츠 수정

축약하면 다음과 같다.

`로그인 → Career 생성 → 재료 고르기 → 재료 선택 → Portfolio 생성 → 결과 확인 → 필요한 경우 결과 수정`

로그인은 사용자 귀속과 소유권 검증의 선행 조건이지만,
이 문서에서 새로운 인증 Requirement를 정의하지 않는다.

## 5. Career MVP 범위

### 5.1 프로젝트

`MVP_CORE`:

- 프로젝트 Record 기본 정책
- Create
- Read

`MVP_SUPPORTING`:

- Update

`POST_MVP`:

- Delete

### 5.2 학력·이력

`MVP_CORE`:

- 학력·이력 Record 기본 정책
- Create
- Read

`MVP_SUPPORTING`:

- Update

`POST_MVP`:

- Delete

### 5.3 현재 1차 MVP 미포함 Category

- 자격증·수상: `POST_MVP`
- 학술·집필: `POST_MVP`
- 활동·리더십: `DEFERRED_ALREADY`
- 경험: `DEFERRED_ALREADY`
- 스킬·도구: `DEFERRED_ALREADY`

프로젝트와 학력·이력만으로도
서로 다른 Career Category의 Record를 하나의 재료 선택 흐름에서 다루는
다중 Category 시연이 가능하다.

프로젝트 및 학력·이력 Delete가 없어도
Career 생성부터 Portfolio 결과 확인 및 수정까지의 E2E는 성립한다.

## 6. 현재 반영된 복수값 정책

현재 MVP에 포함되는 Career 필드 중 다음 필드는 복수 항목을 가질 수 있다.

- 프로젝트 사용 기술: 여러 기술 항목
- 프로젝트 주요 성과: 여러 성과 항목
- 학력·이력 주요 활동 / 성과: 하나의 필드 안에서 여러 활동 또는 성과 항목

위 정책은 현재 MVP 및 후속 ERD의 고려사항에 포함한다.

다음 사항은 이 문서에서 정하지 않는다.

- 최대 또는 최소 항목 수
- 중복 허용 여부
- 항목 순서의 의미
- 구체적인 DB 및 API 표현 방식

현재 1차 MVP의 프로젝트 링크는 선택 가능한 단일값이다. Project 이외 Category의
관련 링크 단일 / 복수 여부는 후속 결정 사항으로 둔다.

## 7. 재료 고르기 MVP

다음 항목을 `MVP_CORE`로 분류한다.

- MVP 대상 Career Category의 통합 후보 조회
- 후보별 제목, Career Category 및 시기 또는 날짜 요약
- Career Record 단위 선택
- 다중 선택
- 전체 후보 중 일부 선택
- 현재 사용 가능한 모든 후보 선택 가능
- 최소 1개 Career Record 선택
- Portfolio 생성 요청 시 Backend의 선택 재료 전체 재검증
- 선택된 Record 중 하나라도 무효인 경우 전체 생성 요청 실패

사용 가능한 모든 후보를 선택할 수 있어야 하지만,
구체적인 전체 선택 버튼 UI를 핵심 비즈니스 요구사항으로 강제하지 않는다.

## 8. Portfolio 생성 MVP

`REQ-POR-003`부터 `REQ-POR-006`까지를 `MVP_CORE`로 분류한다.

포함 범위는 다음과 같다.

- Backend와 AI 생성 파트의 책임 경계
- Portfolio 생성 성공
- 생성 결과 저장
- 원본 Career와 생성 결과의 독립성
- Portfolio 전체 수준의 Career 출처 추적
- 생성 성공과 실패 구분
- 실패한 결과를 정상 완료된 Portfolio로 저장하지 않음

저장 가능한 AI 결과에는 최소 1개의 유효한 Section과
사용자가 확인할 수 있는 실제 콘텐츠가 존재해야 한다.

특정 Section의 종류, 이름 및 전체 개수는 현재 정하지 않는다.

## 9. Portfolio 관리 MVP

### 9.1 MVP_CORE

- 사용자 한 명의 여러 Portfolio 보유
- Portfolio 필수 제목
- 사용자가 제목을 입력하지 않은 경우 시스템 기본 제목 부여
- 현재 MVP에서 Portfolio 제목 중복 허용
- 순서가 있는 Section 논리 구조
- 자신에게 귀속된 Portfolio 목록 조회
- 자신에게 귀속된 Portfolio 단일 결과 조회

### 9.2 MVP_SUPPORTING

- Portfolio 제목 수정
- 기존 Portfolio Section 콘텐츠 수정

### 9.3 POST_MVP

- Portfolio 삭제
- Section 추가 및 삭제
- Section 표시 및 숨김
- Section 순서 변경
- Block 단위 편집
- AI 재생성
- Portfolio 복제
- Portfolio 공개
- 공유 URL
- PDF
- 버전 관리

## 10. Career 출처 추적

현재 MVP에서는 Portfolio 전체 생성 입력 수준으로 Career 출처를 추적한다.

예:

```text
Portfolio A
├─ Career Record A
├─ Career Record B
└─ Career Record C
```

Section별 또는 콘텐츠별 세부 출처 추적은 `POST_MVP`로 둔다.

출처 추적은 원본 Career와 Portfolio 콘텐츠의 자동 동기화를 의미하지 않는다.

## 11. Requirement 전체 분류

| ID | Requirement 이름 | MVP 분류 | 현재 1차 MVP 포함 여부 | 이유 |
| --- | --- | --- | --- | --- |
| REQ-CAR-001 | Career Record 공통 구조 | `MVP_CORE` | 포함 | 활성 Career Record의 공통 기반이다. |
| REQ-CAR-002 | Career Category 소속 | `MVP_CORE` | 포함 | Record와 Category의 관계를 보장한다. |
| REQ-CAR-003 | 시스템 Career Category 제공 | `MVP_CORE` | 포함 | MVP에서 사용할 시스템 Category의 경계를 제공한다. |
| REQ-CAR-004 | Career Record 필수값 검증 | `MVP_CORE` | 포함 | 유효한 Career와 AI 입력을 보장한다. |
| REQ-CAR-005 | Career Record Category 변경 제한 | `MVP_CORE` | 포함 | 활성 Category의 공통 불변 조건이다. |
| REQ-CAR-006 | 프로젝트 Record | `MVP_CORE` | 포함 | 핵심 Portfolio 생성 재료다. |
| REQ-CAR-007 | 학력·이력 Record | `MVP_CORE` | 포함 | 프로젝트와 다른 핵심 Career 배경을 제공한다. |
| REQ-CAR-008 | 자격증·수상 Record | `POST_MVP` | 미포함 | 현재 E2E는 프로젝트와 학력·이력으로 구성한다. |
| REQ-CAR-009 | 학술·집필 Record | `POST_MVP` | 미포함 | 현재 1차 MVP Category에서 제외한다. |
| REQ-CAR-010 | 활동·리더십 Record | `DEFERRED_ALREADY` | 미포함 | SRS에서 이미 DEFERRED 상태다. |
| REQ-CAR-011 | Career Record 생성 | `MVP_CORE` | 포함 | 활성 Career Category의 공통 생성 흐름에 필요하다. |
| REQ-CAR-012 | 프로젝트 Career Record 목록 조회 | `MVP_CORE` | 포함 | 프로젝트 입력 결과 확인과 관리에 필요하다. |
| REQ-CAR-013 | 프로젝트 Career Record 수정 | `MVP_SUPPORTING` | 포함 | 프로젝트 정보 정정과 생성 재료 품질을 높인다. |
| REQ-CAR-014 | 프로젝트 Career Record 삭제 | `POST_MVP` | 미포함 | 삭제 없이도 현재 E2E가 성립한다. |
| REQ-CAR-015 | 학력·이력 Career Record 생성 | `MVP_CORE` | 포함 | 학력·이력 재료 생성에 필요하다. |
| REQ-CAR-016 | 학력·이력 Career Record 목록 조회 | `MVP_CORE` | 포함 | 학력·이력 입력 결과 확인과 관리에 필요하다. |
| REQ-CAR-017 | 학력·이력 Career Record 수정 | `MVP_SUPPORTING` | 포함 | 학력·이력 정보 정정과 생성 재료 품질을 높인다. |
| REQ-CAR-018 | 학력·이력 Career Record 삭제 | `POST_MVP` | 미포함 | 삭제 없이도 현재 E2E가 성립한다. |
| REQ-CAR-019 | 자격증·수상 Career Record 생성 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-020 | 자격증·수상 Career Record 목록 조회 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-021 | 자격증·수상 Career Record 수정 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-022 | 자격증·수상 Career Record 삭제 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-023 | 학술·집필 Career Record 생성 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-024 | 학술·집필 Career Record 목록 조회 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-025 | 학술·집필 Career Record 수정 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-CAR-026 | 학술·집필 Career Record 삭제 | `POST_MVP` | 미포함 | 해당 Category를 현재 1차 MVP에서 제외한다. |
| REQ-POR-001 | Portfolio 생성 재료 선택 | `MVP_CORE` | 포함 | Career와 Portfolio 생성을 연결하는 핵심 흐름이다. |
| REQ-POR-002 | Portfolio 생성 재료 검증 | `MVP_CORE` | 포함 | 소유권과 신규 활용 가능 여부를 다시 검증한다. |
| REQ-POR-003 | Portfolio 생성 요청 | `MVP_CORE` | 포함 | AI 생성 흐름의 진입점이다. |
| REQ-POR-004 | Portfolio 생성 성공 및 결과 저장 | `MVP_CORE` | 포함 | 생성 결과를 사용자 Portfolio로 보존한다. |
| REQ-POR-005 | Portfolio 생성 결과와 원본 Career의 관계 | `MVP_CORE` | 포함 | 결과 독립성과 Portfolio 수준 출처 추적에 필요하다. |
| REQ-POR-006 | Portfolio 생성 실패 | `MVP_CORE` | 포함 | 실패 결과가 정상 Portfolio로 저장되는 것을 방지한다. |
| REQ-POR-007 | Portfolio 기본 구조 및 소유권 | `MVP_CORE` | 포함 | 소유권, 제목 및 Section 구조의 기반이다. |
| REQ-POR-008 | Portfolio 목록 및 단일 결과 조회 | `MVP_CORE` | 포함 | 생성 결과 확인과 반복 생성 결과 관리에 필요하다. |
| REQ-POR-009 | Portfolio 수정 | `MVP_SUPPORTING` | 포함 | 제목과 기존 Section 콘텐츠를 보정할 수 있게 한다. |
| REQ-POR-010 | Portfolio 삭제 | `POST_MVP` | 미포함 | 현재 E2E 완성에 필수적이지 않다. |

## 12. 명시적인 현재 MVP 제외 범위

### 12.1 Career

- 프로젝트 Delete
- 학력·이력 Delete
- 자격증·수상
- 학술·집필
- 활동·리더십
- 경험
- 스킬·도구
- Career 검색 및 필터
- Career 전용 상세 화면
- 변경 이력
- 이전 버전 복원

### 12.2 Portfolio

- Portfolio 삭제
- Section 추가 및 삭제
- Section 표시 및 숨김
- Section 순서 변경
- Block 단위 편집
- AI 재생성
- Portfolio 복제
- Portfolio 공개
- 공유 URL
- PDF
- 버전 관리

### 12.3 기타

- 역량 기능
- 매칭 점수
- AI 배지
- Section 또는 콘텐츠 단위 Career 출처 추적
- Queue 및 Worker 등 세부 기술 구조

## 13. 남은 Decision

### 13.1 DECISION-CAR-008

현재 MVP에 영향을 주는 다음 필드의 정책은 문서에 반영되어 있다.

- 프로젝트 사용 기술: 복수값
- 프로젝트 주요 성과: 복수값
- 학력·이력 주요 활동 / 성과: 복수값

현재 1차 MVP의 프로젝트 링크는 선택 가능한 단일값으로 사용한다. Project 이외
Category의 관련 링크 단일 / 복수 여부는 현재 MVP 핵심 ERD를 바로 막는 항목으로
취급하지 않는다. 해당 링크를 구현 및 DB와 API 설계 범위에 포함하는 경우 그 설계
전에 별도로 결정한다.

### 13.2 DECISION-CAR-009

시스템 Career Category 자체의 추가, 삭제 및 변경은
현재 1차 MVP 범위에서 다루지 않는다.

`DECISION-CAR-009`는 해결된 것으로 변경하지 않으며,
현재 MVP ERD의 즉시 해결 항목으로 취급하지 않는다.

## 14. requirements-spec.md 상태

이 문서는 SRS의 Requirement 상태를 변경하지 않는다.

- `MVP_CORE` 등의 분류를 `requirements-spec.md`에 직접 추가하지 않는다.
- `PROPOSED`, `CONFIRMED` 등의 SRS 상태를 변경하지 않는다.
- 새로운 Requirement를 생성하지 않는다.
- 기존 SRS에 반영된 비즈니스 정책을 불필요하게 반복 수정하지 않는다.

## 15. 대표 E2E 인수 시나리오

### 15.1 목적과 범위

이 시나리오는 현재 선정한 1차 MVP의 핵심 기능이
Career 입력부터 Portfolio 결과 수정까지 End-to-End로 연결되었는지 확인한다.

새로운 Requirement, API, DB 구조 또는 상세 테스트 케이스를 정의하지 않는다.

### 15.2 대표 사용자와 선행 조건

대표 사용자는 로그인된 일반 사용자 1명이다.

선행 조건은 다음과 같다.

- 사용자가 로그인된 상태다.
- 사용자는 자신에게 귀속된 Career와 Portfolio만 관리할 수 있다.
- 인증 자체의 상세 동작은 이 시나리오에서 다루지 않는다.

### 15.3 Career 입력

사용자는 현재 MVP에 포함된 두 Category에서
각각 자신의 Career Record를 생성한다.

프로젝트 Record는 다음 필수값을 충족한다.

- 제목
- 프로젝트 설명

프로젝트에는 필요한 경우 여러 사용 기술과 여러 주요 성과를 입력할 수 있다.

학력·이력 Record는 다음 필수값을 충족한다.

- 제목
- 이력 유형
- 기관명

학력·이력에는 필요한 경우 여러 주요 활동 / 성과를 입력할 수 있다.

구체적인 예시 값은 새로운 비즈니스 정책으로 사용하지 않으며,
각 Record는 `requirements-spec.md`에 정의된 필수값과 검증 규칙을 따른다.

### 15.4 Career 조회 및 선택적 수정

사용자는 생성한 프로젝트와 학력·이력 Record를
각 Category의 목록에서 조회할 수 있다.

`MVP_SUPPORTING`까지 포함한 흐름에서는 필요한 경우
자신에게 귀속된 Career Record의 수정 가능한 정보를 변경할 수 있다.

수정된 Career 정보는 이후 새로운 Portfolio 생성 요청에서
생성 요청 시점의 현재 유효한 정보로 사용한다.

기존 Portfolio가 존재하는 경우 Career 수정은
기존 Portfolio의 내용에 자동으로 반영되지 않는다.

### 15.5 재료 고르기

사용자는 Portfolio 생성의 재료 고르기 단계에 진입한다.

하나의 선택 흐름에서 다음 Category의 사용 가능한
자신의 Career Record를 함께 확인할 수 있다.

- 프로젝트
- 학력·이력

각 재료 후보는 최소 다음 정보로 구분할 수 있다.

- 제목
- Career Category
- 해당 Record의 시기 또는 날짜 요약

대표 시나리오에서는 프로젝트 Record와 학력·이력 Record를 함께 선택하여
서로 다른 Category를 통합한 재료 선택 흐름이 동작하는지 확인한다.

### 15.6 Portfolio 생성 요청과 재료 검증

사용자는 선택한 Career Record를 재료로 Portfolio 생성을 요청한다.

Backend는 선택된 모든 Career Record에 대해 다음을 다시 검증한다.

- Record가 실제로 존재하는가
- 생성 요청 사용자에게 귀속되어 있는가
- 현재 새로운 Portfolio 생성에 사용할 수 있는가

모든 선택 Record가 유효한 경우에만 AI 생성 단계로 진행한다.

선택된 Record 중 하나라도 유효하지 않으면 전체 생성 요청을 중단하며,
일부 유효한 Record만으로 자동 생성하지 않는다.

### 15.7 AI 생성 및 결과 검증

Backend는 검증된 현재 Career 정보를 기반으로
AI 생성 파트에 Portfolio 생성을 요청한다.

AI Prompt, 모델 및 생성 알고리즘은 이 시나리오에서 다루지 않는다.

생성 결과를 정상 결과로 처리하려면 다음 조건을 충족해야 한다.

- 최소 1개의 유효한 Section이 존재한다.
- 해당 Section에 사용자가 확인할 수 있는 실제 콘텐츠가 존재한다.

위 조건을 충족하지 않는 결과는 완료된 Portfolio로 저장하지 않는다.

### 15.8 Portfolio 저장과 출처 추적

정상 생성 결과는 생성 요청 사용자에게 귀속된
새로운 Portfolio로 저장한다.

저장된 Portfolio는 다음 조건을 충족한다.

- 사용자는 여러 Portfolio를 보유할 수 있다.
- Portfolio에는 제목이 존재한다.
- 사용자가 제목을 입력하지 않은 경우 시스템 기본 제목을 사용할 수 있다.
- 현재 MVP에서는 Portfolio 제목 중복을 허용한다.
- Portfolio는 논리적으로 순서가 있는 Section으로 구성된다.

Portfolio 전체 수준에서 생성에 사용한 Career Record 집합을 추적할 수 있어야 한다.

Section 또는 콘텐츠 수준의 세부 출처 추적은
현재 MVP 성공 조건에 포함하지 않는다.

출처 추적은 원본 Career와 Portfolio 콘텐츠의 자동 동기화를 의미하지 않는다.

### 15.9 생성 결과 조회

생성 완료 후 사용자는 다음 흐름으로 결과를 확인한다.

1. 자신의 Portfolio 목록에서 새로 생성된 Portfolio를 확인한다.
2. 해당 Portfolio를 선택하여 단일 결과를 조회한다.
3. 생성된 Section과 콘텐츠를 확인한다.

다른 사용자의 Portfolio는 조회할 수 없다.

### 15.10 결과 수정

`MVP_SUPPORTING`까지 포함한 대표 흐름에서는
사용자가 자신에게 귀속된 Portfolio의 다음 항목을 수정할 수 있다.

- Portfolio 제목
- 기존 Section 콘텐츠

대표 시나리오에서는 위 항목 중 최소 하나를 수정하고
수정 결과가 정상적으로 반영되는지 확인한다.

Portfolio 수정은 원본 Career Record를 자동으로 변경하지 않는다.

다음 `POST_MVP` 기능은 대표 시나리오의 성공 조건에 포함하지 않는다.

- Section 추가
- Section 삭제
- Section 순서 변경
- Block 단위 편집
- AI 재생성

### 15.11 대표 성공 조건

- [ ] 프로젝트 Career Record를 생성할 수 있다.
- [ ] 학력·이력 Career Record를 생성할 수 있다.
- [ ] 생성한 두 Category의 Record를 각각 조회할 수 있다.
- [ ] 서로 다른 Category의 Record를 재료 고르기에서 함께 조회할 수 있다.
- [ ] 최소 1개 이상의 Career Record를 선택할 수 있다.
- [ ] 프로젝트와 학력·이력 Record를 함께 선택할 수 있다.
- [ ] Backend가 선택한 Career Record 전체를 다시 검증한다.
- [ ] 정상 선택값으로 AI Portfolio 생성을 요청할 수 있다.
- [ ] 최소 1개의 유효한 Section과 실제 콘텐츠가 있는 결과만 정상 결과로 처리한다.
- [ ] 정상 생성 결과가 요청 사용자의 Portfolio로 저장된다.
- [ ] Portfolio 생성에 사용된 Career Record 집합을 Portfolio 수준에서 추적할 수 있다.
- [ ] 자신의 Portfolio 목록에서 생성 결과를 확인할 수 있다.
- [ ] 자신의 단일 Portfolio에서 Section과 콘텐츠를 확인할 수 있다.
- [ ] Portfolio 제목 또는 기존 Section 콘텐츠 중 최소 하나를 수정할 수 있다.
- [ ] Portfolio 수정이 원본 Career Record를 자동으로 변경하지 않는다.

### 15.12 대표 실패 경계

#### A. 선택 재료 검증 실패

선택된 Career Record 중 하나가 생성 요청 시점에 유효하지 않으면
전체 생성 요청을 중단한다.

일부 유효한 Career Record만으로 자동 생성하지 않는다.

#### B. AI 결과 최소 조건 실패

AI 생성 결과에 유효한 Section 또는 실제 콘텐츠가 없으면
완료된 Portfolio로 저장하지 않는다.

그 밖의 세부 실패 조건은 이후 API 및 테스트 설계 단계에서 다룬다.
