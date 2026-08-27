# Expresso 1차 MVP Project API 명세

## 1. 목적

본 문서는 Expresso 1차 MVP의 Project Career Record API 계약을 정의한다.

현재 문서화 범위는 다음 API로 제한한다.

```http
POST /v1/career/projects
GET /v1/career/projects
GET /v1/career/projects/{careerRecordId}
PATCH /v1/career/projects/{careerRecordId}
```

Project 삭제 API는 본 문서에서 정의하지 않는다.

## 2. 기준 문서

- `docs/requirements/requirements-spec.md`
- `docs/requirements/mvp-scope.md`
- `docs/requirements/erd/mvp-logical-erd.md`
- `docs/requirements/erd/mvp-physical-erd.md`
- `docs/requirements/erd/erdcloud/mvp-physical-erd-import.sql`

## 3. Project Career Record 생성

### 3.1 API 개요

| 항목 | 값 |
| --- | --- |
| Method | `POST` |
| URI | `/v1/career/projects` |
| 성공 Status | `201 Created` |
| 요청 형식 | `application/json` |
| 응답 형식 | `application/json` |

인증된 사용자는 자신의 Project Career Record를 생성할 수 있다.

Career Category는 URI에 따라 Project로 고정한다. `userId`는 Request Body로 받지
않고 인증 컨텍스트에서 가져온다. 인증 방식 자체는 본 문서에서 정의하지 않는다.

### 3.2 Request Body

| 필드 | 타입 | 필수 | Nullable | 제약 및 의미 |
| --- | --- | --- | --- | --- |
| `title` | string | 필수 | 불가 | trim 후 빈 값 불가, 최대 255자 |
| `description` | string | 필수 | 불가 | trim 후 빈 값 불가, 최대 5000자 |
| `startMonth` | string | 선택 | 허용 | 값이 있으면 `YYYY-MM` |
| `endMonth` | string | 선택 | 허용 | 값이 있으면 `YYYY-MM` |
| `isOngoing` | boolean | 필수 | 불가 | 프로젝트 진행 중 여부 |
| `role` | string | 선택 | 허용 | 값이 있으면 trim 후 빈 값 불가, 최대 255자 |
| `technologies` | string[] | 선택 | 불가 | 생략 또는 빈 배열 허용, 최대 20개 |
| `keyAchievements` | string[] | 선택 | 불가 | 생략 또는 빈 배열 허용, 최대 20개 |
| `projectLink` | string | 선택 | 허용 | 절대 HTTP(S) URL, 최대 2048자 |

`technologies`와 `keyAchievements`의 생략 및 빈 배열은 각각 항목이 없다는 같은
의미이다. 두 필드에 `null`은 허용하지 않는다.

대표 이미지 관련 필드는 이번 Request Body에 포함하지 않는다.

### 3.3 Request 예시

```json
{
  "title": "Expresso",
  "description": "커리어 정보를 활용한 포트폴리오 생성 서비스",
  "startMonth": "2026-03",
  "endMonth": null,
  "isOngoing": true,
  "role": "Backend Developer",
  "technologies": [
    "Spring Boot",
    "MySQL"
  ],
  "keyAchievements": [
    "Career와 Portfolio의 독립성 정책 설계",
    "비동기 Portfolio 생성 구조 설계"
  ],
  "projectLink": "https://github.com/Expresso-Organization/expresso"
}
```

### 3.4 문자열 처리

사용자가 입력한 문자열은 다음 순서로 처리한다.

```text
입력
→ 앞뒤 공백 trim
→ 빈 값 검증
→ 길이 및 형식 검증
→ trim 결과 저장
```

내부 공백은 변경하지 않는다. 빈 문자열을 `null`로 자동 변환하지 않는다.

- `title`과 `description`은 생략, `null`, 빈 문자열 및 공백만 있는 값을 허용하지
  않는다.
- `role`과 `projectLink`는 생략 또는 `null`을 허용한다. 값이 제공되면 trim 후 빈
  값을 허용하지 않는다.
- 길이 제한은 trim 결과를 기준으로 검증한다.

### 3.5 기간 검증

Project 기간은 정확히 다음 세 상태 중 하나여야 한다.

| 상태 | `startMonth` | `endMonth` | `isOngoing` |
| --- | --- | --- | --- |
| 기간 없음 | `null` 또는 생략 | `null` 또는 생략 | `false` |
| 종료됨 | 값 | 값 | `false` |
| 진행 중 | 값 | `null` 또는 생략 | `true` |

다음 요청은 허용하지 않는다.

- `startMonth` 없이 `endMonth`가 존재하는 요청
- `startMonth` 없이 `isOngoing`이 `true`인 요청
- `startMonth`만 있고 `isOngoing`이 `false`인 요청
- `endMonth`가 존재하면서 `isOngoing`이 `true`인 요청
- `endMonth`가 `startMonth`보다 빠른 요청
- 유효한 `YYYY-MM`을 표현하지 못하는 요청

