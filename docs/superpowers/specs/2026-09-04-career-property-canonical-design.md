# Career canonical PropertyDefinition / PropertyValue 설계

## 1. 목적과 범위

이 문서는 Career의 여러 Property 표현을 하나의 canonical 의미 모델로 정렬하기 위한 설계 기준을 확정한다. 구현, 기존 데이터 backfill, OpenAPI 변경, migration 작성은 이 문서의 범위가 아니다.

핵심 결정은 다음과 같다.

- PropertyDefinition의 공식 identity는 migration 0006이 `propertySchema`에 부여하고 `propertySchemaV2`가 이어받은 UUID 계보다.
- migration 0009의 `propertyDefinitions` UUID는 Spring 첫 Slice를 위해 추가된 별도 계보다. 공식 identity로 승격하지 않고 후속 forward migration에서 0006/V2 계보로 정렬한다.
- 공식 identity의 출처와 최종 저장 필드명은 구분한다. 장기 Category 저장소는 rich Definition 의미를 갖는 `propertyDefinitions` 하나로 수렴한다.
- 기존 migration 0006과 0009는 수정하지 않는다.
- `CareerRecord.title`은 root canonical field로 유지한다. 일반 PropertyDefinition이나 PropertyValue로 중복 저장하지 않는다.
- 사용자가 직접 쓰는 값, 관계 edge, 계산 결과, record metadata는 서로 다른 권위 저장소를 갖는다.

## 2. Repository에서 확인한 현재 상태

이 설계의 Repository 사실은 2026-09-05 현재 `feat/career-record-slice-1`의 `eaaf198` HEAD에서 다시 확인했다. 판단에 사용한 핵심 소스는 다음과 같다.

- `packages/database/src/mongodb-migrations/0006/migration.ts`: 0006 ID 생성과 기존 Category 적용 범위
- `packages/database/src/mongodb-migrations/0009/migration.ts`: Spring용 `propertyDefinitions`와 별도 ID 생성
- `packages/database/src/documents/career.ts`: Category/Record의 실제 Mongo document shape
- `packages/contracts/src/career-properties.ts`: V2 Definition/Value type 계약
- `packages/contracts/src/career-views.ts`: View가 참조하는 PropertyDefinition ID
- `services/backend/src/modules/career/property-schema.ts`: V2 fallback, schema mutation, tombstone 처리
- `services/backend/src/modules/career/relations.ts`: relation edge의 PropertyDefinition ID 사용
- `services/backend/src/modules/career/category-move.ts`: ID 기반 unmapped value 보존
- `packages/contracts/openapi/career-record-slice-v1.yaml`: Spring 첫 Slice의 TEXT 범위와 root `title`

문서의 추천은 이 소스들보다 우선하지 않는다. 구현 시 HEAD가 달라졌다면 같은 범위를 다시 inventory하고 충돌하는 사실을 먼저 설계에 반영한다.

### 2.1 세 가지 Property 표현

현재 `career_categories`에는 서로 다른 목적과 성숙도를 가진 표현이 공존한다.

| 표현 | 주요 필드 | ID 계보 | 현재 역할 |
| --- | --- | --- | --- |
| `propertySchema` | key별 `id`, `label`, `type`, `required`, `system` | 0006 UUIDv5 | legacy 저장/응답과 V2 fallback |
| `propertySchemaV2` | `id`, `key`, `name`, `type`, `required`, `system`, `config`, `order`, `version`, `deletedAt` | 0006 ID를 승계하거나 custom 생성 시 UUID 생성 | Fastify의 schema 편집, View, relation/formula/rollup 참조의 실질적 기준 |
| `propertyDefinitions` | `id`, `key`, `label`, `type`, `required`, `system` | 0009의 별도 UUIDv5 | Spring 첫 Slice의 system TEXT 정의 읽기 |

0006은 DNS UUID namespace와 `${categoryId}:${key}`를 사용해 ID를 생성한다. Fastify의 `stablePropertyId`도 같은 알고리즘을 사용한다. 0006은 당시 존재하던 system/custom Category 모두를 대상으로 하며, 이후 custom Property 생성은 UUID를 한 번 생성하고 V2 변경 과정에서 유지한다.

