# T01 실행 환경 중단 기록

확인일: 2026-08-29 (Asia/Seoul).

## 격리 워커

- 기준 커밋: `2e9f6da691158eaa486aeffd0380bb474c87f4b4`
- 워크트리: `C:/code/expresso-mongodb-workers/run-20260829/T01`
- 브랜치: `codex/mongodb-workersT01`
- 모델·노력: `gpt-5.6-luna`, `xhigh`
- 런타임: MCP 없는 `zero_mcp_exec.py run`, `workspace-write`
- 세션: `01a048eb-78e0-74b3-b9fa-f6c781b933e3`
- 조정자의 워크트리 격리 검증은 통과했습니다.
- 워커의 첫 `worktree_guard.py verify --task-id T01 --current-directory` 명령은 PowerShell 프로세스 생성 단계에서 `CreateProcess: Rejected / blocked by policy`로 거부됐습니다.
- 워커는 지시대로 즉시 중단했습니다. 저장소를 검사하거나 구현 파일을 변경하지 않았습니다. 조정자가 `git status --short`의 빈 출력과 기준 커밋과 같은 HEAD를 재확인했습니다.
- 이전 read-only/workspace-write probe 결과 `MCP_TOOL_COUNT=0`은 MCP 도구 목록만 입증하며 셸 실행이나 파일 쓰기 가능 여부를 입증하지 않습니다.

원본 로컬 로그: `C:/code/expresso-mongodb/var/mongodb-run/T01-implementer.jsonl`.
마지막 응답: `C:/code/expresso-mongodb/var/mongodb-run/T01-implementer-result.txt`.

## Docker

Docker Desktop 로그에 `sailor-ingest.sock` 접근 오류가 있었고 엔진 시작에 실패했습니다. `docker info`는 `dockerDesktopLinuxEngine` 파이프를 찾지 못했습니다. 기존 데이터·볼륨 초기화나 권한 우회는 하지 않았습니다.

## 재개 조건

Windows에서 현재 제한을 유지하며 격리 워커의 셸 실행을 허용하는 환경 구성을 확인해야 합니다. 지원되지 않는다면 작업 방식 변경을 사용자와 먼저 결정합니다. 실제 인프라 기준은 Docker 엔진 복구 후 인증된 replica set과 트랜잭션으로 검증하며, mock이나 건너뛴 테스트로 대체하지 않습니다.