미래 월은 금지하지 않는다. API의 `YYYY-MM` 값은 DB 저장 전에 해당 월의 첫째 날
`DATE`로 변환한다.

```text
2026-08
→ 2026-08-01
```

### 3.6 사용 기술 검증

`technologies`는 다음 규칙을 따른다.

- 각 element는 string이다.
- 각 element는 trim 후 빈 값일 수 없다.
- 각 element는 trim 후 최대 100자이다.
- 한 요청에 최대 20개까지 입력할 수 있다.
- trim 결과가 완전히 같은 element를 중복 입력할 수 없다.
- 대소문자 변환과 Unicode 정규화는 수행하지 않는다.
- 입력 순서와 응답 순서를 API 계약으로 보장하지 않는다.

각 element는 `project_technology_items`에 한 행으로 저장한다. 반복값 item ID는
외부 API에 노출하지 않는다.

### 3.7 주요 성과 검증

`keyAchievements`는 다음 규칙을 따른다.

- 각 element는 string이다.
- 각 element는 trim 후 빈 값일 수 없다.
- 각 element는 trim 후 최대 1000자이다.
- 한 요청에 최대 20개까지 입력할 수 있다.
- trim 결과가 완전히 같은 element를 중복 입력할 수 없다.
- 대소문자 변환과 Unicode 정규화는 수행하지 않는다.
- 입력 순서와 응답 순서를 API 계약으로 보장하지 않는다.

각 element는 `project_achievement_items`에 한 행으로 저장한다. 반복값 item ID는
외부 API에 노출하지 않는다.

### 3.8 프로젝트 링크 검증

`projectLink`가 제공되면 다음을 모두 만족해야 한다.

- trim 후 빈 값이 아니다.
- 최대 2048자이다.
- 유효한 절대 URL이다.
- scheme은 `http` 또는 `https`이다.

상대 URL과 `ftp`, `javascript` 등 다른 scheme은 허용하지 않는다. 외부 네트워크
요청을 통한 실제 접속 가능 여부는 검사하지 않는다.

### 3.9 대표 이미지 제외

이번 API의 Request와 Response에는 다음을 포함한 대표 이미지 관련 필드를 두지
않는다.

- `representativeImageKey`
- `imageUrl`
- `assetId`
- 파일 또는 업로드 관련 필드

Project 생성 시 `projects.representative_image_key`는 `NULL`일 수 있다. 대표 이미지
기능을 MVP에서 제거한 것은 아니며, 업로드와 Asset 계약을 별도로 설계한 뒤 Project
Create 또는 Update 계약과 연결한다.

### 3.10 생성 처리와 트랜잭션

Project 생성은 다음 순서로 처리한다.

```text
인증 사용자 확인
→ Request 전체 검증
→ 트랜잭션 시작
→ career_records 생성
→ projects 생성
→ project_technology_items 생성
→ project_achievement_items 생성
→ 전체 성공 시 Commit
```

하나라도 실패하면 전체를 Rollback한다. 일부 테이블만 저장되는 부분 성공은
허용하지 않는다.

동일하거나 유사한 Project가 이미 존재하더라도 새 Project 생성을 제한하지 않는다.
Project 중복 또는 유사성 자체는 `409 Conflict` 사유가 아니다.

### 3.11 성공 Response

생성에 성공하면 `201 Created`와 생성된 Project의 현재 전체 표현을 반환한다.

| 필드 | 타입 | Nullable | 설명 |
| --- | --- | --- | --- |
| `careerRecordId` | decimal string | 불가 | 생성된 CareerRecord의 BIGINT 식별자 |
| `title` | string | 불가 | 저장된 제목 |
| `description` | string | 불가 | 저장된 프로젝트 설명 |
| `startMonth` | string | 허용 | `YYYY-MM` 시작 월 |
| `endMonth` | string | 허용 | `YYYY-MM` 종료 월 |
| `isOngoing` | boolean | 불가 | 진행 중 여부 |
| `role` | string | 허용 | 저장된 역할 |
| `technologies` | string[] | 불가 | 저장된 기술 값, 없으면 빈 배열 |
| `keyAchievements` | string[] | 불가 | 저장된 주요 성과 값, 없으면 빈 배열 |
| `projectLink` | string | 허용 | 저장된 프로젝트 링크 |
| `createdAt` | timestamp string | 불가 | CareerRecord 생성 시점 |

BIGINT 식별자는 외부 JSON에서 decimal string으로 표현한다. DB와 Java 내부에서는
각각 BIGINT와 Long을 유지한다.

반복값 item ID, `userId` 및 대표 이미지 관련 필드는 반환하지 않는다. 반복값 배열의
응답 순서는 보장하지 않는다. `createdAt`의 구체적인 timestamp 형식은 공통 API
규격에서 통일한다.

