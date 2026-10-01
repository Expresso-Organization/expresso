# Career rich BlockBody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** paragraph 전용 Spring `CareerRecord.blockBody`를 Editor `CareerDocument`의 의미를 손실 없이 표현하는 schemaVersion 1 rich semantic tree로 확장합니다.

**Architecture:** OpenAPI를 언어 중립 계약으로 먼저 확장하고 같은 fixture corpus로 Editor와 Spring을 정렬합니다. Spring Domain은 `SemanticBlock` 재귀 tree와 중앙 validator를 소유하며 HTTP/Mongo mapper가 명시적으로 변환합니다. Yjs, WebSocket, `documentVersion`은 바꾸지 않습니다.

**Tech Stack:** OpenAPI 3.1, TypeScript 7, Zod 4, Vitest 4, Java 21, Spring Boot 4.1.1, Spring MVC, Jackson 3, MongoTemplate, MongoDB 8, JUnit 5, MockMvc, Testcontainers

**Spec:** `docs/superpowers/specs/2026-09-03-career-rich-block-body-design.md`

## Global Constraints

- `schemaVersion: 1`과 root `type: doc`을 유지합니다.
- root `content: []`는 허용하지만 POST는 UUID를 가진 empty paragraph 하나를 계속 만듭니다.
- block type regex는 `^[a-z][a-zA-Z0-9_.-]{0,63}$`이고 unknown type과 추가 attrs를 보존합니다.
- known block에는 type별 invariant, unknown block에는 공통 semantic/safety invariant만 적용합니다.
- 전역 block ID 유일성, depth 32, 전체 20,000 blocks를 강제합니다.
- attrs JSON depth 16, block attrs 65,536 bytes, mark attrs 8,192 bytes를 강제합니다.
- TextSpan은 0~200,000 code points, span당 mark는 최대 20개입니다.
- compact UTF-8 `BlockBody`는 최대 4,194,304 bytes입니다.
- Domain에는 Jackson/BSON/Tiptap/Yjs/WebSocket 타입을 넣지 않습니다.
- `properties`/`bodyMd`를 변환·삭제하지 않고 legacy backfill도 하지 않습니다.
- Java validation 메시지는 한국어, identifier는 영어로 유지합니다.
- endpoint 추가, 목록 API, Yjs snapshot 연결, `documentVersion` 통합은 범위 밖입니다.

## Repository facts

- 현재 Spring 모델은 `BlockBody(List<ParagraphBlock>)`, `ParagraphBlock`, mark 없는 `TextSpan`입니다.
- `CareerRecordController`는 `@RequestBody Map<String,Object>`를 직접 paragraph-only mapping합니다.
- Mongo writer/projector도 paragraph-only이며 malformed canonical은 기존 data-integrity 500 경로를 탑니다.
- rebase 이후 Career Slice migration은 `0009`입니다. rich validator는 checksum 보존을 위해 `0010`으로 추가해야 합니다.
- 0009 validator는 root 최소 1 paragraph, 빈 attrs, mark 없는 non-empty text만 허용합니다.
- MongoDB 8 `$jsonSchema`는 draft 4 일부만 지원하고 `$ref`가 없어 재귀/global invariant를 완전히 표현할 수 없습니다.
- Spring 설정에는 JSON body 상한이 없습니다. Tomcat의 form-post 상한은 JSON 상한이 아닙니다.
- nginx `client_max_body_size 8m`는 canonical 4 MiB보다 큽니다. 현재 `/v1/`은 Fastify `:4500`으로 가며 upstream 전환은 별도 작업입니다.
- Jackson untyped JSON은 Map/List/scalar/null입니다. BSON number 왕복을 persistence mapper가 명시해야 합니다.
- Editor는 rich/unknown/depth 32/block 20,000을 지원하지만 text 50,000자이며 known/attrs/document byte 검증은 없습니다.

## File map

