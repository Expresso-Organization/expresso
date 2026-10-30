# Career 제품 Writer Cutover

## 제품 요청과 소유권

기존 Web BFF와 `/v1/career` 주소를 유지합니다. 실제 API composition은 `CareerService` 대신 `createCareerWriterRuntime`의 facade를 사용합니다. Worker도 같은 owner graph를 사용합니다. 테스트용 legacy service는 제품 composition에 등록하지 않습니다.

| 실제 caller | 최종 writer | 경로 |
| --- | --- | --- |
| CareerViewShell 생성·복제, PropertyList·Table·Board 수정 | Spring | Facade → 사용자 command 또는 product intent → scoped producer command |
| Trash·Restore·Move, 기존 record link와 relation target 교체 | Spring | Facade → 사용자 command, If-Match/CAS |
| Schema preview/apply/restore | Spring record writer, Node schema metadata | PR-C durable job → scoped mutation read/receipt/commit |
| 개인 tags 입력 | Node 개인 option metadata, Spring 값 | 사용자 option UUID 등록 → Spring canonical value |
| AI Proposal Apply | Spring business, Fastify document | frozen proposal intent, owner receipt, durable 재전달 |
| AI Undo | Fastify document | 기존 document 복원. Business-only는 문서 복원 대상이 없습니다. |
| Interview Answer·Cleanup | Spring business, Fastify document, Interview 자체 데이터 | frozen Answer-bound intent, receipt, purge/reference fence를 검증한 finalize |
| Formula·Rollup worker | Derived writer | 계산 필드만 CAS 갱신, canonical 입력과 owner-private option 읽기 |
| Editor update/snapshot/revision | Fastify document | 기존 Yjs 경로. Business version은 변경하지 않습니다. |
| 보존 기간 후 영구 삭제·계정 삭제 | 기존 purge owner | 기존 transaction/referenceVersion guard를 유지합니다. 정상 business 수정 경로가 아닙니다. |

제품 runtime에는 legacy property mutation worker나 legacy AI/Interview business writer를 등록하지 않습니다. Spring 장애 시 직접 CareerRecord 쓰기로 전환하지 않습니다. Profile·category·view·skill metadata의 기존 기능은 별도 metadata API로 유지합니다.

## Canonical 읽기

Record 값은 `propertyValues`에서 읽습니다. BSON Decimal128은 문자열로 전달하여 34자리 정밀도와 trailing zero를 보존합니다. Date precision·timezone·offset과 option/asset ID를 그대로 전달합니다. 과거 `properties`는 저장된 compatibility 데이터이며 canonical 값을 다시 생성하는 출처가 아닙니다.

Materials 날짜·ranking, Recipe, Generation, skill quote와 계정 export도 같은 canonical reader를 사용합니다. Interview 질문 근거와 기존 자유 입력 tags의 Formula/Rollup은 소유자 범위의 정확한 option label을 사용하며 UUID 숫자를 사용자 성과로 해석하지 않습니다. 고정 option ID 기반 수식의 기존 의미는 유지합니다. 현재 본문은 document projection에서 읽으며, 수정되지 않은 오래된 bodyMd로 현재 문서를 덮어쓰지 않습니다. Export는 휴지통 record와 기존 snake_case envelope를 유지합니다.

System Category 정의는 공유하지만 자유 입력 tags 이름은 `career_property_options`의 사용자별 ledger에 저장합니다. Raw label의 대소문자·공백을 정규화하지 않습니다. 등록 재시도는 같은 UUID를 사용하며 공유 schemaVersion을 증가시키지 않습니다. 다른 사용자의 옵션은 자동완성·prompt·preview·worker·export에 합치지 않습니다.

## 부분 성공과 동시 수정

모든 owner가 완료된 요청은 기존 성공 계약과 ETag를 유지합니다. 실제 미완료 owner가 있는 경우에만 202와 operation ID, public 상태, `statusUrl` 및 Location을 반환합니다. 상태 주소는 `GET /v1/career/write-operations/:operationId`이며 사용자 소유권을 검사합니다. Web BFF는 같은 상태를 전달합니다.