### 3.12 Response 예시

```json
{
  "data": {
    "careerRecordId": "101",
    "title": "Expresso",
    "description": "커리어 정보를 활용한 포트폴리오 생성 서비스",
    "startMonth": "2026-03",
    "endMonth": null,
    "isOngoing": true,
    "role": "Backend Developer",
    "technologies": [
      "Spring Boot",
      "MySQL"
    ],
    "keyAchievements": [
      "Career와 Portfolio의 독립성 정책 설계",
      "비동기 Portfolio 생성 구조 설계"
    ],
    "projectLink": "https://github.com/Expresso-Organization/expresso",
    "createdAt": "<timestamp>"
  }
}
```

반복값이 없으면 다음과 같이 빈 배열을 반환한다.

```json
{
  "technologies": [],
  "keyAchievements": []
}
```

### 3.13 Location Header

생성 성공 시 다음 Header를 제공한다.

```http
Location: /v1/career/projects/{careerRecordId}
```

URI Path의 BIGINT 식별자도 decimal 형태로 표현한다. `201 Created` 성공 여부를
Location Header의 존재 자체에 종속시키지는 않는다.

### 3.14 오류 상황

본 API에서는 다음 오류 상황을 고려한다.

- 인증되지 않은 요청
- JSON 형식 또는 필드 타입이 유효하지 않은 요청
- 필수 필드가 누락되었거나 `null`인 요청
- 문자열, 배열 또는 배열 element가 정의된 제한을 위반한 요청
- 기간 조합 또는 `YYYY-MM` 형식이 유효하지 않은 요청
- 프로젝트 링크가 정의된 URL 규칙을 위반한 요청
- 저장 처리 중 예상하지 못한 실패

공통 Error DTO의 상세 구조와 Validation 오류의 `400 Bad Request` 또는
`422 Unprocessable Content` 구분은 공통 API 정책에서 최종 통일한다. 인증 구현
방식도 본 문서에서 정하지 않는다.

## 4. Project Career Record 목록 조회

### 4.1 API 개요

| 항목 | 값 |
| --- | --- |
| Method | `GET` |
| URI | `/v1/career/projects` |
| 성공 Status | `200 OK` |
| 응답 형식 | `application/json` |

인증된 사용자는 자신에게 귀속된 Project Career Record 목록을 조회할 수 있다.
다른 사용자의 Career Record와 Project가 아닌 다른 subtype은 결과에 포함하지
않는다.

### 4.2 Request

Path Parameter, Query Parameter 및 Request Body는 사용하지 않는다. `userId`는
Request로 받지 않고 인증 컨텍스트에서 가져온다.

현재 1차 MVP에서는 다음 Query Parameter를 추가하지 않는다.

- `page`
- `size`
- `cursor`
- `q`
- `search`
- `sort`
- `order`
- `status`
- `category`
- `userId`
- `startDate`
- `endDate`

### 4.3 목록 Response

목록에서는 Project의 전체 상세 표현이 아니라 목록 화면에 필요한 Summary 표현을
반환한다.

| 필드 | 타입 | Nullable | 설명 |
| --- | --- | --- | --- |
| `careerRecordId` | decimal string | 불가 | CareerRecord의 BIGINT 식별자 |
| `title` | string | 불가 | 저장된 제목 |
| `description` | string | 불가 | 저장된 프로젝트 설명 |
| `startMonth` | string | 허용 | `YYYY-MM` 시작 월 |
| `endMonth` | string | 허용 | `YYYY-MM` 종료 월 |
| `isOngoing` | boolean | 불가 | 진행 중 여부 |
| `role` | string | 허용 | 저장된 역할 |
| `technologies` | string[] | 불가 | 저장된 기술 값, 없으면 빈 배열 |
| `keyAchievements` | string[] | 불가 | 저장된 주요 성과 값, 없으면 빈 배열 |
| `createdAt` | timestamp string | 불가 | CareerRecord 생성 시점 |

`projectLink`는 목록 Response에 포함하지 않고 단일 상세 조회에서 제공한다.
`description`은 저장된 전체 값을 반환하며, 목록 화면에서 일부만 표시하는 방식은
표현 계층에서 결정한다.

BIGINT 식별자는 외부 JSON에서 decimal string으로 표현한다. 반복값 item ID와
`userId`는 반환하지 않는다. `technologies`와 `keyAchievements`의 응답 순서는
보장하지 않으며 값이 없으면 각각 빈 배열을 반환한다. `createdAt`의 구체적인
timestamp 형식은 공통 API 규격에서 통일한다.

### 4.4 성공 Response

정상 조회 시 `200 OK`를 반환한다.

