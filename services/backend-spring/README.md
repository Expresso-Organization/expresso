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
migration을 실행하지 않습니다. DB 소유의 forward migration 0014를 먼저 적용해야 합니다.
0014는 canonical 값 validator와 idempotency collection/index만 준비합니다. Category의
기존 legacy/V2 schema는 바꾸지 않습니다. V2가 없는 category는 0006과 기존 제품이
부여한 property ID와 현재 legacy definition을 읽고 category version으로 guard합니다.

Create/grouped/duplicate business create, PATCH, trash/restore, move preview/commit,
relation PUT이 opaque Bearer session으로 인증됩니다. 모든 쓰기는 owner·version CAS,
session/user/reference guard와 Mongo transaction을 사용합니다. Create replay와 computation
outbox도 같은 transaction에 포함됩니다. 기존 물리 문서를 교체하지 않습니다.

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