| 파일 | 책임 |
| --- | --- |
| `packages/contracts/openapi/career-record-slice-v1.yaml` | 공통 rich 문서 계약 |
| `packages/contracts/openapi/fixtures/career-rich-block-body-v1.json` | OpenAPI/Editor/Spring 공용 정상 fixture |
| `packages/editor/src/document.ts` | Editor canonical validator |
| `packages/database/src/mongodb-migrations/0010/migration.ts` | forward-only DB validator |
| Spring `career/domain` | semantic tree와 중앙 validator |
| Spring Mongo writer/projector | 재귀 BSON 왕복 |
| `CareerRecordController` | rich HTTP request/response |

---

### Task 1: OpenAPI rich document 계약과 공용 fixture

**Files:**
- Create: `packages/contracts/openapi/fixtures/career-rich-block-body-v1.json`
- Modify: `packages/contracts/openapi/career-record-slice-v1.yaml:298-350`
- Modify: `packages/contracts/src/career-record-slice-openapi.test.ts`

**Interfaces:**
- Consumes: spec의 BlockBody/Block/TextSpan/TextMark와 invariant
- Produces: `BlockBody`, `CareerBlock`, `CareerTextSpan`, `CareerTextMark` schemas와 공용 fixture

- [ ] **Step 1: 재귀 schema용 test loader와 failing tests를 작성합니다**

`SwaggerParser.dereference()` 대신 `validate()` 후 `parse()`하여 재귀 $ref를 유지합니다. AJV에는 다음 wrapper를 compile합니다.

```ts
return ajv.compile({
  $ref: "#/components/schemas/" + name,
  components: { schemas: contract.components.schemas },
} as AnySchema);
```

fixture key는 `paragraphOnly`, `emptyRoot`, `richNested`, `unknownBlock`입니다. rich fixture에는 heading, nested list/table, marks/link attrs, code/image/file/evidence attrs를 넣고 unknown fixture에는 nested attrs와 content/text를 함께 둡니다.

```ts
it("accepts the shared v1 rich corpus", () => {
  const validate = schemaValidator("BlockBody");
  for (const fixture of Object.values(fixtures)) {
    expect(validate(fixture), ajv.errorsText(validate.errors)).toBe(true);
  }
});
```

별도 실패 fixture로 list direct text, image without mediaId, link without href를 거절하고 unknown type은 허용합니다. root empty, text empty/200,000, recursive $ref, known type metadata, 모든 vendor limit도 assert합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
pnpm --filter @expresso/contracts test -- src/career-record-slice-openapi.test.ts
```

Expected: loader 문제가 아니라 현재 ParagraphBlock/root minItems/TextSpan minLength/metadata 차이로 실패합니다.

- [ ] **Step 3: 최소 OpenAPI schema를 구현합니다**

```yaml
CareerTextMark:
  type: object
  additionalProperties: false
  required: [type]
  properties:
    type: { type: string, enum: [bold, italic, strike, code, link] }
    attrs: { type: object, additionalProperties: true }
CareerTextSpan:
  type: object
  additionalProperties: false
  required: [text]
  properties:
    text: { type: string, maxLength: 200000 }
    marks:
      type: array
      maxItems: 20
      items: { $ref: "#/components/schemas/CareerTextMark" }
CareerBlock:
  type: object
  additionalProperties: false
  required: [id, type, attrs]
  properties:
    id: { $ref: "#/components/schemas/Uuid" }
    type: { type: string, pattern: '^[a-z][a-zA-Z0-9_.-]{0,63}$' }
    attrs: { type: object, additionalProperties: true }
    content:
      type: array
      maxItems: 20000
      items: { $ref: "#/components/schemas/CareerBlock" }
    text:
      type: array
      items: { $ref: "#/components/schemas/CareerTextSpan" }
```

`CareerBlock.allOf`에 spec §6의 known type별 `if/then`을 모두 둡니다. unknown을 닫는 enum/else는 두지 않습니다. `link`에는 non-empty href를 요구합니다. `BlockBody.x-expresso-invariants`에 32/20,000/16/65,536/8,192/4,194,304와 global ID를 기록하고 extension 자체는 runtime validation이 아니라고 설명합니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
pnpm --filter @expresso/contracts test -- src/career-record-slice-openapi.test.ts
pnpm --filter @expresso/contracts typecheck
pnpm --filter @expresso/contracts build
```