```json
{
  "data": [
    {
      "careerRecordId": "101",
      "title": "Expresso",
      "description": "커리어 정보를 활용한 포트폴리오 생성 서비스",
      "startMonth": "2026-03",
      "endMonth": null,
      "isOngoing": true,
      "role": "Backend Developer",
      "technologies": [
        "Spring Boot",
        "MySQL"
      ],
      "keyAchievements": [
        "Career와 Portfolio의 독립성 정책 설계"
      ],
      "createdAt": "<timestamp>"
    }
  ]
}
```

### 4.5 빈 목록

조회할 Project가 없으면 `404 Not Found`가 아니라 `200 OK`와 빈 배열을 반환한다.

```json
{
  "data": []
}
```

### 4.6 기본 정렬

Project 목록은 `REQ-CAR-012`에 따라 다음 순서로 정렬한다.

1. 기간이 있는 Project를 기간이 없는 Project보다 먼저 배치한다.
2. 기간이 있는 Project끼리는 `startMonth` 내림차순으로 정렬한다.
3. `startMonth`가 같으면 진행 중인 Project를 먼저 배치한다.
4. 동일한 `startMonth`를 가진 두 Project가 모두 종료되었다면 `endMonth`
   내림차순으로 정렬한다.
5. 위 조건까지 같으면 `title` 오름차순으로 정렬한다.
6. `title`까지 같으면 `createdAt` 내림차순으로 정렬한다.
7. 기간이 없는 Project끼리는 `title` 오름차순, `createdAt` 내림차순으로
   정렬한다.
8. 위 모든 정렬값까지 같으면 결정적인 결과를 위해 `careerRecordId`
   내림차순을 최종 내부 tie-breaker로 사용한다.

`createdAt` 내림차순과 `careerRecordId` 내림차순만을 목록의 공식 기본 정렬로
사용하지 않는다. `title` 정렬의 구체적인 DB Collation은 현재 API 계약에서
확정하지 않는다.

### 4.7 Pagination

현재 1차 MVP에서는 pagination을 사용하지 않고 인증 사용자의 Project 전체를
반환한다. `page`, `size` 및 `cursor`는 현재 계약에 포함하지 않는다.

### 4.8 소유권

목록은 개념적으로 다음 조건을 만족하는 Record만 반환한다.

```text
career_records.user_id = authenticatedUserId
AND projects subtype이 존재함
```

다른 사용자의 Record는 응답에 포함하지 않는다. 사용자 식별자는 Query Parameter로
노출하지 않는다.

### 4.9 HTTP Status

- 정상 조회: `200 OK`
- 빈 목록: `200 OK`
- 인증 정보가 없는 요청: `401 Unauthorized` 가능

인증 방식 자체는 현재 정의하지 않는다. 특정 Project 식별자를 입력받지 않는 목록
조회이므로 일반적인 정상 목록 조회에서 `404 Not Found`는 사용하지 않는다.

### 4.10 DB 조회 고려사항

목록 Response를 구성하려면 개념적으로 다음 테이블의 데이터가 필요하다.

- `career_records`
- `projects`
- `project_technology_items`
- `project_achievement_items`

`technologies`와 `keyAchievements`를 동시에 단순 JOIN하면 두 반복값 조합만큼 결과
행이 증가할 수 있다. N+1 조회를 피하는 구체적인 구현 방식은 구현 단계에서
결정하며, 다음 기술은 현재 API 계약에서 확정하지 않는다.

- Fetch Join
- EntityGraph
- QueryDSL
- Batch Size
- JPQL
- Repository 구현 방식

### 4.11 대표 이미지 보류

현재 Project API의 이미지 계약이 보류되어 있으므로 목록 Response에도 대표 이미지
관련 필드를 추가하지 않는다.

SRS는 Project 목록에서 대표 이미지 썸네일 또는 시스템 기본 이미지를 표시하도록
요구한다. 이미지 계약이 결정되면 해당 요구사항을 충족하도록 목록 Response를
보완해야 한다.

## 5. Project Career Record 단일 조회

### 5.1 API 개요

| 항목 | 값 |
| --- | --- |
| Method | `GET` |
| URI | `/v1/career/projects/{careerRecordId}` |
| 성공 Status | `200 OK` |
| 응답 형식 | `application/json` |

인증된 사용자는 자신에게 귀속된 특정 Project Career Record의 현재 전체 정보를
조회할 수 있다. 이 API는 Project 상세 조회, 수정 화면 초기값 조회 및 특정 Project
직접 조회에 사용한다.

### 5.2 Request

| 구분 | 값 |
| --- | --- |
| Path Parameter | `careerRecordId` |
| Query Parameter | 없음 |
| Request Body | 없음 |

`userId`는 Request로 받지 않고 인증 컨텍스트에서 가져온다.

### 5.3 careerRecordId 검증

URI의 `careerRecordId`는 decimal integer로 표현하며 다음 조건을 모두 만족해야 한다.

