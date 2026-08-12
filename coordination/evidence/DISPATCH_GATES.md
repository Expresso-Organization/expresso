# 직렬 실행 게이트

- 실행 방식: coordinator가 현재 checkout에서 직접 수행.
- 서브에이전트: 사용하지 않음.
- worker MCP profile/runtime smoke: 해당 없음.
- 외부 worker worktree/branch: 해당 없음.
- 구조 validator: 직렬 DAG 갱신 후 실행.
- 기존 baseline test: typecheck, 15 tests, build 통과.

## 작업 시작 조건

1. 현재 task의 dependency가 모두 `verified`다.
2. 완료 기준과 증거 요구사항을 확인했다.
3. 수정할 파일의 현재 내용과 사용자 변경 여부를 확인했다.
4. 필요한 PostgreSQL/Redis 등 로컬 의존성이 준비됐다.

각 task는 focused test와 전체 회귀를 통과한 뒤에만 다음 task를 연다.