기존 paragraph fixture와 bearer/idempotency/propertyValues/ETag도 통과하고 unknown이 닫히지 않았는지 검토합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/contracts/openapi/career-record-slice-v1.yaml packages/contracts/openapi/fixtures/career-rich-block-body-v1.json packages/contracts/src/career-record-slice-openapi.test.ts
git commit -m "feat: rich block body OpenAPI 계약 확장"
```

**완료 조건:** 공용 정상 fixture 네 종류와 known-invalid fixture가 OpenAPI 3.1/AJV에서 기대대로 판정되고 기존 Career 계약 테스트·typecheck·build가 통과합니다.

---

### Task 2: Editor CareerDocument validation 정렬

**Files:**
- Modify: `packages/editor/src/document.ts`
- Modify: `packages/editor/src/document.test.ts`
- Modify: `packages/editor/src/yjs.test.ts`
- Read: 공용 rich fixture

**Interfaces:**
- Consumes: Task 1 contract/fixture
- Produces: `parseCareerDocument(input): CareerDocument`가 같은 canonical 규칙을 강제함; Yjs signature는 유지

- [ ] **Step 1: failing tests를 작성합니다**

```ts
it("accepts the shared corpus and 200000-character text", () => {
  for (const fixture of Object.values(fixtures)) {
    expect(parseCareerDocument(fixture)).toEqual(fixture);
  }
  expect(() => parseCareerDocument(documentWithText("가".repeat(200_000)))).not.toThrow();
});
```

known invalid block, attrs depth 17, attrs/mark attrs byte 초과, document 4 MiB 초과를 거절하는 tests를 추가합니다. `yjs.test.ts`는 rich/unknown fixture를 encode → reconstruct하여 equality를 확인합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
pnpm --filter @expresso/editor test -- src/document.test.ts src/yjs.test.ts
```

Expected: 200,000자는 현재 50,000자에서 실패하고 known/byte invalid 값은 현재 parser를 통과합니다.

- [ ] **Step 3: 중앙 순회 validator를 구현합니다**

TextSpan 상한을 200,000으로 올리고 빈 문자열을 유지합니다. 기존 한 번의 tree traversal에서 ID/depth/count와 known rules를 검사합니다. JSON depth와 compact UTF-8 bytes는 다음 기준을 공유합니다.

```ts
const LIMITS = {
  maxDepth: 32, maxBlocks: 20_000, maxAttrsDepth: 16,
  maxBlockAttrsBytes: 65_536, maxMarkAttrsBytes: 8_192,
  maxDocumentBytes: 4_194_304,
} as const;
const compactUtf8Bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
```

known rule switch의 default는 unknown을 거절하지 않습니다. 추가 attrs는 제거/rename하지 않습니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
pnpm --filter @expresso/editor test -- src/document.test.ts src/yjs.test.ts src/commands.test.ts src/markdown.test.ts
pnpm --filter @expresso/editor typecheck
pnpm --filter @expresso/editor build
pnpm --filter @expresso/contracts test -- src/career-editor.test.ts src/career-record-slice-openapi.test.ts
```

Tiptap node 제약을 canonical rule로 복사하지 않았고 Yjs/WebSocket/documentVersion을 바꾸지 않았는지 검토합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/editor/src/document.ts packages/editor/src/document.test.ts packages/editor/src/yjs.test.ts
git commit -m "feat: 커리어 문서 rich validation 정렬"
```

**완료 조건:** 공용 fixture와 200,000자 text가 Editor parser/Yjs를 왕복하고 known/safety 위반은 거절되며 기존 commands/Markdown consumer가 통과합니다.

---

### Task 3: MongoDB 0010 rich BlockBody validator

**Files:**
- Create: `packages/database/src/mongodb-migrations/0010/migration.ts`
- Modify: `packages/database/src/mongo-migrations.ts`
- Modify: `packages/database/src/migrations.test.ts`

**Interfaces:**
- Consumes: Task 1 shape와 0009 validator
- Produces: `0010_career_rich_block_body`; legacy required/index를 보존하며 rich writes를 허용

- [ ] **Step 1: failing migration tests를 작성합니다**