- ASCII `0`부터 `9`까지의 문자만 사용한다.
- 숫자 값은 1 이상이어야 한다.
- Java `Long` 범위 이내여야 한다.

다음 값은 허용하지 않는다.

- `0`
- `-1`
- `+1`
- `1.0`
- `abc`
- 공백이 포함된 값
- `Long.MAX_VALUE`를 초과하는 값

형식 또는 범위가 잘못된 Path Parameter에는 `400 Bad Request`를 사용한다. 형식은
유효하지만 현재 사용자가 조회할 수 있는 Project Resource가 발견되지 않으면
`404 Not Found`를 사용한다.

### 5.4 상세 Response

단일 조회는 목록 Summary가 아니라 Project의 전체 현재 표현을 반환한다. 외부 API
Schema는 `POST /v1/career/projects` 성공 Response의 Project Detail 표현과 동일하게
유지한다.

| 필드 | 타입 | Nullable | 설명 |
| --- | --- | --- | --- |
| `careerRecordId` | decimal string | 불가 | CareerRecord의 BIGINT 식별자 |
| `title` | string | 불가 | 저장된 제목 |
| `description` | string | 불가 | 저장된 프로젝트 설명 |
| `startMonth` | string | 허용 | `YYYY-MM` 시작 월 |
| `endMonth` | string | 허용 | `YYYY-MM` 종료 월 |
| `isOngoing` | boolean | 불가 | 진행 중 여부 |
| `role` | string | 허용 | 저장된 역할 |
| `technologies` | string[] | 불가 | 저장된 기술 값, 없으면 빈 배열 |
| `keyAchievements` | string[] | 불가 | 저장된 주요 성과 값, 없으면 빈 배열 |
| `projectLink` | string | 허용 | 저장된 프로젝트 링크 |
| `createdAt` | timestamp string | 불가 | CareerRecord 생성 시점 |

BIGINT 식별자는 외부 JSON에서 decimal string으로 표현한다. 반복값 item ID와
`userId`는 반환하지 않는다. `technologies`와 `keyAchievements`의 응답 순서는
보장하지 않으며 값이 없으면 각각 빈 배열을 반환한다. `createdAt`의 구체적인
timestamp 형식은 공통 API 규격에서 통일한다.

POST 성공 Response와 GET 단일 조회는 동일한 외부 Project Detail Schema를
사용한다. 동일한 Java DTO 클래스를 실제로 재사용할지는 구현 단계에서 결정하며
현재 API 계약에서 강제하지 않는다.

### 5.5 성공 Response

정상 조회 시 `200 OK`를 반환한다.

```json
{
  "data": {
    "careerRecordId": "101",
    "title": "Expresso",
    "description": "커리어 정보를 활용한 포트폴리오 생성 서비스",
    "startMonth": "2026-03",
    "endMonth": null,
    "isOngoing": true,
    "role": "Backend Developer",
    "technologies": [
      "Spring Boot",
      "MySQL"
    ],
    "keyAchievements": [
      "Career와 Portfolio의 독립성 정책 설계"
    ],
    "projectLink": "https://github.com/Expresso-Organization/expresso",
    "createdAt": "<timestamp>"
  }
}
```

### 5.6 Resource 미존재 정책

다음 세 경우는 외부 API에서 모두 Project Resource를 찾지 못한 것으로 처리한다.

1. `careerRecordId`에 해당하는 CareerRecord가 존재하지 않는다.
2. CareerRecord는 존재하지만 Project subtype이 아니다.
3. Project는 존재하지만 다른 사용자가 소유한다.

세 경우 모두 `404 Not Found`를 반환한다. 다른 사용자 소유 Project에도
`403 Forbidden`을 사용하지 않는다. 이를 통해 Resource 존재 여부가 다른
사용자에게 노출되지 않도록 하고 현재 사용자의 Project 조회 경계를 일관되게
유지한다.

### 5.7 소유권

단일 조회는 개념적으로 다음 조건을 모두 만족하는 Resource를 조회한다.

```text
career_records.id = careerRecordId
AND career_records.user_id = authenticatedUserId
AND projects subtype이 존재함
```

외부 계약에서는 ID로 먼저 조회한 뒤 `403` 권한 검사를 수행하는 방식이 아니라,
현재 사용자가 접근할 수 있는 Project Resource를 조회하는 것으로 본다. 위 조건을
만족하는 Resource가 없으면 `404 Not Found`를 반환한다. 구체적인 Repository 및
ORM 구현 방식은 현재 정의하지 않는다.

### 5.8 HTTP Status

- 정상 조회: `200 OK`
- `careerRecordId` 형식 또는 범위 오류: `400 Bad Request`
- 인증 정보가 없는 요청: `401 Unauthorized` 가능
- Project 미존재: `404 Not Found`
- 다른 사용자 소유: `404 Not Found`
- Project subtype 불일치: `404 Not Found`