0009는 category UUID 자체를 namespace로 삼고 property key를 이름으로 사용하는 다른 UUIDv5 계산을 사용한다. 또한 system Category에만 `propertyDefinitions`를 추가했다. 따라서 두 migration은 동일한 Category/key에도 서로 다른 ID를 만든다. 예를 들어 `experience.role`은 0006 계보에서 `6c663539-48c1-5d12-939d-f100fac993c1`, 0009 계보에서 `1c768bad-2c1f-5cee-86c5-a43574f0e256`이다.

### 2.2 실제 참조 범위

0006/V2 ID는 단순 표시용 ID가 아니다. 현재 다음 데이터가 PropertyDefinition ID를 참조한다.

- View의 filter, sort, group, visible/order/width, gallery, timeline 설정
- relation edge의 `sourcePropertyId`, `inversePropertyId`
- relation/formula/rollup config와 formula AST
- 삭제 값의 `propertyValueTombstones`, Category 이동의 `unmappedProperties`
- property 변경 preview, outbox/event payload 등 비동기 작업 데이터

반면 Spring 첫 Slice의 `propertyValues`는 0009 `propertyDefinitions` ID를 사용하며 TEXT 값만 지원한다. 현재 Web/Fastify record 본체는 여전히 key 기반 `properties`를 주로 읽고 쓴다. 계산값은 `computedProperties`, 관계는 별도 relation collection이 권위 저장소다.

### 2.3 실제 type 범위

legacy `propertySchema`가 표현하는 type은 `text`, `number`, `date`, `tags`, `boolean`이다. system seed에서 실제 사용하는 type은 `text`, `tags`, `date`이며, 일부 의미상 URL인 값도 legacy에서는 `text`다.

V2 계약에는 다음 type이 있다.

`title`, `text`, `number`, `select`, `multi_select`, `date`, `checkbox`, `url`, `email`, `phone`, `file`, `media`, `relation`, `formula`, `rollup`, `created_time`, `updated_time`

Spring Career 첫 Slice OpenAPI와 Domain은 이 중 TEXT PropertyDefinition/PropertyValue만 지원한다.

## 3. Identity 접근 비교

| 관점 | A. 0009 Spring ID 유지 | B. 0006/V2 ID 사용 | C. 제3의 ID 도입 |
| --- | --- | --- | --- |
| 기존 데이터 | Spring `propertyValues`는 유지되지만 V2 참조를 대규모 변환해야 한다 | 기존 Spring `propertyValues`만 주로 변환하고 V2 생태계는 유지한다 | 양쪽 데이터와 모든 참조를 변환한다 |
| Web/Fastify | View, relation, schema 편집, tombstone 등의 ID를 바꿔야 한다 | 현재 V2/fallback 동작과 일치한다 | 현재 모든 Web/Fastify 참조가 바뀐다 |
| Spring | 현재 system TEXT 읽기는 편하지만 custom/full type 계보가 없다 | Category reader와 기존 Spring 값의 ID 정렬이 필요하다 | Spring과 기존 값 모두 재작성한다 |
| custom Category | 0009 정의가 없어 새 규칙과 참조 재작성 필요 | 이미 생성 시 부여한 UUID를 그대로 보존한다 | 모든 custom ID를 다시 만든다 |
| View/relation/formula/rollup | 성숙한 참조 그래프 전체를 0009 ID로 바꿔야 한다 | 이미 사용하는 ID를 보존한다 | 참조 그래프 전체를 새 ID로 바꾼다 |
| 장기 유지보수 | system-only 보조 구조가 canonical이 되어 모델이 빈약하다 | 가장 완전한 V2 모델과 한 계보로 수렴한다 | 추가 계보와 migration 비용만 늘어난다 |

### 결정

**B. 0006/propertySchemaV2 UUID 계보를 canonical identity로 사용한다.**

