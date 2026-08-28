# Expresso local infrastructure

Docker Compose는 로컬에 이미 실행 중인 MySQL/Redis와 충돌하지 않도록 기본적으로 MySQL `53306`, Redis `56379` 포트를 사용합니다.

```bash
pnpm infra:up
pnpm infra:ready
DATABASE_URL=mysql://expresso:expresso@127.0.0.1:53306/expresso pnpm db:migrate
```

백엔드 실행 시 compose 인프라를 사용하려면 `services/backend/.env`의 URL을 다음과 같이 설정합니다.

```dotenv
DATABASE_URL=mysql://expresso:expresso@127.0.0.1:53306/expresso
REDIS_URL=redis://127.0.0.1:56379
```

`pnpm infra:down`은 컨테이너만 중지하고 volume은 보존합니다. 데이터 volume 삭제는 별도 운영이며 자동화하지 않습니다.

## MongoDB replica set

MongoDB는 기존 MySQL·Redis Compose 프로젝트와 분리된 `expresso-mongodb-local` 프로젝트로
실행하며, 호스트의 `127.0.0.1:57017`에 인증된 `rs0` 단일 멤버를 엽니다.

```bash
docker compose -f infra/compose.mongodb.yaml up -d --wait mongodb
docker compose -f infra/compose.mongodb.yaml run --rm mongodb-init
pnpm test:infra --mongo src/platform/mongodb.integration.test.ts
docker compose -f infra/compose.mongodb.yaml ps --format json
```

`infra/.env.example`의 계정은 로컬 개발 전용 예시입니다. 런타임 계정은
`expressoRuntime` 사용자 정의 역할만 가지며 인덱스 생성, validator 변경·우회,
컬렉션 삭제 권한이 없습니다. MongoDB의 `insert` 권한은 빈 컬렉션 생성도 허용하므로
컬렉션 생성까지 권한으로 차단했다고 가정하지 않습니다([공식 권한 목록](https://www.mongodb.com/docs/manual/reference/privilege-actions/)).
스키마 정의는 여전히 마이그레이션에서만 적용합니다. 마이그레이션 계정은
별도의 `dbOwner` 역할을 사용하므로 애플리케이션 URL에 넣지 않습니다.

keyfile은 저장소에 쓰지 않고 `expresso-mongodb-keyfile` Docker volume에서 생성합니다.
컨테이너 안에서 MongoDB 사용자만 읽도록 POSIX 권한을 설정하므로 Windows NTFS bind mount의
`chmod`에 의존하지 않습니다. 볼륨 이름에는 Compose 프로젝트 이름이 붙으므로
`-p`로 분리한 테스트 환경끼리 데이터와 keyfile을 공유하지 않습니다.

Mongo 통합 테스트의 기본 URI는 이 로컬 인스턴스의 테스트 관리 계정입니다.
테스트는 입력 URI의 DB를 사용하지 않고 `expresso_test_t01_` 뒤에 임의 이름을 붙인
DB를 생성한 뒤 그 DB만 삭제합니다. 런타임 계정은 테스트 관리에 사용하지 않습니다.
외부 테스트 환경에서는 관리 권한이 있는 `TEST_MONGODB_URL`을 명시하세요.
운영 URI는 전달하지 않습니다. `up --wait`는 일회성 초기화 컨테이너의 성공을
보장하지 않으므로 위 `run --rm mongodb-init` 명령의 종료 코드도 확인합니다.
`pnpm infra:mongodb:up`은 두 단계를 순서대로 실행하고 초기화 실패도 보고합니다.

재시작 검사는 기본적으로 건너뜁니다. 테스트 전용 Compose 프로젝트 이름을
`expresso-mongodb-test-...`로 만들고 `TEST_MONGODB_RESTART_CONTAINER`에 그 `mongodb`
컨테이너를 지정해야 실행됩니다(`expresso-mongodb-t01`도 검증용으로 허용).
검사는 loopback 57017 바인딩과 Compose 서비스·프로젝트 표식을 확인한 뒤에만 재시작합니다.

초기화 스크립트는 매 실행 시 `rs.status()`와 replica-set 구성을 확인합니다. 이미 존재하는
`rs0`의 멤버 주소나 구성이 `localhost:57017`과 다르면 기존 설정을 덮어쓰지 않고 실패합니다.
