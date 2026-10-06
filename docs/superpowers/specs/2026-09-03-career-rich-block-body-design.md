# Career rich BlockBody 설계

작성 2026-09-03 · 범위 CareerRecord canonical 본문 계약

## 1. 문제 정의

Spring CareerRecord의 `blockBody`는 canonical 본문이지만 현재는 최상위
paragraph와 mark 없는 text만 표현합니다. 실제 Career Editor의
`CareerDocument`는 heading, 목록, 표, 이미지, 중첩 블록, mark와 임의 JSON
attrs를 보존합니다. 지금 구조로 Editor 문서를 `blockBody`에 기록하면 의미 있는
정보가 사라지거나 Spring projection이 실패합니다.

이번 설계는 `CareerRecord.blockBody`를 편집 기술과 무관한 rich semantic
document로 확장합니다. Yjs, WebSocket과 Tiptap은 Domain에 넣지 않습니다.
OpenAPI가 공통 의미 계약이고 Editor와 Spring이 각각 그 계약을 구현합니다.

## 2. 현재 CareerDocument 구조

`packages/editor/src/document.ts`의 현재 구조는 다음과 같습니다.

```ts
interface CareerDocument {
  schemaVersion: 1;
  type: "doc";
  content: CareerBlock[];
}

interface CareerBlock {
  id: string;
  type: string;
  attrs: Record<string, JsonValue>;
  content?: CareerBlock[];
  text?: CareerTextSpan[];
}

interface CareerTextSpan {
  text: string;
  marks?: CareerMark[];
}

interface CareerMark {
  type: "bold" | "italic" | "strike" | "code" | "link";
  attrs?: Record<string, JsonValue>;
}
```

현재 알려진 block type은 다음 18개입니다.

- `paragraph`, `heading1`, `heading2`, `heading3`
- `bulletList`, `orderedList`, `taskList`, `listItem`
- `blockquote`, `code`, `callout`, `horizontalRule`
- `image`, `file`
- `table`, `tableRow`, `tableCell`
- `evidence`

이 목록 밖의 type도 `^[a-z][a-zA-Z0-9_.-]{0,63}$`에 맞으면 허용합니다.
문서 전체에서 block ID는 유일해야 하고, 최대 깊이는 32, 전체 block 수는
20,000입니다. 현재 text span은 빈 문자열을 허용하고 최대 50,000자이며 mark는
span당 최대 20개입니다. root `content`도 빈 배열일 수 있습니다.

Tiptap adapter는 `id`를 `careerId`로 옮깁니다. code의 `language`, task item의
`checked`, image의 `mediaId`와 `alt`를 별도로 변환합니다. 지원하지 않는 block은
`careerCompatibility` atom 안에 원본 block 전체를 넣어 보존합니다. 현재 Markdown
호환 경로는 `sourceMarkdown`을 비롯해 file의 `name`과 `mediaId`, evidence의
`source` 같은 attrs도 사용합니다.

Yjs adapter는 이 semantic tree를 블록별 Yjs 타입으로 노출하지 않습니다.
검증된 `CareerDocument` 전체를 JSON 문자열로 만든 뒤 Y.Map의 `json` 값으로
저장합니다. 따라서 CareerDocument가 Yjs보다 안쪽의 semantic 경계입니다.

## 3. 현재 Spring BlockBody 한계

현재 Spring Domain은 다음 세 record로 이루어집니다.

```java
BlockBody(List<ParagraphBlock> paragraphs)
ParagraphBlock(String id, List<TextSpan> text)
TextSpan(String text)
```

Mongo/API mapper가 `schemaVersion: 1`, `type: doc`, block `type: paragraph`,
`attrs: {}`를 고정합니다. OpenAPI와 migration 0009의 Mongo validator도 같은
paragraph-only shape만 허용합니다.

이 모델은 다음 정보를 표현하지 못합니다.

- paragraph 이외의 block type
- 중첩 `content`
- block attrs
- text mark와 link attrs
- root의 빈 `content`
- 빈 text span

반대로 Spring TextSpan은 200,000자까지 허용하므로 Editor의 50,000자 제한보다
넓습니다. 두 제한을 그대로 두면 어느 방향으로도 하나의 canonical 계약이 되지
않습니다.

## 4. 목표 책임 경계

```text
Tiptap UI
  ↕ adapter
Career semantic document
  ↕ Yjs encode/decode             ↕ OpenAPI/API/Mongo mapping
Yjs · WebSocket · documentVersion  CareerRecord.blockBody · record version
```