인증 방식 자체는 현재 정의하지 않는다. 이 API의 소유권 처리에는
`403 Forbidden`을 사용하지 않으며 `409 Conflict`도 사용하지 않는다.

### 5.9 반복값

`technologies`와 `keyAchievements`에는 기존 Project API의 반복값 정책을 동일하게
적용한다.

- 각 필드는 `string[]`이다.
- 값이 없으면 빈 배열을 반환한다.
- 반복값 item ID는 노출하지 않는다.
- 배열 순서는 보장하지 않는다.

단일 Project 조회에는 개념적으로 `career_records`, `projects`,
`project_technology_items` 및 `project_achievement_items`의 데이터가 필요하다.
구체적인 Fetch Join, EntityGraph, QueryDSL, Batch Size, JPQL 및 Repository 구현
방식은 현재 API 계약에서 확정하지 않는다.

### 5.10 대표 이미지 보류

현재 Project API의 이미지 계약이 보류되어 있으므로 다음 필드를 단일 조회
Response에 추가하지 않는다.

- `representativeImageKey`
- `representativeImageUrl`
- `imageUrl`
- `assetId`

향후 이미지 계약이 결정되면 Project 생성, 목록 조회, 단일 조회 및 수정 API를 함께
보완할 수 있다.

### 5.11 기존 API와의 관계

- POST 성공 Response와 단일 조회 Response는 동일한 외부 Project Detail Schema를
  사용한다.
- 목록 조회는 Summary, 단일 조회는 Detail 역할을 유지한다.
- 단일 조회에는 목록 Summary에서 제외한 `projectLink`를 포함한다.
- BIGINT 식별자, `YYYY-MM`, 반복값 배열 및 대표 이미지 보류 정책을 기존 API와
  동일하게 유지한다.

## 6. Project Career Record 수정

### 6.1 API 개요

| 항목 | 값 |
| --- | --- |
| Method | `PATCH` |
| URI | `/v1/career/projects/{careerRecordId}` |
| 성공 Status | `200 OK` |
| 요청 형식 | `application/json` |
| 응답 형식 | `application/json` |

인증된 사용자는 자신에게 귀속된 Project Career Record의 수정 가능한 필드를
부분 수정할 수 있다.

### 6.2 Request

#### Path Parameter

| 이름 | 형식 | 필수 | 설명 |
| --- | --- | --- | --- |
| `careerRecordId` | JSON 외부 계약상 10진 정수 문자열 | 예 | 수정할 Project Career Record 식별자 |

`careerRecordId`는 다음 조건을 모두 만족해야 한다.

- ASCII 10진 숫자로만 구성한다.
- 값은 1 이상이어야 한다.
- Java `Long` 범위 이내여야 한다.

형식 또는 범위가 잘못된 경우 `400 Bad Request`를 반환한다.

Query Parameter는 사용하지 않는다. 사용자 식별자는 Request에 포함하지 않고 인증
컨텍스트에서 가져온다.

### 6.3 PATCH 기본 의미

- 필드를 생략하면 기존 값을 유지한다.
- nullable 필드에 `null`을 지정하면 기존 값을 제거한다.
- 실제 값을 지정하면 해당 값으로 변경한다.
- 수정 가능한 필드가 최소 1개 이상 포함되어야 하며, 빈 객체 `{}`는 허용하지
  않는다.
- 빈 PATCH의 Validation 실패를 `400` 또는 `422` 중 어느 상태로 처리할지는 공통
  Validation 정책에서 결정한다.
- 기존 값과 동일한 값을 다시 지정하는 요청도 허용하며 `200 OK`를 반환한다.
- 동일 값 수정을 이유로 `409 Conflict`를 사용하지 않는다.

### 6.4 수정 가능 필드와 수정 불가 필드

수정 가능한 필드는 다음과 같다.

- `title`
- `description`
- `startMonth`
- `endMonth`
- `isOngoing`
- `role`
- `technologies`
- `keyAchievements`
- `projectLink`

다음 값은 수정할 수 없으며 Request 필드로 받지 않는다.

- `careerRecordId`
- `userId`
- `category`
- `subtype`
- `createdAt`

대표 이미지 관련 필드는 현재 보류하므로 Request에 포함하지 않는다.

### 6.5 문자열 필드 검증

#### `title`

- 생략하면 기존 값을 유지한다.
- 명시적 `null`은 허용하지 않는다.
- 문자열을 trim한 결과가 비어 있으면 허용하지 않는다.
- trim 후 최대 255자까지 허용한다.

#### `description`

- 생략하면 기존 값을 유지한다.
- 명시적 `null`은 허용하지 않는다.
- 문자열을 trim한 결과가 비어 있으면 허용하지 않는다.
- trim 후 최대 5000자까지 허용한다.