Web은 pending record를 성공한 record처럼 삽입하지 않습니다. 재시도는 원래 body·If-Match·idempotency key를 사용합니다. 새 작업이 완료된 뒤에는 다음 요청에 새 key를 사용합니다. 저장한 pending reference에는 body·prompt·사용자 세션 토큰을 넣지 않습니다.

Mongo intent와 owner receipt로 프로세스 재시작, 응답 유실, 중복 delivery를 복구합니다. Worker의 복구 루프는 pending/retry/expired-running 현재 intent만 재전달합니다. Live lease는 delayed 처리하며 stale worker fencing을 완화하지 않습니다. BullMQ 완료 개수와 business commit 개수는 같은 불변식이 아닙니다.

명확한 owner conflict 또는 반복 실패는 recovery-required로 종료하며 202나 성공으로 표시하지 않습니다. 이미 성공한 owner의 receipt를 제거하거나 frozen expected version을 바꾸지 않습니다. Document reservation은 실패 시 안전하게 해제합니다. Business-only Undo는 applied 상태를 유지하고 복원할 본문이 없음을 알립니다. Mixed Undo는 본문만 복원하고 속성 변경 유지 문구를 표시합니다.

## Schema 변경과 Relation

Custom Category mutation lock은 Spring transaction에서 원자적으로 검사합니다. 진행·실패 job의 관련 business write는 안전한 job ID·상태와 409를 반환합니다. 읽기와 Yjs 편집은 계속 허용하며 개인 tags 등록은 이 lock에서 제외합니다. 공유 System Category의 전역 mutation은 허용하지 않아 다른 사용자의 business 요청을 차단하지 않습니다.

Relation 삭제·복원은 11개 scalar value와 분리된 Spring 경로입니다. Edge·inverse edge·tombstone generation·receipt·outbox를 같은 batch transaction으로 처리합니다. Lease/fingerprint/CAS와 양쪽 관련 category lock을 검사합니다. 복원은 최신 사용자 편집·schema·cardinality를 다시 검사하며 과거 edge를 무조건 복원하지 않습니다. Pending relation property는 읽기와 해당 편집에서 구분합니다. Saved view는 변환 전후 record별 source/target 정의로 필터·정렬하며, 미완료 관계를 완성된 빈 값이나 부분 집합으로 분류하지 않습니다. Rollup preview는 관계 대기를 명시적으로 거부하고, worker는 projection을 쓰지 않은 채 완료 시의 durable refresh를 기다립니다. View 재정렬도 active job의 frozen category version을 바꾸지 않도록 transaction에서 검사합니다.

Move의 unmapped 데이터는 승인된 discard 정책을 유지합니다. Mapping한 값과 target의 필수 속성은 다시 검증하며 원본 정밀 값을 JavaScript number로 축소하지 않습니다. Duplicate는 scalar 값뿐 아니라 현재 유효한 relation targets도 initialRelations로 전달합니다.

## 공개 API 호환성 제한

`PATCH /v1/career/categories/:categoryId/property-schema`의 bulk 변경은 변경 전 409 `BULK_SCHEMA_CHANGE_UNSUPPORTED`를 반환합니다. 현재 Web/Worker/AI/Interview caller가 없음을 검색과 facade regression에서 확인했습니다. 별도의 durable bulk adapter는 구현하지 않습니다.

지원하는 API는 `POST /v1/career/categories/:categoryId/property-schema/preview`, `POST /v1/career/categories/:categoryId/property-schema/apply`, `POST /v1/career/categories/:categoryId/property-schema/:propertyId/restore`입니다. 개별 preview/apply를 여러 번 실행하는 것은 과거 bulk PATCH의 다중 변경 원자성과 같지 않습니다. 외부 bulk caller는 이 호환성 제한을 별도로 확인해야 합니다.

## 문서 전달

Yjs 소유권과 Apply/Undo causal history를 유지합니다. Worker가 저장한 update는 API의 작은 durable delivery loop가 소유한 socket session에 전달합니다. 압축된 update도 원장에서 읽어 publication 응답 유실을 복구하며 문서 내용·business 값·secret을 queue 결과에 저장하지 않습니다. 순서대로 stream을 병합한 live 문서와 서버 snapshot을 비교하는 회귀 테스트를 유지합니다.