Collaboration은 실시간 update 병합, session, document snapshot과
`documentVersion`을 담당합니다. Career Domain은 사용자가 작성한 본문의 현재
semantic state와 CareerRecord optimistic concurrency를 담당합니다.

다음 값은 Career Domain에 들어가지 않습니다.

- `Y.Doc`, `Y.Map`, state vector와 binary update
- WebSocket session과 client/server sequence
- Tiptap Node 또는 ProseMirror 타입
- `documentVersion`

`documentVersion`과 `CareerRecord.version`은 목적이 다르므로 합치지 않습니다.

## 5. canonical rich document schema 제안

권장 JSON shape는 현재 CareerDocument의 재귀 구조와 같습니다.

```json
{
  "schemaVersion": 1,
  "type": "doc",
  "content": [
    {
      "id": "34efea8f-0355-4f0c-b8cc-4eedbeaa15f7",
      "type": "heading2",
      "attrs": {},
      "text": [
        {
          "text": "성과",
          "marks": [{ "type": "bold" }]
        }
      ]
    },
    {
      "id": "49243408-13d2-4587-93bd-da8b9f61d9f7",
      "type": "bulletList",
      "attrs": { "sourceMarkdown": "- 처리량 30% 향상" },
      "content": [
        {
          "id": "cf13bfa6-8ff0-4af6-9f87-1c77e526e39c",
          "type": "listItem",
          "attrs": {},
          "text": [{ "text": "처리량 30% 향상" }]
        }
      ]
    }
  ]
}
```

`CareerBlock`은 `id`, `type`, `attrs`를 필수로 가집니다. `content`와 `text`는
각각 선택 사항입니다. 공통 shape는 두 필드가 함께 존재하는 JSON도 표현할 수 있지만,
알려진 type에는 §6의 type별 invariant가 실제 허용 조합을 제한합니다. unknown
type에는 이 조합 제한을 추측해서 적용하지 않습니다.

누락된 `content`와 빈 `content`, 누락된 `text`와 빈 `text`, 누락된 mark attrs와
빈 mark attrs는 각각 같은 semantic 의미로 봅니다. 구현은 읽을 때 빈 immutable
collection으로 정규화할 수 있습니다. 이 차이는 의미 있는 정보로 보지 않습니다.

## 6. block, text, mark와 attrs

### Block type

block type은 Java enum으로 닫지 않고 검증된 문자열로 둡니다. 알려진 18개 type은
계약 metadata와 설명에 명시하고 type별 semantic invariant를 강하게 검증합니다.
유효한 미래 type도 받아서 그대로 왕복시킵니다. unknown block에는 공통 구조와
안전성 invariant만 적용하며, 모른다는 이유로 내용을 제거하거나 paragraph로
downgrade하지 않습니다.

알려진 type은 현재 Editor와 Markdown adapter가 실제로 만드는 두 표현을 함께
수용합니다. 예를 들어 list item과 blockquote는 직접 `text`를 가진 기존 표현과
paragraph를 중첩한 Tiptap 정규화 표현을 모두 허용합니다.

| 알려진 type | type별 invariant |
| --- | --- |
| `paragraph`, `heading1`~`heading3` | 중첩 `content`는 비어 있어야 하고 `text`를 사용합니다. |
| `code` | 중첩 `content`는 비어 있어야 합니다. `language`가 있으면 string 또는 null이어야 합니다. |
| `bulletList`, `orderedList`, `taskList` | 직접 `text`는 비어 있어야 하고 자식은 `listItem`이어야 합니다. |
| `listItem` | 직접 `text` 또는 중첩 `content`를 사용할 수 있지만 둘 다 non-empty일 수 없습니다. `checked`가 있으면 boolean이어야 합니다. |
| `blockquote`, `callout` | 직접 `text` 또는 중첩 `content`를 사용할 수 있지만 둘 다 non-empty일 수 없습니다. `icon`이 있으면 string이어야 합니다. |
| `horizontalRule` | `text`와 `content`가 모두 비어 있어야 합니다. |
| `image` | `text`와 `content`가 비어 있어야 합니다. non-empty string `mediaId`가 필요하며 `alt`가 있으면 string이어야 합니다. |
| `file` | `text`와 `content`가 비어 있어야 합니다. non-empty string `mediaId`와 string `name`이 필요합니다. |
| `table` | 직접 `text`는 비어 있어야 하고 자식은 `tableRow`여야 합니다. |
| `tableRow` | 직접 `text`는 비어 있어야 하고 자식은 `tableCell`이어야 합니다. |
| `tableCell` | 직접 `text` 또는 중첩 `content`를 사용할 수 있지만 둘 다 non-empty일 수 없습니다. |
| `evidence` | 중첩 `content`는 비어 있어야 합니다. non-empty string `source`가 필요하고 `text`를 사용할 수 있습니다. |

