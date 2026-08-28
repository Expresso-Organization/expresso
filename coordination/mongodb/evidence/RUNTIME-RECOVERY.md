# Windows 실행 환경 원인 분석과 복구

확인일: 2026-08-29 (Asia/Seoul). MongoDB 구현 및 운영 변경은 수행하지 않았습니다.

## 확인된 원인

| 구간 | 원인과 증거 | 조치와 상태 |
| --- | --- | --- |
| Docker | 앞선 시작 로그에 `sailor-ingest.sock` 접근 오류가 있었고, 00:07에는 소켓 바인딩 성공 후 CLI의 종료 요청이 기록됐습니다. 마지막 차단 상태는 엔진이 종료된 상태였습니다. 잔류 소켓 오류의 최초 발생 원인은 확정하지 않았습니다. | 완전히 종료된 상태에서 Docker Desktop를 재실행했습니다. 엔진 `29.7.2`, 기존 MySQL·Redis 컨테이너 `healthy`를 확인했습니다. 볼륨·설정·파일을 초기화하지 않았습니다. |
| 워커 실행 정책 | `zero_mcp_exec.py`가 사용자 설정을 제외하면서 `windows.sandbox`까지 누락했습니다. 실제 CLI 설정 해석에서 요청한 `workspace-write`가 `read-only`로 바뀌었습니다. | Windows에서 `windows.sandbox="elevated"`를 명시했습니다. 같은 입력에 설정 하나만 추가하면 `workspace-write`가 유지되는 것을 재현했고, 실제 PowerShell 실행도 통과했습니다. |
| Python 실행 | 사용자 Python에는 SYSTEM·관리자·사용자 권한만 있어 별도 샌드박스 사용자가 실행할 수 없었습니다. | ACL을 바꾸지 않고, 이미 `CodexSandboxUsers` 읽기·실행 권한이 있는 Codex 내장 Python을 선택했습니다. 실제 probe 실행과 파일 쓰기가 통과했습니다. |
| 파이프라인 스킬 읽기 | 설치된 스킬 루트의 ACL은 OWNER RIGHTS·SYSTEM·관리자만 허용합니다. 처음 실패한 guard를 재실행하자 해당 스킬 파일 열기가 `Permission denied`로 거부됐습니다. | 이 스킬 폴더에만 샌드박스 사용자의 읽기·실행 권한을 추가하는 사용자 확인을 요청했습니다. 아직 권한은 변경하지 않았습니다. |

Windows 설정의 의미는 [공식 문서](https://learn.chatgpt.com/docs/windows/windows-sandbox)를 확인했습니다. `elevated`는 제한된 별도 사용자로 실행하는 샌드박스이며, 전체 접근을 허용하는 옵션이 아닙니다. 다른 샌드박스 모드로 우회하지 않았습니다.

## 실행기 수정

수정 위치는 저장소 밖의 설치된 스킬입니다.

- `C:/Users/parkm/.codex/skills/parallel-implementation-pipeline/scripts/zero_mcp_exec.py`
- `C:/Users/parkm/.codex/skills/parallel-implementation-pipeline/scripts/test_zero_mcp_exec.py`
- `C:/Users/parkm/.codex/skills/parallel-implementation-pipeline/SKILL.md`

v2 probe는 MCP 목록뿐 아니라 실제 명령 완료 이벤트와 임시 파일 내용을 검사합니다. 셸을 실행하지 않은 결과와 이전 v1 증명은 거부합니다. 임시 파일 두 개는 검증 후 정리합니다. 원본 백업은 `C:/Users/parkm/.codex/skill-backups/parallel-implementation-pipeline/20260829-runtime-fix`에 있습니다.

사용한 Python은 `C:/Users/parkm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`입니다. 워커 guard에도 이 절대 경로를 사용해야 합니다.

## 검증 결과

- 실제 CLI의 sandbox 해석 회귀 테스트: 수정 전 실패 → 수정 후 통과.
- inventory-only probe 거부 테스트: 수정 전 실패 → 수정 후 통과.
- 전체 unittest: 35개 통과.
- 별도 worktree guard·agent profile 회귀 검사: 통과.
- skill quick validation: 통과. PyYAML은 저장소의 무시되는 `var/mongodb-run/validation-deps`에만 설치했습니다.
- 실제 읽기 전용 probe: MCP 0개, 셸 실행 성공.
- 실제 workspace-write probe: MCP 0개, 셸 실행 및 워크트리 파일 쓰기 성공.
- 실제 guard smoke: 스킬 파일 읽기 권한에서 중단. 뒤의 Node·pnpm·Git 검사는 아직 실행하지 않았습니다.

로컬 원본 증거는 `C:/code/expresso-mongodb/var/mongodb-run/`의 `config-missing.json`, `config-explicit.json`, `probe-v2-*-bundled-proof.json`, `recovery-smoke.jsonl`입니다. probe 통과는 guard나 제품 통합 테스트 통과를 대신하지 않습니다.

## 남은 조건

스킬 폴더의 제한된 읽기·실행 권한 변경을 승인받은 뒤, 같은 guard 및 도구 체인 검사를 재실행합니다. 그전까지 T01은 blocked이고 파이프라인은 paused입니다. MongoDB replica set 및 트랜잭션 검증은 T01 구현 후 별도로 수행합니다.