#### `role`

- 생략하면 기존 값을 유지한다.
- `null`이면 기존 값을 제거한다.
- 문자열이면 trim한 결과가 비어 있으면 허용하지 않는다.
- trim 후 최대 255자까지 허용한다.

#### `projectLink`

- 생략하면 기존 값을 유지한다.
- `null`이면 기존 링크를 제거한다.
- 문자열이면 trim한 결과가 비어 있으면 허용하지 않는다.
- trim 후 최대 2048자까지 허용한다.
- `http` 또는 `https` scheme을 사용하는 절대 URL이어야 한다.
- 링크의 실제 접근 가능 여부는 검사하지 않는다.

### 6.6 사용 기술 수정

`technologies`는 전체 배열 교체 방식으로 수정한다.

- 생략하면 기존 배열을 유지한다.
- 빈 배열 `[]`이면 기존 기술을 모두 제거한다.
- 배열을 지정하면 전달된 배열로 전체 교체한다.
- 명시적 `null`은 허용하지 않는다.
- 타입은 `string[]`이다.
- 최대 20개까지 허용한다.
- 각 항목은 trim 후 비어 있으면 안 되며 최대 100자까지 허용한다.
- trim 결과가 완전히 같은 문자열의 중복은 허용하지 않는다.
- 배열 순서는 외부 계약에서 보장하지 않는다.
- 반복값 item ID는 외부 계약에 노출하지 않는다.

### 6.7 주요 성과 수정

`keyAchievements`는 전체 배열 교체 방식으로 수정한다.

- 생략하면 기존 배열을 유지한다.
- 빈 배열 `[]`이면 기존 주요 성과를 모두 제거한다.
- 배열을 지정하면 전달된 배열로 전체 교체한다.
- 명시적 `null`은 허용하지 않는다.
- 타입은 `string[]`이다.
- 최대 20개까지 허용한다.
- 각 항목은 trim 후 비어 있으면 안 되며 최대 1000자까지 허용한다.
- trim 결과가 완전히 같은 문자열의 중복은 허용하지 않는다.
- 배열 순서는 외부 계약에서 보장하지 않는다.
- 반복값 item ID는 외부 계약에 노출하지 않는다.

### 6.8 기간 수정 및 검증

기간 필드는 기존 상태와 PATCH Request를 병합한 최종 후보 상태를 기준으로 전체
검증한다.

| 필드 | 생략 | `null` | 값 지정 |
| --- | --- | --- | --- |
| `startMonth` | 기존 값 유지 | 값 제거 | `YYYY-MM` 값으로 변경 |
| `endMonth` | 기존 값 유지 | 값 제거 | `YYYY-MM` 값으로 변경 |
| `isOngoing` | 기존 값 유지 | 허용하지 않음 | boolean 값으로 변경 |

최종 후보 상태는 다음 세 가지 중 하나여야 한다.

1. 기간 없음
   - `startMonth = null`
   - `endMonth = null`
   - `isOngoing = false`
2. 종료된 프로젝트
   - `startMonth = 값`
   - `endMonth = 값`
   - `isOngoing = false`
3. 진행 중인 프로젝트
   - `startMonth = 값`
   - `endMonth = null`
   - `isOngoing = true`

`endMonth`는 `startMonth`보다 빠를 수 없다. 최종 후보 상태가 위 규칙을 만족하지
않으면 PATCH 요청 전체를 실패시킨다.

### 6.9 수정 처리와 트랜잭션

수정은 다음 순서로 하나의 트랜잭션에서 처리한다.

1. 인증 사용자 기준으로 대상 Project를 조회한다.
2. 기존 Project 전체 상태에 PATCH 값을 병합한다.
3. 병합한 Project 전체를 검증한다.
4. `career_records`와 `projects`의 대상 값을 수정한다.
5. `technologies`가 제공되었다면 기존 기술을 전달된 배열로 전체 교체한다.
6. `keyAchievements`가 제공되었다면 기존 주요 성과를 전달된 배열로 전체 교체한다.
7. 모든 작업이 성공한 경우에만 Commit한다.

하나라도 실패하면 변경사항 전체를 Rollback한다. 일부 필드 또는 일부 반복값만
반영하는 부분 성공은 허용하지 않는다.

### 6.10 성공 Response

수정에 성공하면 `200 OK`와 함께 수정 후 Project 전체 Detail을 반환한다.