source test는 migration count 10과 마지막 `version: "0010", name: "career_rich_block_body"`를 고정합니다. MongoDB 8 test는 0001~0009 뒤 paragraph/legacy-only가 계속 들어가고 empty root, nested list/table, marks, unknown이 들어가야 함을 assert합니다. top-level type regex 오류, attrs non-object, text 200,001, mark 21개는 거절해야 합니다. 재실행 전후 정상 record와 unrelated validator도 비교합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/migrations.test.ts
```

Expected: 0010 미등록 및 0009의 paragraph-only validator 때문에 실패합니다. 연결 오류나 skipped test는 RED가 아닙니다.

- [ ] **Step 3: forward-only 0010을 구현합니다**

기존 방식으로 source checksum과 step을 등록합니다. 현재 validator를 `structuredClone`하고 `career_records.$jsonSchema.properties.blockBody`만 교체합니다. required/legacy/index는 바꾸지 않고 document rewrite도 하지 않습니다.

Mongo `$jsonSchema`에는 root v1/doc/content, top-level id/type/attrs, optional content object array, optional text/marks common shape만 둡니다. $ref가 없으므로 nested full shape/global invariant/known conditional을 완전히 보장한다고 주장하지 않습니다. `$where`나 server-side JavaScript도 사용하지 않습니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/migrations.test.ts
pnpm --filter @expresso/database typecheck
pnpm --filter @expresso/database build
```

Test가 skip되지 않고 PASS해야 합니다. 0009 checksum, legacy required/index, 기존 data가 그대로인지 검토합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- packages/database/src/mongodb-migrations/0010/migration.ts packages/database/src/mongo-migrations.ts packages/database/src/migrations.test.ts
git commit -m "feat: rich block body MongoDB validator 추가"
```

**완료 조건:** 0010이 MongoDB 8에서 rich/empty/unknown 문서를 허용하고 명시한 공통 오류를 거절하며, 재실행에도 기존 데이터·legacy required·index가 바뀌지 않습니다.

---

### Task 4: Spring rich Domain과 중앙 validator

이 Task는 MongoDB를 다루지 않습니다. `BlockBody`를 rich semantic tree로 확정하고 순수 Java unit test로 검증합니다. 현재 writer/projector/Controller가 `ParagraphBlock`을 참조하므로 checkpoint가 컴파일 가능한 상태를 유지하기 위한 임시 public paragraph 호환 생성자·접근자만 둡니다. 이것은 새 canonical 모델이 아니며 Task 5와 6에서 소비자를 옮긴 뒤 제거합니다.

**Files:**
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/SemanticBlock.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/TextMark.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/CanonicalJsonValues.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/CanonicalJsonUtf8Size.java`
- Create: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/BlockBodyValidator.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/BlockBody.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/TextSpan.java`
- Temporarily retain: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/ParagraphBlock.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/domain/CareerRecordCreationTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/domain/CareerRecordChangeSetTest.java`
- Create: `services/backend-spring/src/test/java/com/expresso/backend/career/domain/BlockBodyValidationTest.java`

**Interfaces:**
- Consumes: Task 1 rich v1 계약의 semantic invariant
- Produces:

```java
public record BlockBody(List<SemanticBlock> content) {
    public static BlockBody empty(String paragraphId);
}
public record SemanticBlock(
        String id, String type, Map<String, Object> attrs,
        List<SemanticBlock> content, List<TextSpan> text) {
}
public record TextSpan(String text, List<TextMark> marks) {
}
public record TextMark(String type, Map<String, Object> attrs) {
}
```

공용 rich fixture는 정상 end-to-end 의미를 확인하는 한 테스트에서만 읽습니다. duplicate ID, depth, count, byte limit 같은 개별 규칙은 작은 inline builder/fixture로 검증하여 하나의 거대한 fixture에 unit test 전체가 결합되지 않게 합니다.

- [ ] **Step 1: Domain rich/safety failing tests를 작성합니다**

