# Career canonical Property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** migration 0006의 `propertySchema.id`와 `propertySchemaV2.id` UUID 계보를 공식 PropertyDefinition identity로 삼고, Category 저장소를 rich `propertyDefinitions` 하나로, 사용자가 직접 쓰는 Record 값을 canonical `propertyValues`로 수렴시킵니다.

**Architecture:** OpenAPI와 공용 계약에서 canonical Definition/Value를 먼저 고정하고, Spring Domain과 Category projection을 이 의미에 맞춥니다. Read-only inventory와 preflight가 충돌을 모두 증명한 뒤에만 forward migration 0011이 Definition ID와 참조를 정렬합니다. Backfill 전에 Fastify의 한 Mongo mutation이 legacy와 canonical 값을 함께 갱신하는 임시 compatibility writer를 배포하고, migration 0012가 남은 legacy key 기반 값을 journal과 조건부 갱신으로 채웁니다. 서비스 간 HTTP dual-write는 만들지 않으며, 검증 gate 뒤 Web을 전환하고 legacy write를 종료합니다.

**Tech Stack:** OpenAPI 3.1, TypeScript 7, Zod 4, Vitest 4, Node 24, pnpm 11, Java 21, Spring Boot 4.1.1, Spring Data MongoDB/MongoTemplate, MongoDB 8, JUnit 5, MockMvc, Testcontainers

**Spec:** `docs/superpowers/specs/2026-09-04-career-property-canonical-design.md`

## 확정 계약

### Identity와 저장 위치

- 공식 PropertyDefinition ID는 0006의 DNS namespace UUIDv5(`categoryId + ":" + key`)와 그 ID를 승계한 `propertySchemaV2.id`입니다.
- 최종 저장 위치는 `career_categories.propertyDefinitions`입니다. 현재 0009가 같은 이름으로 만든 system-only/legacy-shape 배열은 0011에서 공식 ID와 rich Definition shape로 승격합니다.
- `propertySchema`, `propertySchemaV2`, 현재 0009 `propertyDefinitions`는 전환 입력입니다. 기존 migration 0001~0010은 수정하지 않습니다.
- `id`, `key`, `system`은 생성 후 immutable입니다. `name`, `type`, `required`, `config`, `order`, `version`, `deletedAt`은 명시적인 schema command만 변경합니다.
- canonical 이름은 `name`입니다. 전환기 `label`은 `name`에서 계산하는 compatibility projection이며 별도 Source of Truth가 아닙니다.
- `CareerRecord.title`은 root canonical field입니다. title용 일반 PropertyDefinition UUID를 만들지 않습니다.

### Writable PropertyValue

공통 envelope는 다음과 같습니다.

```json
{
  "propertyDefinitionId": "6c663539-48c1-5d12-939d-f100fac993c1",
  "type": "text",
  "value": "백엔드 개발자"
}
```

일반 writable union에는 `text`, `number`, `checkbox`, `select`, `multi_select`, `date`, `url`, `email`, `phone`, `file`, `media`만 둡니다. `title`, `relation`, `formula`, `rollup`, `created_time`, `updated_time`은 각각 root field, relation ledger, computation, metadata가 권위이므로 이 union에서 제외합니다.

### Date wire shape

`date.value`는 `precision`으로 구분하는 strict union입니다. range의 양 끝은 같은 precision을 사용합니다.

```json
{ "precision": "month", "start": "2026-09", "end": null }
{ "precision": "day", "start": "2026-09-05", "end": "2026-09-30" }
{
  "precision": "datetime",
  "start": "2026-09-05T09:30:00+09:00",
  "end": null,
  "timezone": "Asia/Seoul"
}
```

- `month`: `YYYY-MM`, `timezone` 필드 금지
- `day`: `YYYY-MM-DD`, `timezone` 필드 금지
- `datetime`: RFC 3339 offset datetime, `timezone`은 필수지만 IANA zone 또는 `null`
- `end`는 항상 필수 nullable이고 `null`이 아니면 `start` 이상이어야 합니다.
- legacy `YYYY-MM`은 month precision으로 보존하며 임의의 1일을 만들지 않습니다.

### Exact tag option identity

`tags`를 `multi_select`로 옮길 때 option shape는 현재 V2 소비자가 사용하는 `{ id, name }`을 유지합니다. option ID는 **공식 PropertyDefinition UUID를 namespace로 하고 exact legacy UTF-8 문자열을 name으로 사용하는 UUIDv5**입니다. 대소문자, 앞뒤 공백, Unicode normalization을 적용하지 않습니다. 따라서 `"Java"`, `"java"`, `" Java "`는 서로 다른 option입니다. 공백만 있는 tag처럼 현재 option name invariant와 양립하지 않는 값은 preflight blocker이며 자동 정리하지 않습니다.

## 현재 Repository 사실과 제약

- `packages/contracts/src/career-properties.ts`에는 17개 V2 type이 있으나 date는 month precision을 표현하지 못하고 Definition `config`가 open object입니다.
- Spring Category는 `propertyDefinitions` 중 TEXT만 읽고 `label`을 반환합니다. Spring Record Domain/Mongo/HTTP도 현재 writable text value 하나만 지원합니다.
- Fastify schema/view/relation/formula/rollup 코드는 주로 `propertySchemaV2`, legacy record 쓰기는 key 기반 `properties`를 사용합니다.
- 0009는 category UUID를 namespace로 하는 별도 UUIDv5를 system Category에만 만들었습니다. 같은 `(categoryId, key)`라도 0006 ID와 다릅니다.
- migration runner는 migration 전체 transaction이 아니라 **성공한 step별 checkpoint**를 기록합니다. 각 step은 재실행 가능해야 하고, 중간 실패를 고려한 journal/compare-and-set이 필요합니다.
- 현재 마지막 migration은 0010입니다. Definition/ID 정렬은 0011, legacy value backfill은 0012로 분리합니다.
- `required`는 빈 Record 생성 UX 때문에 이 계획에서 create/draft write를 차단하지 않습니다. 기존 missing value는 읽을 수 있고 inventory에만 보고합니다.

## 공통 안전 원칙