모든 알려진 type에서 `sourceMarkdown`이 있으면 string이어야 합니다. 표에 없는 추가
attrs도 JSON 안전성 제한 안에서 허용하고 그대로 보존합니다. type별 invariant는
OpenAPI의 조건부 schema 또는 application/domain validator로 강제합니다. 표현력이
부족한 OpenAPI 도구 때문에 invariant를 생략하지 않습니다.

### Block attrs

`attrs`는 필수 JSON object이며 값은 string, finite number, boolean, null, array,
object 중 하나입니다. 다음은 현재 producer가 쓰는 대표 attrs입니다.

| block | 현재 확인된 attrs |
| --- | --- |
| `code` | `language`, `sourceMarkdown` |
| `listItem` | `checked` |
| `image` | `mediaId`, `alt`, `sourceMarkdown` |
| `file` | `name`, `mediaId`, `sourceMarkdown` |
| `evidence` | `source`, `sourceMarkdown` |
| list/table/blockquote | `sourceMarkdown` |
| `callout` | 명령 테스트에서 `icon` 사용 |

현재 Editor schema 자체는 type별 attrs를 닫아 검증하지 않습니다. 이것은 현재
Editor validator가 느슨한 것이며 canonical Domain도 느슨해야 한다는 뜻이 아닙니다.
구현 단계에서는 Editor parser와 OpenAPI/Spring validator가 위 known-type invariant를
같이 적용하도록 맞춥니다. 추가 attrs는 닫지 않고 반드시 보존합니다.

### Text와 mark

TextSpan은 `text`를 필수로 하고 `marks`를 선택 사항으로 둡니다. 빈 문자열을
허용합니다. 빈 paragraph는 `text: []`로 표현할 수 있으며 `[{"text":""}]`도
유효합니다.

mark type은 현재 Editor가 실제로 검증하는 다섯 값으로 닫습니다.

- `bold`, `italic`, `strike`, `code`, `link`

mark attrs는 선택 JSON object입니다. link의 `href`를 포함한 attrs는 이름을
바꾸거나 버리지 않고 그대로 왕복시킵니다. `link` mark에는 non-empty string
`href`가 필요합니다. 다른 mark도 추가 attrs를 가질 수 있습니다. mark는 span당
최대 20개입니다.

## 7. validation과 invariant

canonical 계약은 다음을 보장합니다.

| 규칙 | 강제 위치 | 이유 |
| --- | --- | --- |
| root `schemaVersion = 1` | JSON Schema와 Domain | 의미 버전 식별 |
| root `type = doc` | JSON Schema와 Domain | 문서 root 식별 |
| root content 0개 이상 | JSON Schema | Editor의 정상 빈 문서 보존 |
| block ID UUID | JSON Schema와 Domain | 안정 block identity |
| block ID 문서 전체 유일 | Domain/application validator | JSON Schema `uniqueItems`로 ID 기준 중복을 표현할 수 없음 |
| block type 패턴 | JSON Schema와 Domain | 미래 type을 안전하게 식별 |
| known block의 type별 구조와 알려진 attrs type | 조건부 JSON Schema와 Domain | 잘못된 semantic shape 차단 |
| unknown block의 구조·attrs 보존 | Domain과 모든 mapper | future block lossless 왕복 |
| block attrs는 제한된 JSON object | JSON Schema와 Domain | 저장소·언어 간 안전한 왕복 |
| 최대 깊이 32 | Domain/application validator | 재귀 처리 한계 |
| 전체 block 최대 20,000 | Domain/application validator | 문서 처리 한계 |
| attrs JSON 깊이 최대 16 | Domain/application validator | open-ended JSON 재귀 제한 |
| block attrs 최대 64 KiB | Domain/application validator | block 하나의 metadata 폭주 방지 |
| mark attrs 최대 8 KiB | Domain/application validator | inline metadata 폭주 방지 |
| canonical document 최대 4 MiB | API/application/domain boundary | 전체 payload 상한 |
| TextSpan text 0~200,000자 | JSON Schema와 Domain | 기존 계약 범위 유지 |
| span당 mark 최대 20개 | JSON Schema와 Domain | 의미 없는 mark 중첩과 payload 폭주 방지 |
| mark type 다섯 값 | JSON Schema와 Domain | 현재 semantic mark 집합 |