이 결정은 “deterministic UUID가 더 좋다”는 이유만으로 내린 것이 아니다. 실제로 View, relation, formula/rollup, custom Category가 이미 이 계보를 참조하며, `propertySchemaV2`가 장기 모델에 필요한 metadata를 가장 완전하게 담고 있기 때문이다.

다만 이 결정은 `propertySchemaV2`라는 필드명을 장기 storage contract로 채택한다는 뜻이 아니다. `V2`는 과거 버전 전환의 흔적이며, 이후 V3 같은 이름을 반복하게 만들고 Category 소비자가 어느 필드를 읽어야 하는지 계속 노출한다.

최종 목표는 다음과 같다.

```text
Category.propertyDefinitions
  identity: 0006 / propertySchema.id / propertySchemaV2.id 계보
  meaning: propertySchemaV2의 rich Definition 모델
```

`propertySchema`, `propertySchemaV2`, 현재 0009 shape/ID를 가진 `propertyDefinitions`는 모두 legacy 또는 transitional 저장 표현이다. Forward migration은 같은 `propertyDefinitions` 필드의 ID와 shape를 공식 identity/rich 모델로 승격하고, 모든 reader/writer가 전환된 뒤 나머지 두 필드를 제거할 수 있게 한다.

## 4. Canonical PropertyDefinition

최종 저장 위치는 `Category.propertyDefinitions`다. 아래 모델은 현재 `propertySchemaV2`가 가진 rich 의미를 기준으로 하지만, `V2`라는 버전 이름을 최종 필드명에 남기지 않는다.

```text
PropertyDefinition
├─ id: UUID
├─ key: string
├─ name: string
├─ type: PropertyType
├─ required: boolean
├─ system: boolean
├─ config: JSON object
├─ order: non-negative integer
├─ version: positive integer
└─ deletedAt: timestamp | null
```

| 필드 | 의미 | 변경 정책 |
| --- | --- | --- |
| `id` | Record 값과 모든 참조가 사용하는 identity | 생성 후 영구 immutable. 삭제/복원에도 재사용 |
| `key` | legacy `properties`와 migration이 사용하는 안정적인 기술 key | 생성 후 immutable. 표시 이름 변경에 사용하지 않음 |
| `name` | 사용자에게 보이는 이름 | rename 명령으로 변경 가능 |
| `type` | 값의 의미와 검증 규칙 | 검증된 type-change 절차에서만 변경 가능. 값 변환 영향 분석 필수 |
| `required` | 해당 정의의 값이 필수인지 나타내는 schema 속성 | schema 명령을 통해서만 변경. 실제 적용 시 기존 값 영향 정책 필요 |
| `system` | 제품이 제공한 정의인지 사용자가 만든 정의인지 표시 | 생성 후 immutable |
| `config` | select option, relation target, formula/rollup 설정 등 type별 설정 | type별 validator를 통과한 configure 명령으로 변경 |
| `order` | Category 안의 기본 표시 순서 | reorder 명령으로 변경 가능. identity와 무관 |
| `version` | 해당 정의 자체의 optimistic concurrency/version | 의미 있는 정의 변경마다 증가 |
| `deletedAt` | soft delete 상태 | delete 시 timestamp, restore 시 `null`; ID는 유지 |

Java/TypeScript의 임의 JSON 객체 하나만으로 모든 것을 검증하지 않는다. 공통 envelope는 위 필드를 유지하되, `config`는 Property type별 계약으로 검증한다. relation/formula/rollup처럼 다른 ID를 참조하는 config는 참조 무결성도 application/migration 계층에서 확인한다.

### `label`과 `name`

canonical 필드명은 V2의 `name`으로 정한다. 기존 OpenAPI `label`과 legacy `propertySchema.label`은 compatibility 이름이다. 이름 변경과 identity migration은 분리한다.

- 기존 V2 정의가 있으면 그 `name`을 권위 값으로 보존한다.
- V2 정의가 없을 때만 legacy `label`을 초기 `name`으로 복사한다.
- 이미 사용자가 수정한 V2 `name`을 legacy `label`로 덮어쓰지 않는다.
- 전환기 API가 `label`을 요구하면 canonical `name`에서 projection하되, 양쪽을 독립적으로 수정 가능한 Source of Truth로 만들지 않는다.