- 실제 데이터가 0건이어도 system/custom Category, reference collection, 충돌, 재실행, rollback tests를 생략하지 않습니다.
- source ID/key/type/value가 모호하거나 canonical 값과 다르면 덮어쓰지 않고 blocker report를 남깁니다.
- backfill 중 문자열 자르기, tag normalization, month→day 변환을 하지 않습니다.
- migration journal에는 변경 전 field, 변경 후 digest, migration version을 보관합니다. 검증과 rollback 기간이 끝나기 전 삭제하지 않습니다.
- Mongo validator를 강화하기 전에 현재 데이터를 새 validator로 검증하고, writer activation보다 migration을 먼저 배포합니다.
- 동일 사용자 mutation의 legacy/canonical compatibility write는 한 Fastify application command가 한 Mongo transaction/update 안에서 수행합니다. Fastify가 Spring을 호출하거나 Spring이 Fastify를 호출하는 독립 서비스 간 dual-write는 금지합니다.
- Task별 명령만 실행하며 모든 Task에서 전체 monorepo test를 반복하지 않습니다.

---

### Task 1: Canonical PropertyDefinition/PropertyValue 계약과 fixture

**Files:**
- Create: `packages/contracts/openapi/fixtures/career-property-canonical-v1.json`
- Modify: `packages/contracts/openapi/career-record-slice-v1.yaml`
- Modify: `packages/contracts/src/career-record-slice-openapi.test.ts`
- Modify: `packages/contracts/src/career-properties.ts`
- Modify: `packages/contracts/src/career-editor.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- `CanonicalCareerPropertyDefinition`: `id`, `key`, `name`, `type`, `required`, `system`, `config`, `order`, `version`, `deletedAt`
- `WritableCareerPropertyValue`: Definition ID가 포함된 11-type discriminated union
- `CareerDateValue`: 위에서 확정한 month/day/datetime strict union
- `CareerSelectOption`: `{ id: UUID, name: non-empty string }`

- [ ] **Step 1: 계약 failing tests를 먼저 작성합니다**

공용 fixture에 모든 writable type, exact tag option 세 종류, month/day/datetime, deleted Definition을 넣습니다. OpenAPI test는 Category가 `name`과 rich metadata를 반환하고 Record `propertyValues`가 union을 받는지 확인합니다. `title`/`relation`/`formula`/`rollup`/metadata value, month의 timezone, day 형식의 month, offset 없는 datetime, Definition/type 불일치는 거절해야 합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
pnpm --filter @expresso/contracts test -- src/career-record-slice-openapi.test.ts src/career-editor.test.ts
```

Expected: 현재 OpenAPI가 TEXT/`label`만 허용하고 현재 Zod date가 precision을 받지 않아 contract assertion이 실패합니다.

- [ ] **Step 3: 최소 계약을 구현합니다**

OpenAPI `PropertyDefinition`을 rich shape로 확장하고 `PropertyValue`를 writable union으로 교체합니다. `label`이 전환 응답에 필요하면 `deprecated: true`, read-only compatibility field로 두되 `name`과 독립 수정할 수 없음을 description에 명시합니다. Zod에는 기존 전체 V2 value와 구분되는 `WritableCareerPropertyValueSchema`를 추가합니다. formula/rollup/relation read model은 기존 V2 schema를 유지하여 이 Task가 기존 Fastify 기능을 갑자기 삭제하지 않게 합니다.

select/multi-select Definition config는 최소한 `options: CareerSelectOption[]`을 강하게 검증하고 option ID 중복을 거절합니다. relation/formula/rollup Definition config는 기존 전용 계약을 재사용해 참조 의미를 보존합니다. 그 밖의 type은 Repository에 실제 config 의미가 없는 동안 빈 strict object로 시작하며, 기존 데이터에 추가 config가 발견되면 버리지 않고 preflight blocker로 올려 계약을 먼저 확장합니다. file/media의 asset 접근성, email/url 형식처럼 application 조율이 필요한 항목은 wire parser가 존재만으로 추측하지 않습니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
pnpm --filter @expresso/contracts test -- src/career-record-slice-openapi.test.ts src/career-editor.test.ts
pnpm --filter @expresso/contracts typecheck
pnpm --filter @expresso/contracts build
```

OpenAPI와 Zod fixture가 같은 의미인지, excluded type이 writable request에 섞이지 않는지, rich BlockBody 계약이 바뀌지 않았는지 검토합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/contracts/openapi/career-record-slice-v1.yaml packages/contracts/openapi/fixtures/career-property-canonical-v1.json packages/contracts/src/career-record-slice-openapi.test.ts packages/contracts/src/career-properties.ts packages/contracts/src/career-editor.test.ts packages/contracts/src/index.ts
git commit -m "feat: 커리어 canonical property 계약 확장"
```

**완료 조건:** Definition identity/metadata, writable union, exact option shape, 세 date precision이 언어 중립 계약과 Zod에서 동일하게 검증됩니다.

---

### Task 2: 반복 가능한 read-only inventory와 migration preflight

**Files:**
- Create: `packages/database/src/career-property-canonical-mapping.ts`
- Create: `packages/database/src/career-property-inventory.ts`
- Create: `packages/database/src/career-property-inventory.test.ts`
- Create: `packages/database/src/career-property-inventory-cli.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface CareerPropertyPreflightReport {
  summary: { categories: number; records: number; references: number };
  idMappings: PropertyIdMapping[];
  conflicts: CareerPropertyMigrationConflict[];
  distributions: LegacyValueDistribution;
}

export function officialPropertyDefinitionId(categoryId: string, key: string): string;
export function exactOptionId(propertyDefinitionId: string, exactName: string): string;
export const careerPropertyReferenceLocations: readonly CareerPropertyReferenceLocation[];
export async function inspectCareerPropertyMigration(db: Db): Promise<CareerPropertyPreflightReport>;
```

- [ ] **Step 1: pure mapping과 read-only inventory failing tests를 작성합니다**