최대 block 깊이는 root의 첫 block을 1로 셉니다. 전체 block 수에는 모든 중첩
block을 포함합니다. block type은 `^[a-z][a-zA-Z0-9_.-]{0,63}$`로 제한합니다.
깊이 32와 전체 20,000개는 현재 Editor에서 출발한 값이지만 Tiptap 구현 규칙으로
채택한 것이 아닙니다. 모든 API·Domain·snapshot reader가 같은 재귀·처리량 상한을
갖게 하는 portable safety invariant로 승격합니다.

attrs와 mark attrs의 JSON 깊이는 attrs object를 1로 셉니다. 크기는 JSON을 파싱한
뒤 불필요한 공백 없이 UTF-8 JSON으로 다시 직렬화한 byte 수로 계산합니다. block
attrs는 각각 65,536 byte, mark attrs는 각각 8,192 byte를 넘을 수 없습니다. key와
string value도 이 한도에 포함되며 JSON number는 finite value만 허용합니다.

canonical document 전체는 같은 방식의 compact UTF-8 JSON으로 4,194,304 byte를
넘을 수 없습니다. 4 MiB는 Career 본문과 metadata에 충분한 여유를 주면서 MongoDB의
16 MiB document 한도보다 충분히 낮게 유지하는 공통 안전선입니다. 현재 WebSocket
update의 1 MiB 제한에서 가져온 값이 아니며, collaboration transport가 더 낮은
한도를 갖는다면 그 차이는 별도의 전송/분할 정책으로 다룹니다.

문서 전체 규칙과 global ID 유일성은 OpenAPI vendor extension으로 도구에 알리되,
extension 자체가 runtime validation을 수행한다고 표현하지 않습니다.

TextSpan 최대 길이는 200,000자로 통일합니다. Repository 조사에서 50,000자를 넘는
실제 저장 데이터는 확인하지 않았습니다. 이 선택은 확인되지 않은 데이터를
보호하기 위한 것이 아니라, 기존 OpenAPI와 Spring이 이미 허용하는 200,000자 계약
범위를 근거 없이 축소하지 않기 위한 것입니다. 현재 Editor의 50,000자 제한은
Editor 구현상 validation constraint이며 canonical semantic invariant가 아닙니다.
구현 단계에서 Editor validator를 200,000자로 맞춥니다.

기본 생성 정책과 유효성은 구분합니다. canonical 문서에는 `content: []`를
허용합니다. 다만 POST로 새 CareerRecord를 만들 때는 지금처럼 stable UUID를 가진
빈 paragraph 하나를 생성합니다. 빈 root를 허용한다고 POST 초기값을 바꾸지 않습니다.

### Canonical invariant와 Editor constraint 구분

| 구분 | 예 | 소유자 |
| --- | --- | --- |
| canonical semantic invariant | root v1/doc, stable UUID, known type별 구조, mark 의미, unknown block 보존 | OpenAPI와 Career Domain |
| canonical safety invariant | block 깊이·전체 수, attrs 깊이·크기, TextSpan·전체 문서 크기 | OpenAPI와 Career Domain/application boundary |
| 생성 정책 | POST가 빈 paragraph 하나로 시작 | Career create use case |
| Editor/Tiptap constraint | Tiptap node shape, compatibility atom, 현재 50,000자 parser 제한 | Editor adapter |
| Collaboration constraint | Yjs update, WebSocket 1 MiB frame, documentVersion | Collaboration subsystem |

Spring Domain은 첫 두 줄과 생성 정책만 압니다. Tiptap node 이름, Yjs update 크기나
WebSocket session을 Domain validation 근거로 사용하지 않습니다.

## 8. schemaVersion 전략

`schemaVersion`은 **1을 유지합니다**.

실제 CareerDocument가 이미 rich tree를 `schemaVersion: 1`로 저장하고 있고,
기존 Spring paragraph-only blockBody는 그 rich tree의 정상적인 부분집합입니다.
이번 변경은 v1 문서 의미를 다른 형태로 바꾸는 것이 아니라 OpenAPI와 Spring이
너무 좁게 구현한 허용 범위를 실제 v1에 맞추는 일입니다.