### `required`와 기존 Record

`required`를 변경해도 기존 Record를 자동 수정하거나 삭제하지 않는다. 기존에 값이 없는 Record는 계속 읽을 수 있어야 하며, inventory가 violation 수와 영향을 보고한다.

Career는 빈 Record를 먼저 만든 뒤 내용을 작성하는 UX를 사용한다. 따라서 `required`를 create, draft 저장, publish 같은 어느 lifecycle 지점에서 강제할지는 Record lifecycle 정책과 함께 별도로 확정한다. 이 결정 전에는 Definition 변경만으로 기존 데이터를 invalid state로 간주하거나 읽기를 막지 않는다.

## 5. Canonical PropertyValue와 권위 분리

일반 writable 값은 다음 공통 형태의 discriminated value로 저장한다.

```json
{
  "propertyDefinitionId": "uuid",
  "type": "text",
  "value": "백엔드 개발자"
}
```

- 같은 CareerRecord 안에서 `propertyDefinitionId`는 한 번만 나타난다.
- `type`은 Definition의 현재 type과 일치해야 한다.
- `key`와 표시 이름은 값에 중복 저장하지 않는다.
- Definition 존재 여부, 소유권, Category 일치는 application 계층이 확인한다.

### 5.1 일반 writable `propertyValues`

| type | 권위 값 | 포함 이유 |
| --- | --- | --- |
| `text` | 문자열 | 사용자가 직접 입력하는 기본 값 |
| `number` | 유한 JSON number | 사용자가 직접 입력하고 계산의 원본이 됨 |
| `checkbox` | boolean | legacy boolean의 명확한 후속 type |
| `select` | option UUID 또는 null | Definition config의 단일 option 선택 |
| `multi_select` | option UUID 배열 | Definition config의 복수 option 선택 |
| `date` | 기간/시각과 precision을 보존하는 date value | 사용자가 입력한 날짜 의미의 원본 |
| `url` | 문자열 | 사용자가 입력하는 의미가 text와 구분됨 |
| `email` | 문자열 | 사용자가 입력하는 의미가 text와 구분됨 |
| `phone` | 문자열 | 전화번호는 숫자 계산값이 아님 |
| `file`, `media` | asset UUID 배열 | 현재 V2가 asset ID 배열로 표현하며 별도 권위 ledger가 확인되지 않음 |

문자열의 형식/길이, option 개수, asset 접근 가능성 같은 세부 invariant는 계약과 application 검증에서 정의한다. asset UUID가 실제 업로드 자원을 가리키는지는 CareerRecord 단독 Domain invariant가 아니다.

### 5.2 일반 writable `propertyValues`에서 제외

| type | 권위 저장소 | 제외 이유 |
| --- | --- | --- |
| `title` | `CareerRecord.title` | root canonical field이며 중복 저장하면 충돌 가능 |
| `relation` | `career_record_relations` edge ledger | inverse relation, cardinality, 삭제 정책을 배열 값만으로 안전하게 관리할 수 없음 |
| `formula` | 식/의존성은 Definition config, 결과는 `computedProperties` 계열 | 사용자가 결과를 직접 쓰면 계산 권위와 충돌 |
| `rollup` | Definition config와 계산 결과 저장소 | relation 기반 파생값이므로 직접 쓰는 값이 아님 |
| `created_time` | Record 생성 metadata | 시스템이 결정하는 값 |
| `updated_time` | Record 수정 metadata | 시스템이 결정하는 값 |

이 분류는 API에서 읽지 못한다는 뜻이 아니다. 조회 응답은 relation target summary나 computed value를 합성할 수 있지만, 일반 `propertyValues` PATCH의 writable 입력과 권위 저장소를 분리한다.

`title`은 PropertyDefinition으로 만들지 않는다. View에서 title 열을 참조해야 하더라도 일반 PropertyDefinition UUID를 새로 만들거나 Category ID를 Definition ID처럼 사용하지 않는다. 향후 View 계약에서 `rootField: title` 같은 별도 field-reference를 설계한다.