0006의 known ID, 순서와 무관한 deterministic mapping, exact tag variants의 서로 다른 option ID를 고정합니다. Fake/isolated MongoDB 8 fixture에는 system/custom Category, 0006/0009 mismatch, malformed/duplicate ID, orphan reference, canonical conflict, whitespace-only tag, 5,000/50,000자 분포, month/other date를 넣습니다. command monitoring으로 insert/update/delete/collMod가 호출되지 않았음을 assert합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-inventory.test.ts
```

Expected: mapping/inventory module이 없어 compile 실패합니다. DB test가 skip되면 RED로 인정하지 않습니다.

- [ ] **Step 3: read-only 구현을 추가합니다**

projection을 제한한 `find`/aggregation만 사용해 Category, Record, View, relation, formula/rollup config와 AST, tombstone, unmapped, AI proposal, outbox/mutation payload의 ID를 inventory합니다. 참조 위치는 collection, BSON path, 소유 Category를 찾는 방법, 허용 target Definition type을 명시한 `careerPropertyReferenceLocations` registry 한 곳에서 관리합니다. 사용자 원문은 출력하지 않고 길이/count/digest와 충돌 식별자만 보고합니다. CLI는 JSON report와 non-zero blocker exit code를 제공하되 DB write API를 받지 않습니다.

다음은 blocker입니다: key/official ID 중복, `propertySchema.id`와 V2 ID 불일치, 기대하지 않은 0009 shape/ID, mapping 없는 Spring value, target ID value conflict, orphan reference, registry 밖 저장 위치에서 발견된 0009 source ID, 소유 Category를 하나로 결정할 수 없는 reference, whitespace-only tag, 지원하지 않는 legacy date/number/BSON type.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-inventory.test.ts
pnpm --filter @expresso/database typecheck
```

실제 migration 실행 전에는 production-like snapshot에서 CLI를 실행해 report를 보관합니다. 0건 report도 명시적으로 남기며 운영 분포로 일반화하지 않습니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/database/src/career-property-canonical-mapping.ts packages/database/src/career-property-inventory.ts packages/database/src/career-property-inventory.test.ts packages/database/src/career-property-inventory-cli.ts packages/database/package.json packages/database/src/index.ts
git commit -m "feat: 커리어 property migration 사전 점검 추가"
```

**완료 조건:** 같은 library를 CLI와 migration이 재사용할 수 있고, inventory가 read-only임과 모든 blocker 분류가 자동 테스트로 증명됩니다.

---

### Task 3: Spring canonical PropertyDefinition과 Category projection 정렬

이 Task는 Record value write를 활성화하지 않습니다. Category가 공식 0006/V2 identity와 rich Definition을 읽는 경계를 먼저 고정합니다.

**Files:**
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/PropertyDefinition.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/PropertyDefinitionType.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/CareerCategory.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerCategoryRepository.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/api/CareerCategoryController.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerCategoriesHttpIntegrationTest.java`

**Interfaces:**
- `PropertyDefinition`은 canonical ten fields를 갖고 config를 defensive copy합니다.
- repository projection 우선순위: canonical rich `propertyDefinitions` → `propertySchemaV2` → ID가 있는 `propertySchema`.
- 현재 0009 legacy-shape `propertyDefinitions`를 공식 canonical로 오인하지 않습니다.

- [ ] **Step 1: Category failing tests를 작성합니다**

canonical rich document, V2 fallback, legacy fallback, custom Category metadata, renamed `name`, deleted Definition을 각각 projection합니다. 같은 key에서 0009 ID와 V2 ID가 있으면 V2 ID를 반환해야 하고, V2/propertySchema 공식 ID가 충돌하면 data-integrity failure여야 합니다. 기존 endpoint의 system Category 범위와 order 정책은 유지합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.CareerCategoriesHttpIntegrationTest"
```

Expected: 현재 Domain enum/mapper가 TEXT와 0009 `label` shape만 이해하여 rich fixture projection이 실패합니다.

- [ ] **Step 3: 최소 Domain/projection을 구현합니다**

Definition type enum을 전체 canonical type으로 확장하되 writable 여부는 별도 method/set으로 표현합니다. config는 Task 4의 value Domain과 결합하지 않고 JSON-safe immutable Map으로 보존합니다. Controller는 계약의 `name`을 반환하고 전환기 `label`이 남아 있으면 동일 `name`에서 계산합니다. title/relation/formula/rollup/metadata Definition은 Category schema 조회에는 보일 수 있지만 일반 Record PATCH 허용 목록에는 들어가지 않습니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
.\gradlew.bat test --tests "com.expresso.backend.career.CareerCategoriesHttpIntegrationTest"
Set-Location ../..
```

공식 ID, custom metadata, `name`, order, tombstone가 보존되고 Record 쓰기가 바뀌지 않았는지 검토합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- services/backend-spring/src/main/java/com/expresso/backend/career/domain/PropertyDefinition.java services/backend-spring/src/main/java/com/expresso/backend/career/domain/PropertyDefinitionType.java services/backend-spring/src/main/java/com/expresso/backend/career/domain/CareerCategory.java services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerCategoryRepository.java services/backend-spring/src/main/java/com/expresso/backend/career/api/CareerCategoryController.java services/backend-spring/src/test/java/com/expresso/backend/career/CareerCategoriesHttpIntegrationTest.java
git commit -m "feat: Spring 커리어 property definition 정렬"
```

**완료 조건:** Spring Category가 최종/전환 storage 모두에서 공식 identity의 rich Definition을 일관되게 반환하고 0009 ID를 canonical로 노출하지 않습니다.

---

### Task 4: Spring writable PropertyValue Domain 확장

이 Task는 순수 Domain만 다루며 Mongo/HTTP를 바꾸지 않습니다. 기존 consumer가 컴파일하도록 최소 compatibility seam을 두고 Task 6에서 제거합니다.

**Files:**
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/PropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/PropertyValueType.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/TextualPropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/NumberPropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/CheckboxPropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/SelectPropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/MultiSelectPropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/DatePropertyValue.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/AssetPropertyValue.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/CareerRecord.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/CareerRecordChangeSet.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/domain/CareerRecordCreationTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/domain/CareerRecordChangeSetTest.java`
- Create: `services/backend-spring/src/test/java/com/expresso/backend/career/domain/PropertyValueValidationTest.java`

**Interfaces:**

```java
public sealed interface PropertyValue permits TextualPropertyValue, NumberPropertyValue,
        CheckboxPropertyValue, SelectPropertyValue, MultiSelectPropertyValue,
        DatePropertyValue, AssetPropertyValue {
    String propertyDefinitionId();
    PropertyValueType type();
}
```

- [ ] **Step 1: Domain failing tests를 작성합니다**