새 version 2를 만들면 동일한 현재 Editor 문서를 v1과 v2 사이에서 불필요하게
변환해야 하고 snapshot의 schemaVersion과 blockBody의 schemaVersion도 갈립니다.
앞으로 필드의 의미를 바꾸거나 기존 v1 독자가 안전하게 무시할 수 없는 변경이 생길
때만 version을 올립니다. OpenAPI 문서 자체의 release version은 이 semantic
schemaVersion과 별도로 올릴 수 있습니다.

Mongo의 `editorSchemaVersion: 1`과 collaboration snapshot의 `schemaVersion: 1`도
이번 의미 모델에서는 그대로 유지합니다.

## 9. 기존 paragraph-only 데이터 호환

현재 데이터는 다음 이유로 새 schema의 부분집합입니다.

- paragraph는 허용 block type입니다.
- 빈 attrs는 열린 JSON attrs의 유효한 값입니다.
- 기존 `text: []`는 계속 유효합니다.
- 기존 TextSpan의 최대 200,000자를 유지합니다.
- 기존 root는 paragraph가 최소 1개지만 새 root는 0개 이상이므로 모두 포함됩니다.

따라서 기존 CareerRecord를 backfill하거나 schemaVersion을 바꿀 필요가 없습니다.
새 reader를 먼저 배포한 뒤 rich writer를 활성화하는 순서만 지킵니다. 구버전 Spring
reader는 rich block을 읽을 수 없으므로 rollout 중 rich write를 먼저 열면 안 됩니다.

## 10. OpenAPI 표현 방향

OpenAPI 3.1에서 다음 schema를 둡니다.

- `BlockBody`
- 재귀 `$ref`를 사용하는 `CareerBlock`
- `CareerTextSpan`
- `CareerTextMark`

`CareerBlock.type`은 문자열 패턴으로 검증하고 알려진 type 목록은
`x-expresso-knownBlockTypes` 같은 language-neutral metadata와 description에
기록합니다. enum만 사용해 미래 type을 거절하지 않습니다.

`CareerBlock` 공통 schema 위에 known type별 `if`/`then` 조건을 `allOf`로
추가합니다. type이 알려진 값이면 해당 content/text 관계와 알려진 attrs type을
검증합니다. type이 알려지지 않은 값이면 어떤 `then`도 선택되지 않으므로 공통
schema와 안전성 invariant만 적용됩니다. unknown block용 fallback 변환 schema를
따로 두지 않습니다.

`attrs`와 mark attrs는 `type: object`, `additionalProperties: true`로 표현합니다.
block 자체와 TextSpan, mark에는 `additionalProperties: false`를 유지해 구조 필드의
오타는 막습니다.

문서 전체 invariant는 다음 metadata로 명시합니다.

```yaml
x-expresso-invariants:
  globallyUniqueBlockIds: true
  maxDepth: 32
  maxTotalBlocks: 20000
  maxAttrsDepth: 16
  maxBlockAttrsUtf8Bytes: 65536
  maxMarkAttrsUtf8Bytes: 8192
  maxDocumentUtf8Bytes: 4194304
```

root와 각 nested `content`에는 `maxItems: 20000`을 둘 수 있지만 이것만으로 문서
전체 block 수를 보장한다고 설명하지 않습니다. global validator가 실제로
20,000 제한을 적용합니다.

## 11. Spring Domain 표현 방향

권장 모델은 block type별 inheritance가 아닌 공통 semantic tree입니다.

```java
record BlockBody(List<SemanticBlock> content)

record SemanticBlock(
    String id,
    String type,
    Map<String, Object> attrs,
    List<SemanticBlock> content,
    List<TextSpan> text
)

record TextSpan(String text, List<TextMark> marks)

record TextMark(String type, Map<String, Object> attrs)
```

Domain constructor는 collection과 attrs의 중첩 JSON 값을 방어 복사합니다.
`Map.copyOf`는 null JSON 값을 받을 수 없으므로 그대로 쓰지 않습니다. 작은 내부
helper가 Map과 List를 재귀 복사하고 JSON이 아닌 Java 객체를 거절합니다. Jackson
`JsonNode`를 Domain 필드에 두지는 않습니다.