## 6. Legacy 값 변환 정책

### 6.1 확정 가능한 변환

| legacy | canonical | 판단 |
| --- | --- | --- |
| `text: string` | `text` value | 제한 범위 안에서는 lossless |
| `number: finite number` | `number` value | JSON number 의미에서는 lossless. BSON numeric subtype inventory는 사전 확인 |
| `boolean: boolean` | `checkbox` value | lossless |

Canonical text 최대 길이는 기존 V2 계약의 50,000자를 기준으로 추천한다. Spring 첫 Slice의 5,000자 제한에 맞춰 범위를 축소하면 기존 V2에서 유효한 데이터를 invalid하게 만들 수 있기 때문이다. 사전 inventory는 5,000자 초과 값의 개수, 최대 길이, Category/Definition별 분포를 확인하며 migration 과정에서 문자열을 자르지 않는다.

### 6.2 `tags` → `multi_select`

legacy tags는 임의 문자열 배열이지만 canonical multi-select는 Definition config에 등록된 option UUID 배열이다. 따라서 단순 type 이름 변경만으로는 lossless migration이 아니다.

Migration의 기본 정책은 원본 문자열을 lossless하게 보존하는 것이다.

1. Category/Definition별 실제 tag 문자열을 inventory한다.
2. 원본 문자열을 정규화하거나 합치지 않고 exact label로 option을 만든다.
3. option ID는 공식 PropertyDefinition ID와 exact tag 문자열로 deterministic하게 생성한다.
4. Record의 문자열 배열 순서와 중복 여부를 보존해 변환·검증한다.

예를 들어 `"Java"`, `"java"`, `" Java "`는 migration에서 서로 다른 exact string이며 각각 deterministic option identity를 받는다. 대소문자, 앞뒤 공백, Unicode normalization을 정리하거나 option을 병합하는 일은 migration과 분리된 후속 UX 정책이다. 병합하지 않으면 모양이 비슷한 option이 남을 수 있지만 원본 의미와 rollback 가능성을 보존한다.

### 6.3 `YYYY-MM` date → canonical date

legacy date validator는 월 단위 `YYYY-MM`을 요구하지만 V2 date는 일자 또는 offset이 있는 datetime을 요구한다. `YYYY-MM`을 `YYYY-MM-01`로 바꾸면 “월만 앎”이라는 precision 정보가 사라진다. 현재 Fastify 변환 helper가 첫날을 사용하는 경로가 있어도 그것은 lossless 근거가 아니다.

Canonical date에는 `month`, `day`, `datetime`을 구분할 수 있는 precision 개념을 도입한다. Legacy `YYYY-MM`은 `month` precision으로 보존하며 `YYYY-MM-01`로 바꾸지 않는다.

정확한 wire JSON shape는 implementation plan에서 기존 OpenAPI/V2 date 표현과의 호환성을 다시 확인한 뒤 확정한다. Shape가 확정되기 전에는 월 단위 값을 backfill하지 않는다.

## 7. Forward ID 정렬 migration 개념

기존 0006/0009를 고치지 않고, 구현 시점의 다음 migration 번호로 forward migration을 추가한다. rich blockBody 계획이 0010을 사용하므로 실제 번호는 적용 순서와 HEAD를 확인한 뒤 정한다.

### 7.1 Phase 0: read-only inventory와 preflight

Category별로 exact `key`를 기준으로 다음 mapping 후보를 만든다.

```text
categoryId + key
  0009 propertyDefinitions.id
    → propertySchemaV2.id가 있으면 그 ID
    → 없으면 propertySchema[key].id(0006 ID)
```

다음은 자동 수정하지 않고 migration을 중단시키는 conflict다.

- 같은 Category에서 key 또는 공식 ID가 중복됨
- 같은 key인데 V2 ID와 `propertySchema.id`가 다름
- `propertyDefinitions`가 기대한 0009 shape가 아닌 사용자 수정/임의 ID를 가짐
- Spring `propertyValues`가 어느 Definition에도 매핑되지 않음
- 두 source ID가 하나의 target ID로 합쳐지며 서로 다른 값이 존재함
- 참조 문서가 존재하지 않는 Property ID를 사용함