11 writable type, text 50,000 경계, finite decimal, option/asset UUID와 목록 상한, 방어 복사, 세 date precision/range/timezone을 테스트합니다. 같은 Definition ID 중복, excluded type 생성, invalid datetime offset, month timezone은 거절합니다. change-set의 atomic validation/no-op/version 1회 증가도 여러 type으로 회귀 검증합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.domain.PropertyValueValidationTest" --tests "com.expresso.backend.career.domain.CareerRecordCreationTest" --tests "com.expresso.backend.career.domain.CareerRecordChangeSetTest"
```

Expected: 현재 `TextPropertyValue`와 5,000자 validation만 있어 compile/test가 실패합니다.

- [ ] **Step 3: 읽기 쉬운 sealed hierarchy와 validation을 구현합니다**

type마다 거대한 service hierarchy를 만들지 않고 값 shape가 같은 타입을 한 record로 묶습니다. `TextualPropertyValue`는 text/url/email/phone, `AssetPropertyValue`는 file/media를 허용합니다. number는 JSON/BSON 의미를 보존하도록 finite `BigDecimal` canonical form을 사용합니다. Date는 enum precision과 검증된 문자열을 가지며 Tiptap/Jackson/BSON 타입에 의존하지 않습니다. 개발자용 메시지는 자연스러운 한국어로 작성합니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
.\gradlew.bat test --tests "com.expresso.backend.career.domain.PropertyValueValidationTest" --tests "com.expresso.backend.career.domain.CareerRecordCreationTest" --tests "com.expresso.backend.career.domain.CareerRecordChangeSetTest"
Set-Location ../..
```

Domain source가 MongoTemplate/Jackson/HTTP를 import하지 않고 excluded type을 생성할 경로가 없는지 검토합니다.

- [ ] **Step 5: checkpoint commit**

명시한 Domain 파일만 staging하고 다음 메시지로 commit합니다.

```powershell
git commit -m "feat: 커리어 writable property value 도메인 확장"
```

**완료 조건:** 모든 writable value가 invalid state를 방지하고 change-set semantics를 유지하며 persistence/transport와 독립적입니다.

---

### Task 5: Migration 0011 공식 ID와 Category storage 정렬

Task 2 preflight report가 blocker 0인 production-like snapshot에서만 시작합니다. migration runner가 step transaction을 제공하지 않으므로 step 순서는 `preflight → journal → Definition materialize → reference/value ID rewrite → validator`로 고정합니다.

**Files:**
- Create: `packages/database/src/mongodb-migrations/0011/migration.ts`
- Modify: `packages/database/src/mongo-migrations.ts`
- Modify: `packages/database/src/migrations.test.ts`
- Modify: `packages/database/src/documents/career.ts`
- Modify: `packages/database/src/documents/operations.ts`

**Interfaces:**
- migration name: `0011_career_property_canonical_identity`
- journal collection: `career_property_migration_journal`
- consumes Task 2 `inspectCareerPropertyMigration`, `officialPropertyDefinitionId`, `careerPropertyReferenceLocations`
- produces immutable `(categoryId, key, old0009Id, officialId)` remap rows used by every reference rewrite

- [ ] **Step 1: migration failing tests를 작성합니다**

MongoDB 8에서 system/custom Category, renamed/configured/deleted V2 Definition과 아래 저장 위치에 0009 ID fixture를 각각 준비합니다.

- `career_categories.propertyDefinitions[].id`
- `career_categories.propertyDefinitions[].config` 및 `propertySchemaV2[].config`의 relation/formula/rollup 참조
- `career_records.propertyValues[].propertyDefinitionId`
- `career_records.propertyValueTombstones`와 `unmappedProperties`의 Definition ID key/reference
- View filter/sort/group/visible/order/width/gallery/timeline 설정
- `career_record_relations.sourcePropertyId`와 `inversePropertyId`
- AI proposal command/property change, schema preview, outbox/mutation payload처럼 Repository schema가 영속화하는 Definition ID

0011 후 `propertyDefinitions`가 V2 rich shape/ID이고 registry에 등록된 모든 0009 reference/value가 공식 ID인지 assert합니다. 삭제된 Definition 참조도 동일하게 remap합니다. registry 밖 BSON path에서 known 0009 source ID가 발견되는 fixture, reference의 소유 Category가 모호한 fixture, old/target ID가 한 container에 함께 있어 합치면 정보가 달라지는 fixture는 첫 write 전에 실패해야 합니다. step별 failure injection 뒤 재실행, 이미 정상인 데이터 no-op, 기존 validator/index 보존, journal before-image/digest를 검증합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/migrations.test.ts
pnpm --filter @expresso/backend test -- src/modules/career/career.integration.test.ts src/modules/career/property-schema.integration.test.ts
```

Expected: 0011 미등록, 0009 ID/shape 유지로 실패합니다.

- [ ] **Step 3: forward-only migration을 구현합니다**

preflight step은 `careerPropertyReferenceLocations`의 모든 경로를 검사하고 blocker가 하나라도 있으면 write 전에 중단합니다. 또한 mapping table의 모든 0009 source UUID를 허용 BSON 영역에서 검색하여 registry가 모르는 저장 위치가 나오면 migration code를 먼저 보완하도록 중단합니다. journal은 변경 대상 document별 `_id`, collection, BSON path, before field, before/after digest, state를 unique key로 저장합니다. 각 update는 `_id + before digest에 대응하는 현재 field` 조건으로 compare-and-set하고 modifiedCount 불일치를 concurrent mutation conflict로 중단합니다.

Category는 V2가 있으면 그 identity/metadata를 그대로 canonical `propertyDefinitions`에 복사하고, 없으면 공식 ID가 있는 legacy schema에서 materialize합니다. Remap은 값이 mapping table의 `old0009Id`와 정확히 같고 reference의 소유 Category가 mapping row와 일치할 때만 `officialId`로 바꿉니다. Record는 `categoryId`, View와 Definition config는 owning Category, relation `sourcePropertyId`는 source Record category, `inversePropertyId`는 target/inverse Category를 통해 소유 Category를 결정합니다. 이 경로가 하나로 결정되지 않으면 추측하지 않고 abort합니다.

같은 array/map에 old와 official ID가 함께 있으면 semantic 값/config/reference가 deep-equal인 경우만 한 official ID로 idempotently 축약할 수 있습니다. 값, 순서 의미, option/config가 다르면 abort합니다. 이미 0006/V2 ID인 View/relation/formula/rollup 참조는 손대지 않습니다. custom UUID/name/config/order/version/deletedAt을 보존합니다.

마지막 validator step에서 `career_categories.propertyDefinitions`를 rich Definition shape로, `career_records.propertyValues`를 Task 1 writable union으로 확장합니다. legacy required 필드, rich BlockBody validator, index는 유지하고 `propertyValues`를 아직 required로 만들지 않습니다.

- [ ] **Step 4: GREEN, dry-run, rollback rehearsal**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-inventory.test.ts src/migrations.test.ts
pnpm --filter @expresso/database typecheck
pnpm --filter @expresso/database build
```