`BlockBody`의 document-wide validator가 ID 유일성, block·attrs 깊이, 전체 block
수와 크기 제한을 한 번의 순회로 검사합니다. known block의 type별 invariant는
같은 Domain validator의 작은 규칙표가 검사합니다. 이를 inheritance로 흩뜨리지
않습니다. unknown block에는 공통 검사만 적용하고 type, attrs, content와 text를
손실 없이 보존합니다.

기존 `BlockBody.empty(paragraphId)`의 외부 동작은 유지합니다. 내부에서는
`paragraph` type, 빈 attrs, 빈 content와 text를 가진 SemanticBlock을 만듭니다.

## 12. Mongo persistence 방향

`career_records.blockBody`에는 OpenAPI와 같은 rich JSON tree를 저장합니다.
별도 collection이나 binary format은 만들지 않습니다.

현재 migration 0009의 validator는 paragraph-only이므로 기존 migration 파일을
고치지 않고 후속 forward-only migration에서 Mongo JSON Schema로 표현할 수 있는
구조 검증만 확장합니다.

- 재귀 CareerBlock shape 허용
- attrs와 mark attrs의 JSON object 허용
- nested content와 marks 허용
- root 빈 content와 빈 TextSpan 허용
- TextSpan 최대 200,000자 유지
- known type별 content/text/attrs invariant 적용
- unknown type과 추가 attrs 보존
- Mongo JSON Schema로 표현 가능한 배열·문자열 제한 적용

global ID 유일성, 전체 block 수, attrs 깊이·byte 크기와 전체 document byte 크기는
Mongo validator만으로 완전하게 표현하지 않습니다. Spring Domain/application과
Editor parser가 같은 계약값으로 검증하고, Mongo writer는 검증된 Domain 값만
받습니다.

canonical field를 새로 required로 만들거나 legacy `properties`, `bodyMd`를 제거하지
않습니다. backfill도 하지 않습니다.

`career_document_snapshots.content`는 이미 generic JSON을 허용하고 실제
CareerDocument 전체를 저장하므로 shape 변경이 필요하지 않습니다. snapshot의 Yjs
state vector와 update ledger도 그대로 유지합니다.

Spring writer와 projector는 재귀 tree를 명시적으로 mapping합니다. Mongo Document와
Domain 객체를 합치지 않습니다. malformed canonical data에 대한 기존 projection
실패 정책도 유지합니다.

## 13. Editor와 BlockBody mapping 방향

Editor `CareerDocument`와 OpenAPI `BlockBody`는 같은 semantic JSON shape를 사용합니다.
따라서 정상 경로의 mapping은 변환 알고리즘이 아니라 양쪽 계약 validation입니다.

```text
CareerDocument --validate/copy--> OpenAPI BlockBody
OpenAPI BlockBody --validate/copy--> CareerDocument
```

heading을 paragraph로 내리거나, 목록을 평문으로 합치거나, attrs와 marks를 제거하는
projection은 두지 않습니다. unknown block도 공통 안전성 검사를 통과하면 `id`,
`type`, `attrs`, `content`, `text`를 그대로 보존합니다. Spring과 Editor 어느 쪽도
unknown이라는 이유로 block을 paragraph로 바꾸지 않습니다.

TypeScript와 Java 구현이 다시 갈리지 않도록 같은 fixture corpus를 다음 세 곳에서
검증합니다.

- OpenAPI JSON Schema contract test
- `packages/editor` CareerDocument parser test
- Spring Domain/Mongo/API round-trip test

fixture에는 paragraph-only, rich nested list/table, mark와 link attrs, 의미 있는
block attrs, empty root, empty paragraph, unknown block을 포함합니다. known block의
잘못된 child type과 attrs type은 거절하고, 동일한 shape를 unknown type으로 보냈을
때는 공통 안전성 범위에서 보존하는 대비 fixture도 둡니다.

## 14. Yjs와의 책임 경계

Yjs encode/decode 함수의 입력과 출력은 계속 semantic CareerDocument입니다. Yjs
binary update, state vector, `documentVersion`은 collaboration 저장소에만 남습니다.

CareerRecord.blockBody에 언제 snapshot을 반영할지는 이번 schema 설계와 별도의
delivery/consistency 결정입니다. rich schema를 도입한다고 WebSocket ack마다 Spring
PATCH를 호출하거나 두 version을 합치지 않습니다.

현재 compaction은 snapshot과 pending update를 합쳐 완전한 CareerDocument를 만들 수
있습니다. 이후 동기화 설계가 필요할 때 이 경계를 후보로 사용할 수 있지만, 이번
계약 변경에는 그 동작을 포함하지 않습니다.