inventory는 system/custom Category를 모두 포함하고, 실제 type/값 개수, tag variants, date 형식, text 길이, 모든 참조 collection의 ID 분포를 보고한다.

### 7.2 Phase 1: Definition 정렬과 canonical storage 승격

- 기존 `propertySchemaV2`가 있으면 이를 권위 값으로 보존한다.
- V2가 없는 Category만 0006 ID와 legacy metadata에서 rich Definition을 materialize한다.
- `label`은 V2가 없을 때만 `name` 초기값으로 사용한다.
- custom Category의 기존 UUID와 사용자가 바꾼 `name`, `config`, `order`, `version`, `deletedAt`을 덮어쓰지 않는다.
- 현재 0009 shape의 `propertyDefinitions`를 공식 ID와 rich Definition shape를 사용하는 최종 `Category.propertyDefinitions`로 승격한다.
- reader/writer를 `propertyDefinitions`로 전환하는 동안 `propertySchema`와 `propertySchemaV2`는 compatibility 입력으로만 유지하며 새로운 독립 Source of Truth로 쓰지 않는다.

Tags option은 exact legacy string 정책에 따라 materialize한다. 월 단위 date는 precision wire shape가 확정되기 전 backfill하지 않는다.

### 7.3 Phase 2: Spring `propertyValues` 정렬

- 각 Record의 `categoryId`에 해당하는 mapping만 사용한다.
- 0009 ID를 공식 V2 ID로 교체하고 value/type은 그대로 보존한다.
- target ID가 이미 존재하거나 중복 충돌이 생기면 조용히 덮어쓰지 않는다.
- `_id`, category, 기존 값 또는 migration marker를 조건으로 둔 update로 동시 사용자 변경을 감지한다.

### 7.4 Phase 3: 참조 audit와 필요한 ID 교체

View, relation edge, Definition config/AST, tombstone, unmapped value, mutation result, outbox/event를 모두 scan한다. 이 영역은 원래 0006/V2 ID를 사용할 가능성이 높으므로 전체를 일괄 rewrite하지 않는다. 실제로 0009 ID가 발견된 참조만 검증된 mapping으로 바꾼다.

### 7.5 재실행, idempotency, rollback

- mapping은 category/key와 저장된 공식 ID로 결정하며 iteration 순서에 의존하지 않는다.
- 각 update는 “source ID가 아직 존재하고 target 상태가 기대와 일치할 때”만 적용한다.
- dry-run과 apply가 같은 mapping/검증 코드를 사용하며, before/after count와 digest를 남긴다.
- 재실행 시 이미 공식 ID인 문서는 no-op이어야 한다.
- migration 전 영향 문서 backup과 old→new mapping journal을 보관한다.
- 새 공식 ID로 write가 시작된 뒤에는 단순 역치환 rollback이 안전하지 않다. cutover 전까지만 자동 reverse를 허용하고, 이후에는 write를 멈춘 상태에서 snapshot 복원 또는 forward-fix를 사용한다.
- dual-read/write 기간은 짧게 유지한다. preflight 성공 → migration → Spring reader/writer 전환 → 검증 → legacy write 종료 순으로 한 배포 창에 가깝게 묶는다.

## 8. Rich blockBody와 구현 순서

Property identity와 rich blockBody는 값의 서로 다른 축이지만 OpenAPI, Mongo validator, Spring Domain/HTTP 파일에서 충돌할 수 있다. 병렬로 같은 파일을 수정하지 않는다.

추천 순서는 다음과 같다.

1. Property canonical 설계 승인
2. Read-only legacy inventory
3. Rich BlockBody 구현
4. PropertyDefinition 계약/Projection 정렬
5. PropertyValue type 확장
6. ID forward migration
7. Legacy backfill
8. Web/Fastify canonical cutover
9. Legacy write 종료