production-like snapshot에서 inventory JSON을 보관하고 migration dry-run과 journal 기반 rollback rehearsal을 수행합니다. rollback은 old migration 파일 수정이 아니라 journal before-image를 조건부 복원하는 별도 운영 절차이며, 이후 사용자 변경을 덮어쓰지 않아야 합니다.

적용 후에는 registry 각 경로와 허용 BSON 영역을 다시 스캔하여 known 0009 source ID가 0건인지, 모든 official reference가 같은 Category의 존재하는 Definition을 가리키는지 확인합니다. 하나라도 남거나 orphan이 생기면 0011을 applied로 완료하지 않습니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/database/src/mongodb-migrations/0011/migration.ts packages/database/src/mongo-migrations.ts packages/database/src/migrations.test.ts packages/database/src/documents/career.ts packages/database/src/documents/operations.ts
git commit -m "feat: 커리어 property definition ID 정렬 migration 추가"
```

**완료 조건:** 0011이 공식 ID/rich storage로 수렴하고 모든 실제 0009 참조를 안전하게 바꾸며 conflict/no-op/retry/rollback 증거를 남깁니다.

---

### Task 6: Spring writable PropertyValue 적용과 Fastify compatibility writer

0011 validator가 적용된 환경에서만 writer를 활성화합니다. Spring canonical Mongo/HTTP 경로를 완성하는 동시에, 아직 legacy payload를 받는 Fastify가 한 Mongo operation에서 legacy/canonical을 함께 갱신하도록 준비합니다. 인증, Idempotency-Key, owner scope, ETag, If-Match, optimistic concurrency, no-op는 바꾸지 않습니다.

**Files:**
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordWriter.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordProjector.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/application/CareerRecordPatchService.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/api/CareerRecordController.java`
- Delete: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/TextPropertyValue.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordProjectorTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordCreateHttpIntegrationTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordGetHttpIntegrationTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordPatchHttpIntegrationTest.java`
- Modify: `services/backend/src/modules/career/service.ts`
- Modify: `services/backend/src/modules/career/property-schema.ts`
- Modify: `services/backend/src/modules/career/properties.ts`
- Modify: `services/backend/src/modules/career/career.integration.test.ts`
- Modify: `services/backend/src/modules/career/property-schema.integration.test.ts`

- [ ] **Step 1: Mongo/HTTP failing tests를 작성합니다**

Spring에서는 공용 fixture의 모든 writable type을 PATCH→Mongo→GET round-trip합니다. BigDecimal/option order/date precision을 확인합니다. 요청 Definition ID가 category에 없거나 deleted/non-writable이거나 type이 다르면 400입니다. title/blockBody-only PATCH는 Category를 조회하지 않습니다. stale 412, owner 404, no-op ETag/version, malformed Mongo 500을 기존 test에 필요한 대표 케이스만 추가합니다.

Fastify에서는 create/update 하나가 단일 insert 또는 기존 owner/version 조건부 `findOneAndUpdate`의 한 `$set`에서 legacy `properties`와 canonical `propertyValues`를 함께 기록하는 failing integration test를 작성합니다. Category schema command도 기존 Mongo transaction 안에서 `propertySchemaV2`와 canonical `propertyDefinitions`를 함께 갱신해야 합니다. 변환 실패 시 어느 쪽도 저장되지 않고 version은 성공 시 한 번만 증가하며, Spring/Fastify 사이 HTTP 호출은 없어야 합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.infrastructure.mongo.MongoCareerRecordProjectorTest" --tests "com.expresso.backend.career.CareerRecordCreateHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordGetHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordPatchHttpIntegrationTest"
Set-Location ../..
pnpm --filter @expresso/backend test -- src/modules/career/career.integration.test.ts src/modules/career/property-schema.integration.test.ts
```

Expected: Spring의 기존 text-only request/Mongo mapper 때문에 rich values가 400 또는 projection failure이고, Fastify write 뒤에는 canonical 값/Definition이 함께 바뀌지 않아 compatibility assertion이 실패합니다.

- [ ] **Step 3: 명시적 mapper와 application validation을 구현합니다**

Controller는 Task 1 union을 Domain value로, response는 동일 envelope로 변환합니다. Mongo mapper는 number를 Decimal128, date precision을 strict object, option/asset 배열을 순서대로 보존합니다. Application은 propertyValues가 포함된 경우에만 현재 Record category의 active Definition을 읽고 ID/type/writable 여부, select option ID, asset 접근 조율을 검증합니다. legacy `properties`를 만들거나 덮어쓰지 않습니다.