```java
@Test
void preservesNestedAttrsMarksAndUnknownBlocksWithDefensiveCopies() { }
@Test
void acceptsEmptyRootEmptyTextAndTwoHundredThousandCodePoints() { }
@Test
void rejectsDuplicateIdsAcrossDifferentDepths() { }
@Test
void rejectsDepthThirtyThreeAndMoreThanTwentyThousandBlocks() { }
@Test
void rejectsAttrsDepthAndByteLimitsAndAWholeDocumentOverFourMib() { }
@Test
void validatesKnownBlocksButKeepsUnknownBlocksOpen() { }
@Test
void acceptsTheExistingParagraphOnlyDocumentShape() { }
```

defensive-copy test는 원본 nested Map/List를 바꿔도 Domain이 바뀌지 않고 반환 collection 수정이 실패하며 JSON null이 보존되는지 확인합니다. creation test는 `content()` 기준 empty paragraph를, change-set test는 rich body equality/no-op/version 1회 증가를 확인합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.domain.CareerRecordCreationTest" --tests "com.expresso.backend.career.domain.CareerRecordChangeSetTest" --tests "com.expresso.backend.career.domain.BlockBodyValidationTest"
```

Expected: `SemanticBlock`/`TextMark`/rich constructors가 없어 compile/test가 실패합니다. fixture path 오류는 올바른 RED가 아닙니다.

- [ ] **Step 3: immutable semantic records와 JSON copier를 구현합니다**

`CanonicalJsonValues`는 package-private 순수 Java helper입니다. String, Boolean, null, finite Number, List, string-key Map만 허용합니다. 정수는 Long, 소수는 정규화한 `BigDecimal`로 보관합니다. Map은 `LinkedHashMap` 재귀 복사 후 `Collections.unmodifiableMap`, List는 새 `ArrayList` 후 `Collections.unmodifiableList`로 감쌉니다. JSON null 때문에 `Map.copyOf`를 사용하지 않습니다. `BlockBody`, `SemanticBlock`, `TextSpan`, `TextMark`도 중첩 collection까지 방어 복사합니다.

- [ ] **Step 4: bounded 중앙 validator를 구현합니다**

`BlockBody` constructor는 방어 복사 뒤 `BlockBodyValidator.validate(this)`를 호출합니다.

```java
static void validate(BlockBody body) {
    var state = new ValidationState();
    for (var block : body.content()) {
        visit(block, 1, state);
    }
    requireDocumentBytesAtMost(body, 4_194_304);
}
```

depth 32를 넘으면 더 재귀하지 않아 stack을 제한합니다. 한 번의 방문에서 ID set, block count, JSON depth/bytes, text/marks, spec §6의 known rules를 검사합니다. known rules는 inheritance가 아닌 `switch (block.type())`에 모으고 unknown default는 공통 규칙만 적용합니다.

4 MiB는 Jackson serialization으로 재지 않습니다. `CanonicalJsonUtf8Size`가 canonical tree를 직접 순회하면서 compact JSON의 문법 문자, UTF-8 scalar byte 수, JSON escape 비용을 합산하고 4,194,304 bytes를 넘는 즉시 중단합니다. 이 helper는 JDK 타입만 import합니다. 테스트는 ASCII 경계, escape 문자, 다중-byte Unicode, 제한 초과 조기 종료를 작은 값으로 각각 검증합니다. 오류는 `"문서 전체에서 같은 block id를 중복해서 사용할 수 없습니다"`처럼 한국어로 작성합니다.

- [ ] **Step 5: 기존 Java 소비자를 위한 임시 compile seam을 둡니다**

Java generic erasure 때문에 `BlockBody(List<SemanticBlock>)`와 `BlockBody(List<ParagraphBlock>)`를 함께 둘 수 없습니다. 따라서 `BlockBody(Collection<ParagraphBlock>)` overload와 `paragraphs()` accessor를 임시 public API로 두고 둘 다 `@Deprecated`와 제거 Task를 주석으로 명시합니다. rich 데이터를 legacy paragraph로 downgrade하는 일반 변환은 만들지 않으며 accessor는 paragraph-only content에만 동작합니다.

이 seam은 Task 4가 Mongo/API 파일을 수정하지 않고도 모듈 compile을 통과하기 위한 순차 구현 장치입니다. Task 5가 Mongo 소비자를, Task 6이 API 소비자를 `content()`로 옮기면 `ParagraphBlock`과 seam을 삭제합니다.

- [ ] **Step 6: GREEN과 review checkpoint**

```powershell
.\gradlew.bat test --tests "com.expresso.backend.career.domain.CareerRecordCreationTest" --tests "com.expresso.backend.career.domain.CareerRecordChangeSetTest" --tests "com.expresso.backend.career.domain.BlockBodyValidationTest"
Set-Location ../..
```

Domain source의 import를 검색해 Jackson/BSON/MongoTemplate/Tiptap/Yjs가 없음을 확인합니다. 공용 fixture test 외의 validation tests가 독립적인 작은 입력을 쓰는지도 검토합니다.

- [ ] **Step 7: checkpoint commit**

```powershell
git add -- services/backend-spring/src/main/java/com/expresso/backend/career/domain services/backend-spring/src/test/java/com/expresso/backend/career/domain
git commit -m "feat: 커리어 rich block body 도메인 모델 확장"
```

**완료 조건:** Mongo/Spring context 없이 rich/unknown/paragraph-only Domain 객체, 방어 복사, 중앙 invariant, change-set semantics가 통과하고 전체 Spring main source가 임시 seam으로 컴파일됩니다.

---

### Task 5: Mongo rich writer/projector round-trip

이 Task는 확정된 Domain과 BSON 사이의 lossless 변환만 담당합니다. HTTP/API mapping은 건드리지 않습니다.

**Files:**
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordWriter.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordProjector.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordProjectorTest.java`

