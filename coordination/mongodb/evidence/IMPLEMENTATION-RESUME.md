# 구현 재개 기준선

2026-08-29. 기준 리비전 `24fe8b6`.

- `pnpm typecheck`: 통과.
- `pnpm test`: 기존 Windows Codex fixture 4건 재현. backend 220 통과 / 168 건너뜀. MongoDB 변경 전 결과입니다.
- `pnpm test:infra`: 기존 POSIX 환경변수 문법이 Windows에서 실패. T01의 Node runner 변경 대상입니다.
- Docker: 기존 MySQL·Redis healthy. 기존 데이터는 초기화하지 않았습니다.
- MongoDB 8.0 이미지 digest: `sha256:02a0cc7939f5ed38f30f9bc714ef5f682d49baf9350c54acf302ce833087fe8a`. 실제 pull 결과입니다.
- 공통 v3 런처의 두 sandbox 검증을 재사용하고, T01 작업별 probe는 별도로 실행합니다. Git과 설치·인프라 관리는 조정자가 맡습니다.
- 계획의 T01 의존성 추가는 조정자가 먼저 수행하고 별도 커밋합니다. 이후 깨끗한 worker worktree를 그 커밋에서 만들며 T01 완료로 표시하지 않습니다.

원본 로그: `var/mongodb-run/resume-baseline-*.log`, `T01-dependencies.log`.

## 실제 인프라 기준선

- 임의 이름의 MySQL DB를 생성하고 15개 마이그레이션을 적용한 뒤 통합 테스트를 실행했습니다.
- 33개 파일 통과 / 2개 건너뜀, 153개 테스트 통과 / 5개 건너뜀입니다.
- 실행이 끝나면 이번 실행이 생성한 DB만 삭제했습니다. 기존 MySQL 데이터와 Redis를 초기화하지 않았습니다.
- 원본 로그: `var/mongodb-run/resume-baseline-isolated-infra.log`.
- `@expresso/database`의 실제 MySQL 스키마 테스트도 별도 임시 DB에서 16건 통과했습니다. 원본 로그는 `resume-baseline-schema.log`입니다.
- `SQL-SCHEMA-INVENTORY.json`은 최종 마이그레이션을 적용한 임시 DB에서 추출한 74개 제품 테이블의 DDL과 52개 트리거입니다. 운영 데이터를 포함하지 않습니다.

## 재시도 기록 회귀 수정

- `next_actions.py`가 실패한 action의 재시도를 제안하지만 `task_state.py`가 `failed → issued`를 거부하는 불일치를 재현했습니다.
- 동일 action의 `failed → issued`만 허용했습니다. 재시도 횟수 증가는 한 번이며 완료 action 재개와 일반 역행은 계속 거부합니다.
- `test_orchestration_v2.py`의 회귀 테스트가 수정 전 실패하고 수정 후 기존 상태 테스트와 함께 6건 통과했습니다.
- 설치된 스킬 공통 도구를 수정했으며 이번 T01의 두 번째 시도도 동일 action ID로 정상 기록했습니다.
- 전체 스킬 스크립트 회귀 테스트 56건도 통과했습니다.