Fastify의 기존 create/update command는 공식 Definition resolver와 공통 conversion 함수를 사용합니다. Record create는 한 insert document에 `properties`와 `propertyValues`를 함께 넣고, update는 기존 owner/version 조건부 Mongo operation의 한 `$set`에 두 필드를 함께 넣습니다. 여러 collection을 건드리는 schema command는 기존 Mongo transaction 안에서 `propertySchemaV2`와 canonical `propertyDefinitions`를 함께 갱신합니다. 어느 projection이라도 만들 수 없으면 Mongo write 전에 요청 전체를 거절합니다. Fastify가 Spring을 호출하거나 Spring이 Fastify를 호출하는 경로는 추가하지 않습니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
.\gradlew.bat test --tests "com.expresso.backend.career.infrastructure.mongo.MongoCareerRecordProjectorTest" --tests "com.expresso.backend.career.CareerRecordCreateHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordGetHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordPatchHttpIntegrationTest"
Set-Location ../..
pnpm --filter @expresso/backend test -- src/modules/career/career.integration.test.ts src/modules/career/property-schema.integration.test.ts
```

Task 4 compatibility seam과 `TextPropertyValue` 사용처가 남지 않았는지 `rg "TextPropertyValue" services/backend-spring/src`로 확인합니다. Fastify compatibility write가 같은 Mongo operation/transaction이고 실패 시 한 표현만 남지 않는지도 검토합니다.

- [ ] **Step 5: checkpoint commit**

명시한 Spring/Fastify mapper/service/test 파일만 staging합니다.

```powershell
git commit -m "feat: 커리어 property value 쓰기 호환 확장"
```

**완료 조건:** Spring POST 기본 empty values, GET/PATCH multi-type round-trip과 기존 concurrency/security semantics가 통과하고, Fastify의 모든 일반 Property mutation이 legacy/canonical을 같은 Mongo operation/transaction에서 원자적으로 갱신합니다.

---

### Task 7: Migration 0012 legacy properties backfill

0011 적용, Spring rich reader 배포, Task 6 Fastify compatibility writer 배포 뒤 수행합니다. **0012의 진입 조건은 same-operation compatibility writer가 production canary에서 검증된 상태**입니다. 이후 들어오는 legacy 요청이 같은 Mongo mutation에서 `properties`와 `propertyValues`를 함께 갱신하므로 backfill 직후 canonical 값이 다시 stale해지는 창을 만들지 않습니다. 별도 서비스 호출을 두 번 성공시켜야 하는 HTTP dual-write는 사용하지 않습니다.

**Files:**
- Create: `packages/database/src/mongodb-migrations/0012/migration.ts`
- Modify: `packages/database/src/mongo-migrations.ts`
- Modify: `packages/database/src/migrations.test.ts`
- Modify: `packages/database/src/documents/career.ts`

- [ ] **Step 1: conversion/backfill failing tests를 작성합니다**

text/number/boolean/tags/date와 empty/missing backfill 값을 각각 테스트합니다. exact tag variants는 별도 options가 되고 배열 순서와 중복이 보존되어야 합니다. `YYYY-MM`은 month precision입니다. 기존 canonical 값이 동일하면 no-op, 다르면 conflict이며 덮어쓰지 않습니다. unknown key, 50,000자 초과, non-finite/unsupported BSON number, invalid date, whitespace-only tag는 blocker입니다. batch 중단/재실행과 concurrent legacy/canonical mutation도 테스트합니다. Task 6 배포 뒤 생성·수정된 legacy/canonical 동시 기록은 no-op backfill이어야 합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/migrations.test.ts
```

Expected: 0012가 등록되지 않았고 기존 legacy values가 canonical에 materialize되지 않아 실패합니다.

- [ ] **Step 3: deterministic backfill을 구현합니다**

Task 6 compatibility writer canary에서 같은 요청 직후 두 표현의 semantic digest가 일치함을 확인하고, 배포 version/검증 시각을 0012 운영 checklist에 기록합니다. 이 증거가 없으면 migration은 abort합니다. 배포가 불가능한 비상 상황에서만 backfill부터 compatibility writer 배포까지 짧은 write freeze를 대안으로 사용하며, 긴 freeze를 기본안으로 삼지 않습니다.

그 뒤 0012가 Definition config의 select options에 Task 2 `exactOptionId`로 만든 option을 stable order로 합칩니다. Record는 category/key로 official ID를 찾고 legacy type을 text/number/checkbox/multi_select/date로 변환합니다. legacy `properties`와 `bodyMd`는 삭제하지 않습니다. canonical array가 이미 있으면 Definition별 deep semantic equality를 확인하고, 다른 값은 journal에 conflict로 남긴 뒤 중단합니다.

batch마다 before-image/digest를 0011 journal collection에 version `0012`로 기록하고 compare-and-set합니다. migration runner step checkpoint에 의존하지 않고 각 document가 재실행에 안전해야 합니다. required missing은 report만 하고 Record를 invalid 처리하지 않습니다.

- [ ] **Step 4: GREEN, dry-run, rollback rehearsal**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-inventory.test.ts src/migrations.test.ts
pnpm --filter @expresso/database typecheck
pnpm --filter @expresso/database build
```

production-like snapshot에서 compatibility writer 적용→동시 legacy write→inventory→dry-run→backfill→동시 legacy write→reconciliation→journal rollback→재적용 순서를 rehearsal합니다. backfill 중 들어온 write도 두 표현이 일치해야 합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/database/src/mongodb-migrations/0012/migration.ts packages/database/src/mongo-migrations.ts packages/database/src/migrations.test.ts packages/database/src/documents/career.ts
git commit -m "feat: 커리어 legacy property value backfill 추가"
```

**완료 조건:** Fastify의 모든 일반 Property legacy write가 같은 Mongo operation/transaction에서 canonical 값을 함께 갱신한 뒤에만 backfill이 시작되고, 변환 가능한 기존 값이 lossless canonical value로 채워지며 모든 모호/충돌 데이터가 자동 중단됩니다.

---

### Task 8: Cutover 전 reconciliation gate

이 Task는 production data를 수정하지 않는 검증 기능입니다. Fastify/Web reader를 바꾸기 전에 반드시 실행합니다.

**Files:**
- Create: `packages/database/src/career-property-reconciliation.ts`
- Create: `packages/database/src/career-property-reconciliation.test.ts`
- Create: `packages/database/src/career-property-reconciliation-cli.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- legacy와 canonical을 independently decode하여 Definition별 semantic digest/count를 비교하는 read-only report
- exit 0은 blocker 0, unmapped 0, ID/reference orphan 0, transform mismatch 0일 때만 반환

- [ ] **Step 1: failing verifier tests를 작성합니다**

정상 backfill, missing canonical, 다른 option/date precision, orphan ID, stale 0009 ID, partial canonical, journal 미완료를 fixture로 만듭니다. DB command monitoring으로 write가 없음을 확인합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-reconciliation.test.ts
```

- [ ] **Step 3: 최소 verifier를 구현합니다**

Category Definition completeness, official ID, active/deleted refs, Record coverage, exact option mapping, date precision, type/value equality, required violation count, 0011/0012 journal state를 집계합니다. 개인 값은 출력하지 않고 count/digest와 record/definition ID만 보고합니다.

- [ ] **Step 4: GREEN과 cutover checkpoint**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-reconciliation.test.ts
pnpm --filter @expresso/database typecheck
```

production-like snapshot과 실제 배포 직전 DB에서 report를 보관합니다. **이 gate가 통과하지 않으면 Task 9로 가지 않습니다.**

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/database/src/career-property-reconciliation.ts packages/database/src/career-property-reconciliation.test.ts packages/database/src/career-property-reconciliation-cli.ts packages/database/package.json packages/database/src/index.ts
git commit -m "feat: 커리어 property cutover 검증 추가"
```

**완료 조건:** Fastify/Web cutover 가능 여부를 read-only 자동 report 한 개로 판정할 수 있습니다.

---

### Task 9: Fastify canonical read 전환과 compatibility write 검증