Property inventory는 rich blockBody보다 먼저 해도 쓰기 충돌이 없다. 실제 Property 계약/DB migration은 rich blockBody의 OpenAPI Task와 migration 0010이 끝난 뒤 진행하면 파일 충돌과 migration 번호 혼선을 줄일 수 있다. 전체 legacy backfill은 rich body와 Property schema가 모두 안정된 뒤 별도 작업으로 둔다.

## 9. 구현 단계의 최소 테스트 전략

현재 설계 단계에서는 자동 테스트를 실행하지 않는다. 검증 시점은 변경 책임에 맞춰 다음처럼 나눈다.

### 계약 테스트

- canonical Definition의 필드, type별 config, immutable identity 의미를 검증한다.
- writable PropertyValue union과 Definition type 일치를 검증한다.
- 같은 `propertyDefinitionId` 중복을 application/domain invariant로 검증한다.
- `title`, relation, formula, rollup, time metadata가 일반 writable 요청에 들어오지 못하게 한다.
- `label` compatibility projection과 canonical `name`을 별도로 검증한다.

### Domain 테스트

- Definition 변경 시 ID/key/system 유지와 version 증가를 검증한다.
- writable value type별 boundary와 defensive copy를 검증한다.
- read-only/별도 권위 type을 일반 change-set으로 변경할 수 없음을 검증한다.
- Category에 없는 ID, 다른 Category ID, 삭제된 Definition은 application validation에서 거절한다.

### Migration 테스트

- 0006/0009 ID mapping이 category/key와 실행 순서에 무관하게 deterministic한지 검증한다.
- system/custom Category와 기존 V2 사용자 변경을 보존한다.
- Spring `propertyValues`와 실제 발견된 참조를 정확히 rewrite한다.
- rerun은 no-op이고 conflict에서는 부분 overwrite 없이 실패한다.
- backup/journal을 이용한 cutover 전 rollback을 검증한다.

### Round-trip과 dry-run

- text, number, checkbox는 legacy→canonical→검증 가능한 legacy projection에서 원래 의미가 유지되는지 확인한다.
- tags는 exact legacy string별 deterministic option ID, label, 배열 순서와 variants 보존을 검증한다.
- date는 precision 정책 확정 후 월/일/datetime을 각각 검증한다.
- BSON의 integer/double 등 실제 numeric subtype과 JSON API 왕복을 검증한다.
- production과 유사한 snapshot의 dry-run에서 category/type별 count, unmatched ID, collision, 참조 누락이 0인지 확인한다.

### 실제 Web smoke 시점

- Legacy inventory 단계는 read-only 검증과 결과 digest를 확인한다.
- Rich BlockBody 구현은 관련 contract, Domain, Mongo 자동 테스트를 실행한다.
- ID migration은 migration 자동 테스트와 실제 데이터 dry-run을 필수로 한다.
- Web Property PATCH를 canonical 요청으로 연결할 때 create → edit → reload 수동 Web smoke를 실행한다.
- Career cutover 때 View, relation, computed value를 포함한 최종 통합 smoke를 실행한다.

모든 Task마다 전체 monorepo suite를 반복하지 않고 변경한 계약·Domain·migration·HTTP 범위만 검증한다.

## 10. 팀 확인이 필요한 결정

1. Date precision을 기존 V2/OpenAPI와 호환되게 표현할 정확한 wire JSON shape.
2. View가 root `title`을 참조하는 별도 field-reference 계약과 기존 synthetic title ID의 전환 방법.
3. 빈 Record 작성 UX에서 `required`를 실제로 강제할 lifecycle 시점.
4. Number migration에서 허용할 BSON numeric subtype과 canonical JSON number 정밀도 정책.

## 11. 비목표

- Yjs/WebSocket/documentVersion을 Property Domain에 포함하지 않는다.
- rich `blockBody` 설계를 이 문서에서 다시 정의하지 않는다.
- 기존 migration 파일을 수정하지 않는다.
- legacy key를 장기 identity로 사용하지 않는다.
- formula/rollup 결과나 relation edge를 일반 writable 값으로 복제하지 않는다.
- conflict가 있는 데이터를 추측으로 덮어쓰거나 값/label을 정규화하지 않는다.
