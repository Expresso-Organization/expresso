# MongoDB 구현 기준선

- 기준: `58577bd526e14adfd146182620270ff3b49c2011`
- 조정자: `C:/code/expresso-mongodb`, 브랜치 `codex/mongodb-migration`
- `pnpm install --frozen-lockfile`, `pnpm typecheck`: 통과
- 깨끗한 워크트리의 `pnpm test`: web의 contracts dist 선행 빌드 누락으로 1 suite 실패
- contracts/database 선행 빌드 뒤: 기존 `platform/ai/codex.test.ts` Windows 실행 fixture 4건 실패; backend 220 통과/168 건너뜀, web 124 통과
- Docker Desktop 엔진: 최초 sailor-ingest.sock 접근 오류 및 종료 상태로 차단. 이후 재실행으로 엔진·기존 MySQL/Redis healthy 확인. 실제 MongoDB 통합 검증은 아직 없음
- 기본 런타임 모델: 로컬 설정의 `gpt-5.6-luna`, `xhigh`
- 두 sandbox의 읽기 전용 런타임 점검: `MCP_TOOL_COUNT=0` 확인. workspace-write 점검도 파일을 쓰지 않는 inventory prompt만 사용
- 상세 로그: 조정자 `var/mongodb-run/baseline-*.log`, `probe-*-proof.json`
- 운영 변경·유료 제품 AI 호출은 실행하지 않음