**Interfaces:**
- Consumes: Task 4 `BlockBody`/`SemanticBlock`/`TextSpan`/`TextMark`
- Produces: recursive BSON write와 BSON → Domain projection

- [ ] **Step 1: Mongo round-trip failing tests를 작성합니다**

공용 rich fixture로 nested blocks, marks, known/unknown attrs가 writer → BSON `Document` → projector에서 같은 semantic 값인지 확인합니다. 별도의 작은 JSON scalar fixture에는 null, boolean, integer, decimal, string, array, nested object를 모두 넣습니다. block attrs와 mark attrs 양쪽에서 테스트하며 정수/소수의 Domain 정규형까지 명시적으로 assert합니다.

기존 paragraph-only canonical Mongo document projection도 유지하고 malformed known block/unsupported BSON scalar는 기존 data-integrity failure로 남깁니다.

```java
@Test
void roundTripsEverySupportedJsonValueInBlockAndMarkAttrs() { }

@Test
void projectsTheExistingParagraphOnlyCanonicalDocument() { }
```

- [ ] **Step 2: RED를 확인합니다**

```powershell
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.infrastructure.mongo.MongoCareerRecordProjectorTest"
```

Expected: 기존 writer/projector가 recursive content, marks 또는 open-ended attrs를 보존하지 않아 semantic equality가 실패합니다.

- [ ] **Step 3: writer/projector를 재귀 mapping합니다**

writer는 id/type/attrs/content/text/marks를 재귀 BSON으로 옮기고 projector는 BSON container/scalar를 `CanonicalJsonValues`가 받을 JSON-safe Java 값으로 변환합니다.

- Domain Long ↔ BSON long
- Domain BigDecimal ↔ BSON `Decimal128`
- BSON int/long → Long
- finite BSON double/Decimal128 → 정규화한 `BigDecimal`
- BSON null/boolean/string/list/document → 대응 JSON 의미

NaN, Infinity, ObjectId/Date/binary 같은 attrs 값은 projection failure입니다. legacy 무시, partial canonical 거절, malformed canonical → 기존 `CareerRecordDataIntegrityException` 정책을 유지합니다. 실제 Mongo codec 의미를 확인해야 할 때만 MongoDB 8 Testcontainer test를 추가하고, 단순 `Document` 왕복으로 충분하면 unit test로 유지합니다.

- [ ] **Step 4: GREEN과 review checkpoint**

```powershell
.\gradlew.bat test --tests "com.expresso.backend.career.infrastructure.mongo.MongoCareerRecordProjectorTest"
Set-Location ../..
```

Mongo mapper가 unknown type/attrs/marks/nesting/order와 모든 JSON scalar 의미를 보존하는지 확인합니다. 기존 paragraph-only 및 canonical/legacy read boundary도 같은 test class에서 필요한 케이스만 회귀 검증합니다.