## 15. 고려한 대안과 추천 근거

### 후보 A — block type별 Java sealed hierarchy

paragraph, heading, list, image, table마다 별도 class를 만들고 sealed interface로
묶는 방식입니다.

장점은 type별 attrs와 content 규칙을 컴파일 시점에 강하게 표현할 수 있다는
점입니다. 반면 OpenAPI는 큰 `oneOf`/discriminator가 필요하고, nested type 수만큼
Java 코드와 mapper가 늘어납니다. unknown block을 lossless하게 보존하려면 결국
generic fallback class가 필요합니다. 새 block마다 Editor, OpenAPI, Java hierarchy와
mapper를 동시에 배포해야 하므로 현재의 future block 정책과 맞지 않습니다.

### 후보 B — 완전한 generic JSON document

`blockBody` 전체를 `Map<String, Object>` 또는 BSON Document로 Domain에 그대로 두는
방식입니다.

구현량과 future type 추가 비용은 가장 작고 lossless 왕복도 쉽습니다. 그러나 root
상수, UUID, ID 유일성, 깊이, text와 mark 규칙까지 Domain이 알지 못하게 됩니다.
오타와 malformed data가 persistence 깊숙이 들어가며 Java 코드의 의도가 약합니다.

### 후보 C — 공통 semantic block + 중앙 validator

권장안입니다. `BlockBody`, `SemanticBlock`, `TextSpan`, `TextMark`라는 작은 명시적
타입만 두고 block type과 attrs는 열린 값으로 보존합니다. 중앙 validator가 문서
전체 규칙과 known type별 invariant를 검사하고 unknown type에는 공통 안전성 규칙만
적용합니다.

이 방식은 sealed hierarchy보다 읽고 고칠 코드가 적고, raw JSON보다 Domain invariant가
강합니다. OpenAPI의 재귀 schema와 거의 1:1이라 mapper도 단순합니다. unknown block을
보존하면서 알려진 semantic block도 같은 구조로 다룰 수 있어 현재 Editor와 가장
잘 맞습니다.

| 기준 | 후보 A | 후보 B | 후보 C |
| --- | --- | --- | --- |
| Java 가독성 | type별로 명확하지만 파일 수가 많음 | 약함 | 작은 모델로 명확함 |
| OpenAPI 표현 | 큰 `oneOf` 필요 | 너무 느슨함 | 재귀 schema 하나 |
| future block | 어려움 | 쉬움 | 쉬움 |
| validation 강도 | 가장 강함 | 가장 약함 | 구조·문서 규칙을 강제 |
| Editor lossless | fallback 필요 | 가능 | 가능 |
| 유지보수 비용 | 높음 | 낮지만 오류 위험 | 중간 |

## 16. 이후 구현 단계

구현은 다음 checkpoint로 나눕니다. 각 단계는 테스트 우선으로 진행합니다.

1. OpenAPI contract test에 rich/unknown/empty/중첩 fixture, known type별 실패
   fixture와 크기 경계 metadata assertion을 추가하고 RED를 확인한 뒤 BlockBody
   schema를 확장합니다.
2. `packages/editor` validator의 TextSpan 상한을 200,000자로 맞추고 같은 fixture를
   양방향 검증합니다. Yjs encode/reconstruct round-trip도 확인합니다.
3. Spring Domain을 공통 semantic tree로 바꾸고 immutable deep copy, known type별
   invariant, unknown lossless 보존과 문서 안전성 제한 unit test를 추가합니다.
4. 후속 Mongo migration에서 `career_records.blockBody` validator만 확장하고 기존
   paragraph-only document와 rich document를 MongoDB 8에서 함께 검증합니다.
5. Spring writer/projector를 재귀 mapping으로 바꾸고 paragraph-only, rich, unknown,
   malformed document 단위 테스트를 추가합니다.
6. POST 기본 빈 paragraph, GET rich round-trip, PATCH rich update와 no-op/version/ETag
   회귀 테스트를 통과시킵니다.
7. Yjs snapshot을 blockBody에 전달하는 시점, 인증, 재시도와 version 충돌은 별도
   consistency 설계로 진행합니다.

이번 설계에는 endpoint 추가, Yjs 동기화, `documentVersion` 통합, legacy backfill과
목록 API를 포함하지 않습니다.
