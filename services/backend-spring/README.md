# Career business scaffold

Java 21과 Gradle Wrapper를 사용합니다.

```powershell
.\gradlew.bat test
.\gradlew.bat assemble build
```

현재 구성은 Career business domain, BSON 매핑, response DTO와 Spring bootstrap만
포함합니다. HTTP 서버·Controller·인증·Mongo client·repository는 활성화하지 않습니다.
테스트에도 MongoDB나 Redis가 필요하지 않습니다.

Mongo writer는 title, propertyValues, status, version, updatedAt의 `$set` 매핑만
만듭니다. 실제 DB 쓰기와 신규 record 저장은 후속 작업에서 연결합니다.
기존 물리 문서를 이 매핑으로 교체하지 않습니다.

business updatedAt은 BSON의 밀리초 정밀도로 정규화합니다. number는 Decimal128
왕복에서 일반 십진 표기와 소수 자릿수가 보존되는 값만 허용합니다.

Java DTO 테스트와 contracts 테스트는
`packages/contracts/openapi/fixtures/career-business-v1.json`을 함께 검증합니다.