- [ ] **Step 5: checkpoint commit**

```powershell
git add -- services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordWriter.java services/backend-spring/src/main/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordProjector.java services/backend-spring/src/test/java/com/expresso/backend/career/infrastructure/mongo/MongoCareerRecordProjectorTest.java
git commit -m "feat: rich block body Mongo projection 확장"
```

**완료 조건:** rich/unknown/paragraph-only BlockBody와 명시한 JSON 값이 BSON writer/projector round-trip에서 의미를 잃지 않으며 HTTP 코드는 바뀌지 않습니다.

---

### Task 6: POST/GET/PATCH rich BlockBody HTTP 적용

**Files:**
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/api/CareerRecordController.java`
- Modify: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/BlockBody.java`
- Delete: `services/backend-spring/src/main/java/com/expresso/backend/career/domain/ParagraphBlock.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordCreateHttpIntegrationTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordGetHttpIntegrationTest.java`
- Modify: `services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordPatchHttpIntegrationTest.java`
- Read: 공용 rich fixture

**Interfaces:**
- Consumes: Task 4 semantic Domain, Task 5 Mongo mapping과 기존 authenticated use cases
- Produces: 기존 endpoints가 rich blockBody를 lossless 처리함; auth/idempotency/owner/ETag/If-Match는 동일

- [ ] **Step 1: HTTP failing tests를 작성합니다**

GET은 rich/unknown Mongo document의 nested order, marks/link attrs, block attrs, unknown content/text를 그대로 응답하고 다른 `bodyMd`를 무시해야 합니다.

PATCH는 공용 rich body를 `"v1"`로 보내 200/`"v2"`, 동일 BSON 저장, legacy `bodyMd` 유지까지 확인합니다. 같은 body를 `"v2"`로 재전송하면 version/updatedAt no-op이어야 합니다. known invalid, duplicate nested ID, depth 33, attrs 제한, 4 MiB 초과는 400 `VALIDATION_ERROR`여야 합니다. 기존 stale/concurrent update도 유지합니다.

POST는 root empty 허용과 무관하게 응답/Mongo가 정확히 한 empty paragraph로 시작하는지 계속 확인합니다.

- [ ] **Step 2: RED를 확인합니다**

```powershell
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.CareerRecordCreateHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordGetHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordPatchHttpIntegrationTest"
```

Expected: rich PATCH가 현재 paragraph-only request parser에서 400이어서 실패합니다.

- [ ] **Step 3: recursive request parser를 구현합니다**

`readBlockBody`는 root exact fields를 유지하고 block은 required id/type/attrs와 optional content/text만 받습니다.

```java
private static SemanticBlock readSemanticBlock(Object value) {
    var block = requireMap(value, "block");
    requireRequiredAndOptionalFields(
            block, Set.of("id", "type", "attrs"),
            Set.of("content", "text"), "block");
    return new SemanticBlock(
            normalizeUuid(requireString(block, "id"), "block id"),
            requireString(block, "type"),
            readJsonObject(block.get("attrs"), "block attrs"),
            readOptionalList(block, "content", CareerRecordController::readSemanticBlock),
            readOptionalList(block, "text", CareerRecordController::readTextSpan));
}
```

TextSpan은 text/optional marks, TextMark는 type/optional attrs만 받습니다. JSON 값을 제거·rename하지 않고 Domain copier가 type/depth/byte를 검사합니다. Domain `IllegalArgumentException`은 내부 메시지를 노출하지 않는 기존 400 계약으로 변환합니다.

`server.tomcat.max-http-form-post-size`는 추가하지 않습니다. compact semantic 4 MiB는 Domain이 강제하고 운영 raw body는 nginx 8 MiB가 막습니다. nginx를 우회한 direct Spring port의 raw-body filter는 범위를 키우지 않고 후속 운영 hardening 항목으로 남깁니다.

- [ ] **Step 4: 임시 paragraph seam을 제거합니다**