Task 6에서 이미 배포한 same-operation compatibility writer는 이 Task에서 다시 만들지 않습니다. Reconciliation gate가 통과한 뒤 read authority만 canonical로 바꾸며, compatibility writer는 Task 11까지 유지합니다.

**Files:**
- Modify: `services/backend/src/modules/career/mongo-categories.ts`
- Modify: `services/backend/src/modules/career/relations.ts`
- Modify: `services/backend/src/modules/career/property-schema.ts`
- Modify: `services/backend/src/modules/career/mongo-records.ts`
- Modify: `services/backend/src/modules/career/service.ts`
- Modify: `services/backend/src/modules/career/properties.ts`
- Modify: relevant focused tests in `services/backend/src/modules/career/*.test.ts`

- [ ] **Step 1: canonical-read failing tests를 작성합니다**

Category reader가 canonical `propertyDefinitions`를 우선하고 V2는 fallback만 하는지, Record canonical values를 legacy Web response로 projection할 수 있는지 확인합니다. title/relation/computed metadata는 각 권위 source에서 합성하며 `propertyValues`로 쓰지 않습니다. canonical과 legacy가 다르면 canonical read 결과가 우선해야 합니다. Task 6 compatibility writer가 read 전환 뒤에도 한 Mongo operation으로 두 표현을 계속 일치시키는 회귀 test를 함께 유지합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
pnpm --filter @expresso/backend test -- src/modules/career/property-schema.test.ts src/modules/career/category-move.test.ts src/modules/career/relations.test.ts
```

- [ ] **Step 3: boundary adapter를 구현합니다**

Fastify 내부 Definition resolver를 canonical-first로 바꾸고 key 기반 Web 응답은 Definition ID→key projection으로만 생성합니다. Task 6의 compatibility writer는 그대로 유지하되 이 Task에서 별도 service call이나 두 번째 Mongo write를 추가하지 않습니다. relation/formula/rollup/metadata는 기존 권위 저장소를 유지합니다. raw key input이 Definition과 맞지 않으면 거절합니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
pnpm --filter @expresso/backend test -- src/modules/career/property-schema.test.ts src/modules/career/category-move.test.ts src/modules/career/relations.test.ts src/modules/career/career.test.ts
pnpm --filter @expresso/backend typecheck
```

compatibility write가 여전히 한 command와 한 Mongo operation/transaction 경계에 있고 실패 시 한쪽만 성공하지 않는지 검토합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git commit -m "feat: Fastify 커리어 canonical property 읽기 전환"
```

**완료 조건:** 기존 Web 응답을 유지하면서 Fastify 내부 read authority가 canonical Definition/value로 이동하고 Task 6 compatibility write가 Task 11까지 same-operation 방식으로 유지됩니다.

---

### Task 10: Web Property PATCH canonical cutover와 수동 smoke

이 Task가 첫 필수 수동 Web smoke 지점입니다. 그 전 Task는 자동 contract/domain/migration 검증으로 충분합니다.

**Files:**
- Modify: `services/web/src/app/api/career/records/[recordId]/route.ts`
- Modify: `services/web/src/features/career-editor/properties/PropertyList.tsx`
- Modify: `services/web/src/features/career-editor/views/CareerViewShell.tsx`
- Modify/Create: directly related Route Handler and PropertyList tests

- [ ] **Step 1: failing Web tests를 작성합니다**

PropertyList가 key 기반 `{properties}` 대신 Definition ID 기반 `{propertyValues}`를 만들고, Next Route Handler가 `ex_session`을 Bearer로 전달하며 `If-Match`를 보존하는지 확인합니다. select/multi-select/date precision과 delete/empty semantics를 포함합니다. relation은 기존 전용 endpoint를 유지합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
pnpm --filter @expresso/web test -- src/features/career-editor/properties/PropertyList.test.tsx src/app/api/career/records/[recordId]/route.test.ts
```

- [ ] **Step 3: 최소 Web boundary를 전환합니다**

UI state 전체를 재설계하지 않고 Definition ID/type을 사용해 Spring PATCH payload를 구성합니다. Spring response를 계약 parser로 확인하고 stale 412 처리와 기존 editor state 갱신을 유지합니다. body/Yjs 경로와 title root patch는 별도 권위를 그대로 둡니다.

- [ ] **Step 4: GREEN 후 localhost 수동 smoke를 수행합니다**

```powershell
pnpm --filter @expresso/web test -- src/features/career-editor/properties/PropertyList.test.tsx src/app/api/career/records/[recordId]/route.test.ts
pnpm --filter @expresso/web typecheck
```

**필수 수동 Web smoke:** migration 0011/0012와 reconciliation PASS 후 Spring/Fastify/Web을 함께 띄우고 `내 커리어 → Record 생성 → text/number/checkbox/tag/month/day/datetime 수정 → 새로고침 → 동일 값 확인 → stale tab 412 확인`을 실행합니다. DevTools에서 PATCH body가 Definition ID 기반이고 Mongo canonical `propertyValues`가 갱신되는지 확인합니다. relation/formula/rollup/Yjs는 이 smoke의 합격 범위가 아닙니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git commit -m "feat: Web 커리어 property patch canonical 전환"
```

**완료 조건:** 실제 사용자 Property 편집이 Spring canonical PATCH를 사용하고 자동/수동 검증이 통과합니다.

---

### Task 11: Legacy write 종료와 최종 cutover gate

Task 10 smoke와 관찰 기간 동안 mismatch가 0이고 rollback window가 승인된 뒤에만 실행합니다. legacy field 삭제/backfill 제거는 별도 후속 migration이며 이 Task에서 데이터를 삭제하지 않습니다.

**Files:**
- Modify: `services/backend/src/modules/career/service.ts`
- Modify: `services/backend/src/modules/career/property-schema.ts`
- Modify: `services/backend/src/modules/career/mongo-records.ts`
- Modify: focused Fastify tests
- Modify: `services/web/src/features/career-editor`의 남은 key-based writable path와 focused tests

- [ ] **Step 1: legacy-write guard failing tests를 작성합니다**

새 Record/Property update가 `properties`를 수정하지 않고 canonical `propertyValues`만 수정하는지, reader가 canonical을 우선하며 legacy-only record는 명시된 compatibility/error 정책을 따르는지 확인합니다. repository search test/checklist로 일반 writable path의 `properties` update가 남지 않았음을 고정합니다.

- [ ] **Step 2: RED를 확인합니다**

직접 관련된 Fastify/Web tests를 실행해 compatibility dual-write가 남아 있어 실패하는지 확인합니다.

- [ ] **Step 3: legacy write를 제거합니다**

Task 6의 임시 compatibility write를 제거하고 canonical-only write로 전환합니다. `properties`/`propertySchema(V2)` 필드는 rollback/read 관찰을 위해 DB에 남기되 더 이상 독립적으로 수정하지 않습니다. relation/formula/rollup/metadata와 `bodyMd`/Yjs 경계는 이 변경에 포함하지 않습니다.

- [ ] **Step 4: 최종 gate와 smoke**

Task 8 reconciliation을 다시 실행해 mismatch 0을 확인하고 Task 10의 핵심 smoke를 반복합니다. Fastify/Web focused tests, Spring Property HTTP tests, contracts test만 실행합니다. 전체 monorepo suite는 배포 정책이 별도로 요구할 때만 실행합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git commit -m "feat: 커리어 legacy property write 종료"
```

