# Career business writer preparation

Java 21과 Gradle Wrapper를 사용합니다.

```powershell
.\gradlew.bat test
.\gradlew.bat assemble build
```

기본 bootstrap은 HTTP 서버·Mongo client·writer를 활성화하지 않습니다. B1 command는
명시적으로 `career.writer.enabled=true`와 `spring.main.web-application-type=servlet`을
설정할 때만 사용할 수 있습니다. 이때 `career.writer.mongo-uri`, `career.writer.database`,
`career.writer.move-secret`(UTF-8 32 bytes 이상)이 필요합니다. 서비스가 schema를 만들거나
migration을 실행하지 않습니다. DB 소유의 forward migration 0025–0030을 먼저 적용해야 합니다.
카테고리는 기본 7종을 포함해 모두 사용자 소유이며 userId와 propertySchemaV2만 읽습니다.
V2가 없는 카테고리는 BUSINESS_SCHEMA_NOT_PREPARED로 거절합니다. 기본 카테고리도
동일한 mutation fence를 적용하고 개별 definition의 system 제한은 유지합니다.

Create/grouped/duplicate business create, PATCH, trash/restore, move preview/commit,
relation PUT이 opaque Bearer session으로 인증됩니다. 모든 쓰기는 owner·version CAS,
session/user/reference guard와 Mongo transaction을 사용합니다. Create replay와 computation
outbox도 같은 transaction에 포함됩니다. 기존 물리 문서를 교체하지 않습니다.

세션은 Fastify와 같은 idle·absolute 만료를 적용합니다. 관리자의 대신 로그인은 활성
더미 사용자만 principal로 사용하며, transaction 안에서 세션 주인과 실제 사용자의
권한·삭제 상태를 다시 검증합니다. 이전 세션의 fallback은 유지 30일·생성 후 90일입니다.

Property PATCH는 `propertyValues: { set: [...], unsetPropertyIds: [...] }` delta입니다.
set 값만 upsert하고 명시한 unset ID만 제거합니다. 생략한 canonical 값과 순서는 유지하며
legacy properties를 merge source로 사용하지 않습니다. 저장값에 없는 ID의 unset은 no-op이고,
set/unset 중복·교집합은 400입니다. 빈 delta와 동일 값은 version·outbox를 바꾸지 않습니다.
Property delta outbox의 changedPropertyIds에는 실제로 바뀌거나 제거된 ID만 넣습니다.

신규 record의 `origin="manual"`, `properties={}`, `bodyMd=""`는 현재 Mongo validator의
storage 최소값입니다. aggregate·입력·응답에는 본문이 없고, 이후 command는 이 필드를
갱신하지 않습니다. Duplicate의 최신 문서 복제는 후속 document owner 작업입니다.

별도 명세는 `packages/contracts/src/career-writer-openapi.ts`입니다. 기존 제품 OpenAPI와
Fastify/Web routing은 연결하지 않습니다. `spring-command-facade.ts`는 B2가 등록할
transport helper이며 Spring 실패를 직접 Mongo 쓰기로 우회하지 않습니다.

단위 테스트는 DB 없이 실행됩니다. 실제 Mongo integration을 실행하려면 transaction을
지원하는 disposable replica set URI를 `B1_TEST_MONGO_URL`에 지정합니다. 먼저 루트에서
contracts/database를 빌드합니다. `B1_TEST_NODE`는 필요한 경우 Node 실행 파일을 지정합니다.
테스트가 생성·삭제하는 DB 이름은 `expresso_test_b1_java_...`입니다. Redis는 필요 없습니다.

business updatedAt은 BSON의 밀리초 정밀도로 정규화합니다. number는 Decimal128
왕복에서 일반 십진 표기와 소수 자릿수가 보존되는 값만 허용합니다.

Java DTO 테스트와 contracts 테스트는
`packages/contracts/openapi/fixtures/career-business-v1.json`과
`career-writer-v1.json`을 함께 검증합니다.