Controller의 request/response와 POST empty body 생성을 모두 `SemanticBlock`/`content()`로 옮긴 뒤 `ParagraphBlock.java`, `BlockBody`의 임시 compatibility constructor/accessor를 삭제합니다. Mongo 소비자는 Task 5에서 이미 전환되었으므로 남은 사용처가 없음을 `rg "ParagraphBlock|\\.paragraphs\\(\\)" services/backend-spring/src`로 확인합니다.

- [ ] **Step 5: GREEN과 review checkpoint**

```powershell
.\gradlew.bat test --tests "com.expresso.backend.career.CareerRecordCreateHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordGetHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordPatchHttpIntegrationTest"
Set-Location ../..
```

POST empty paragraph, PATCH legacy 미변경, owner query, `_id + userId + deletedAt:null + version`, ETag/If-Match, absent/empty collection 정규화를 검토합니다.

- [ ] **Step 6: checkpoint commit**

```powershell
git add -- services/backend-spring/src/main/java/com/expresso/backend/career/api/CareerRecordController.java services/backend-spring/src/main/java/com/expresso/backend/career/domain/BlockBody.java services/backend-spring/src/main/java/com/expresso/backend/career/domain/ParagraphBlock.java services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordCreateHttpIntegrationTest.java services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordGetHttpIntegrationTest.java services/backend-spring/src/test/java/com/expresso/backend/career/CareerRecordPatchHttpIntegrationTest.java
git commit -m "feat: 커리어 rich block body API 적용"
```

**완료 조건:** POST 기본값, GET rich response, PATCH rich write/no-op, invalid 400과 기존 auth/Idempotency-Key/owner/version/ETag/If-Match/optimistic concurrency 동작이 모두 통과하며 임시 paragraph seam이 남지 않습니다.

---

## Final focused verification

```powershell
pnpm --filter @expresso/contracts test -- src/career-record-slice-openapi.test.ts src/career-editor.test.ts
pnpm --filter @expresso/contracts typecheck
pnpm --filter @expresso/contracts build
pnpm --filter @expresso/editor test -- src/document.test.ts src/yjs.test.ts src/commands.test.ts src/markdown.test.ts
pnpm --filter @expresso/editor typecheck
pnpm --filter @expresso/editor build
$env:TEST_MONGODB_URL = "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0"
pnpm --filter @expresso/database test -- src/migrations.test.ts
pnpm --filter @expresso/database typecheck
pnpm --filter @expresso/database build
Set-Location services/backend-spring
.\gradlew.bat test --tests "com.expresso.backend.career.domain.*" --tests "com.expresso.backend.career.infrastructure.mongo.MongoCareerRecordProjectorTest" --tests "com.expresso.backend.career.CareerRecordCreateHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordGetHttpIntegrationTest" --tests "com.expresso.backend.career.CareerRecordPatchHttpIntegrationTest"
Set-Location ../..
git diff --check
git status --short
```

완료 조건:

- 공용 fixture가 OpenAPI, Editor, Spring Domain/Mongo/API에서 같은 semantic 값으로 통과합니다.
- 기존 paragraph-only canonical record는 migration/backfill 없이 읽힙니다.
- auth, idempotency, owner, ETag, If-Match, optimistic concurrency, no-op에 회귀가 없습니다.
- Yjs/WebSocket/Fastify/Web UI 변경은 없습니다.

## Rollout order

구현 commit 순서와 운영 rollout 순서는 다릅니다.

1. OpenAPI와 consumer validation 배포
2. MongoDB migration 0010 적용
3. rich reader를 포함한 Spring 배포
4. rich PATCH writer 활성화

Spring writer flag가 없으므로 3과 4를 한 binary로 배포하면 0010을 반드시 먼저 적용합니다. 구버전 Spring reader가 남아 있는 동안 rich PATCH traffic을 보내지 않습니다. nginx upstream 전환과 Web/Yjs snapshot 연결은 별도 계획입니다.

## Expected commit checkpoints

1. `feat: rich block body OpenAPI 계약 확장`
2. `feat: 커리어 문서 rich validation 정렬`
3. `feat: rich block body MongoDB validator 추가`
4. `feat: 커리어 rich block body 도메인 모델 확장`
5. `feat: rich block body Mongo projection 확장`
6. `feat: 커리어 rich block body API 적용`