**완료 조건:** 일반 writable Property의 모든 production write authority가 canonical `propertyValues`이고 legacy 필드는 read-only rollback 자료로만 남습니다.

---

## 중요한 선후관계와 rollout

```text
Task 1 계약
  ├─ Task 3 Spring Definition projection
  └─ Task 4 Spring Value Domain

Task 2 inventory/preflight
  └─ Task 5 migration 0011

Task 1 + Task 2 + Task 5
  └─ Task 6 Spring Mongo/HTTP + Fastify same-operation compatibility writer

Task 5 + Task 6
  └─ Task 6 compatibility writer production 배포/canary 확인
      └─ Task 7 migration 0012 backfill
          └─ Task 8 reconciliation gate
              └─ Task 9 Fastify canonical read 전환
                  └─ Task 10 Web canonical PATCH + 필수 수동 smoke
                      └─ Task 11 legacy write 종료 + 최종 smoke
```

- OpenAPI 파일은 Task 1에서만 변경합니다.
- Category/Record Mongo validator는 0011에서 한 번에 최종 Property shape로 올립니다. 0012는 데이터 backfill만 담당합니다.
- `mongo-migrations.ts`와 `migrations.test.ts`는 0011과 0012가 순서대로 추가되므로 같은 파일을 병렬 수정하지 않습니다.
- Spring Domain은 Task 3/4, persistence/HTTP는 Task 6으로 나눠 migration 전 writer activation을 막습니다.
- Fastify compatibility write는 Task 6에서 구현·배포하고 Task 7 backfill 진입 전에 canary로 확인하며 Task 11에서 제거합니다. 한 Fastify command의 같은 Mongo operation/transaction 안에서만 두 표현을 쓰며, 서비스 간 dual-write나 장기 구조로 만들지 않습니다.
- Spring writable Property endpoint는 Task 6에 구현되더라도 Task 9의 Fastify canonical read 전환 전까지 Web/외부 mutation traffic에 연결하지 않습니다. 이 기간에 Spring만 canonical 값을 바꿔 Fastify legacy read가 stale해지는 반대 방향의 창도 막습니다.
- 0011 적용과 Task 6 compatibility writer 배포 사이에는 Category schema/Property write를 짧게 차단합니다. Task 6 canary가 통과하면 이 차단을 즉시 해제하며, backfill~cutover 전체에 걸친 긴 freeze는 사용하지 않습니다.

## 구현 전에 추가 확인이 필요한 blocker

다음은 Task 2 report에서 실제 데이터로 결론 내야 하며, 하나라도 해결되지 않으면 0011/0012를 실행하지 않습니다.

1. 공백만 있는 legacy tag 또는 현재 option name invariant를 위반하는 exact tag가 있는가.
2. 동일 Category/key의 `propertySchema.id`와 `propertySchemaV2.id`가 다르거나, custom Definition ID/key가 중복되는가.
3. 0009 ID를 공식 ID로 바꿀 수 없는 Spring `propertyValues` 또는 0009 계보 reference가 있는가.
4. legacy date 중 `YYYY-MM` 외 형식, 50,000자 초과 text, 지원하지 않는 BSON number/type이 있는가.
5. Task 6 compatibility writer가 모든 Fastify 일반 Property create/update와 Category schema mutation을 덮으며, 배포 canary에서 legacy/canonical digest 일치가 확인됐는가.

`required` enforcement lifecycle, visually similar tag merge, legacy field 물리 삭제 시점은 이번 canonical migration의 실행 blocker가 아닙니다. 별도 제품/운영 결정으로 남깁니다.

## Focused final verification

각 Task가 자체 GREEN을 만든 뒤 최종 cutover 직전에만 아래 범위를 한 번 묶어 실행합니다.

```powershell
pnpm --filter @expresso/contracts test -- src/career-record-slice-openapi.test.ts src/career-editor.test.ts
pnpm --filter @expresso/contracts typecheck
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/career-property-inventory.test.ts src/career-property-reconciliation.test.ts src/migrations.test.ts
pnpm --filter @expresso/database typecheck
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.domain.PropertyValueValidationTest" --tests "com.expresso.backend.career.CareerCategoriesHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordCreateHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordGetHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordPatchHttpIntegrationTest"
Set-Location ../..
pnpm --filter @expresso/backend test -- src/modules/career/property-schema.test.ts src/modules/career/category-move.test.ts src/modules/career/relations.test.ts src/modules/career/career.test.ts
pnpm --filter @expresso/web test -- src/features/career-editor/properties/PropertyList.test.tsx src/app/api/career/records/[recordId]/route.test.ts
git diff --check
```

## 예상 commit checkpoints

1. `feat: 커리어 canonical property 계약 확장`
2. `feat: 커리어 property migration 사전 점검 추가`
3. `feat: Spring 커리어 property definition 정렬`
4. `feat: 커리어 writable property value 도메인 확장`
5. `feat: 커리어 property definition ID 정렬 migration 추가`
6. `feat: 커리어 property value 쓰기 호환 확장`
7. `feat: 커리어 legacy property value backfill 추가`
8. `feat: 커리어 property cutover 검증 추가`
9. `feat: Fastify 커리어 canonical property 읽기 전환`
10. `feat: Web 커리어 property patch canonical 전환`
11. `feat: 커리어 legacy property write 종료`

총 예상 commit은 **11개**입니다. 실제 inventory에서 blocker가 발견되면 데이터 정리 정책/도구를 별도 commit으로 추가하고 기존 Task에 섞지 않습니다.