| 필드 | 형식 | nullable | 설명 |
| --- | --- | --- | --- |
| `careerRecordId` | decimal string | 아니요 | Career Record 식별자 |
| `title` | string | 아니요 | 프로젝트 제목 |
| `description` | string | 아니요 | 프로젝트 설명 |
| `startMonth` | `YYYY-MM` string | 예 | 시작 연·월 |
| `endMonth` | `YYYY-MM` string | 예 | 종료 연·월 |
| `isOngoing` | boolean | 아니요 | 진행 중 여부 |
| `role` | string | 예 | 프로젝트 역할 |
| `technologies` | string array | 아니요 | 사용 기술 목록 |
| `keyAchievements` | string array | 아니요 | 주요 성과 목록 |
| `projectLink` | string | 예 | 프로젝트 링크 |
| `createdAt` | RFC 3339 timestamp string | 아니요 | 생성 시점 |

- BIGINT 식별자는 JSON decimal string으로 반환한다.
- 반복값이 없으면 빈 배열 `[]`을 반환한다.
- 대표 이미지 필드는 포함하지 않는다.
- `204 No Content`는 사용하지 않는다.
- POST 성공 Response 및 GET 단일 조회와 동일한 외부 Project Detail Schema를
  사용한다.

### 6.11 Response 예시

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "careerRecordId": "123",
  "title": "Expresso",
  "description": "취업 준비를 위한 근거 기반 포트폴리오 서비스",
  "startMonth": "2026-03",
  "endMonth": null,
  "isOngoing": true,
  "role": "백엔드 개발",
  "technologies": [
    "Java",
    "Spring Boot"
  ],
  "keyAchievements": [
    "Career Record 기반 포트폴리오 생성 흐름 설계"
  ],
  "projectLink": "https://github.com/Expresso-Organization/expresso",
  "createdAt": "2026-08-21T09:30:00+09:00"
}
```

### 6.12 Resource 미존재 및 소유권 정책

다음 경우는 모두 `404 Not Found`로 처리한다.

- `careerRecordId`에 해당하는 Career Record가 존재하지 않는다.
- Career Record는 존재하지만 Project subtype이 아니다.
- Project는 존재하지만 현재 인증 사용자에게 귀속되지 않는다.

타 사용자 Resource의 존재 여부를 노출하지 않기 위해 소유권 불일치에도 `403
Forbidden`을 사용하지 않는다.

### 6.13 HTTP Status

| Status | 조건 |
| --- | --- |
| `200 OK` | 수정 성공 또는 동일 값 PATCH 성공 |
| `400 Bad Request` | `careerRecordId` 형식·범위 오류 또는 잘못된 JSON 구조·타입 후보 |
| `401 Unauthorized` | 인증 정보 없음 |
| `404 Not Found` | Project 미존재, 다른 사용자 소유 또는 subtype 불일치 |
| `400` 또는 `422` | Request Body Validation 오류. 공통 정책에서 최종 통일 |

중복 Project 또는 동일 값 PATCH를 이유로 `409 Conflict`를 사용하지 않는다.

### 6.14 대표 이미지 보류

Project API의 기존 대표 이미지 보류 정책을 유지한다. 이번 PATCH Request와
Response에는 다음 필드를 추가하지 않는다.

- `representativeImage`
- `representativeImageUrl`
- `imageUrl`
- `assetId`

향후 이미지 계약이 결정되면 Project 생성, 목록 조회, 단일 조회 및 수정 API를 함께
보완할 수 있다.

## 7. DB 매핑

| API 값 | 저장 위치 | 변환 또는 처리 |
| --- | --- | --- |
| 인증 사용자 | `career_records.user_id` | 인증 컨텍스트에서 가져온다. |
| `title` | `career_records.title` | trim 후 저장한다. |
| 생성 시점 | `career_records.created_at` | DB 생성 시점을 사용한다. |
| Project Category | `projects` 행 | 별도 Category Request 필드를 받지 않는다. |
| `description` | `projects.description` | trim 후 저장한다. |
| `startMonth` | `projects.start_month` | `YYYY-MM`을 월 첫째 날 DATE로 변환한다. |
| `endMonth` | `projects.end_month` | `YYYY-MM`을 월 첫째 날 DATE로 변환한다. |
| `isOngoing` | `projects.is_ongoing` | boolean으로 저장한다. |
| `role` | `projects.role` | 값이 있으면 trim 후 저장한다. |
| `projectLink` | `projects.project_link` | 형식 검증과 trim 후 저장한다. |
| 대표 이미지 | `projects.representative_image_key` | 이번 Create에서는 `NULL`이다. |
| `technologies[]` | `project_technology_items.technology_value` | element마다 한 행을 생성한다. |
| `keyAchievements[]` | `project_achievement_items.achievement_value` | element마다 한 행을 생성한다. |

## 8. 현재 범위 제외

다음 내용은 본 API 명세에서 정의하지 않는다.

- 대표 이미지 업로드, Asset 또는 저장소 계약
- 인증 방식
- 공통 Error DTO 상세 구조
- `400`과 `422`의 전체 공통 경계
- Idempotency-Key
- ETag 또는 If-Match
- 반복값 item 단위 API
- Project 삭제 API
