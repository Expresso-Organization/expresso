# Windows 실행 환경 원인 분석과 복구

확인일: 2026-08-29 (Asia/Seoul). MongoDB 구현 및 운영 변경은 수행하지 않았습니다.

## 확인된 원인

| 구간 | 원인과 증거 | 조치와 상태 |
| --- | --- | --- |
| Docker | 앞선 시작 로그에 `sailor-ingest.sock` 접근 오류가 있었고, 00:07에는 소켓 바인딩 성공 후 CLI의 종료 요청이 기록됐습니다. 마지막 차단 상태는 엔진이 종료된 상태였습니다. 잔류 소켓 오류의 최초 발생 원인은 확정하지 않았습니다. | 완전히 종료된 상태에서 Docker Desktop를 재실행했습니다. 엔진 `29.7.2`, 기존 MySQL·Redis 컨테이너 `healthy`를 확인했습니다. 볼륨·설정·파일을 초기화하지 않았습니다. |
| 워커 실행 정책 | `zero_mcp_exec.py`가 사용자 설정을 제외하면서 `windows.sandbox`까지 누락했습니다. 실제 CLI 설정 해석에서 요청한 `workspace-write`가 `read-only`로 바뀌었습니다. | Windows에서 `windows.sandbox="elevated"`를 명시했습니다. 같은 입력에 설정 하나만 추가하면 `workspace-write`가 유지되는 것을 재현했고, 실제 PowerShell 실행도 통과했습니다. |
| Python 실행 | 사용자 Python에는 SYSTEM·관리자·사용자 권한만 있어 별도 샌드박스 사용자가 실행할 수 없었습니다. | ACL을 바꾸지 않고, 이미 `CodexSandboxUsers` 읽기·실행 권한이 있는 Codex 내장 Python을 선택했습니다. 실제 probe 실행과 파일 쓰기가 통과했습니다. |
| 파이프라인 스킬 읽기 | 설치된 스킬 루트의 ACL은 OWNER RIGHTS·SYSTEM·관리자만 허용했습니다. 처음 실패한 guard를 재실행하자 해당 스킬 파일 열기가 `Permission denied`로 거부됐습니다. | 사용자 승인 후 이 스킬 폴더에만 `CodexSandboxUsers` 읽기·실행 권한을 추가했습니다. 하위 69개 항목을 검사했고, 쓰기·삭제·권한 변경 권한은 추가하지 않았습니다. 실제 워커의 스킬 파일 읽기가 통과했습니다. |
| Git 저장소 신뢰 | guard가 실행된 뒤 `git rev-parse --show-toplevel`에서 저장소 소유자 `parkm`과 실행 사용자 `CodexSandboxOffline`이 달라 `detected dubious ownership`으로 거부됐습니다. | Git 신뢰 예외는 이번 스킬 폴더 권한 승인에 포함되지 않아 변경하지 않았습니다. 전역 설정이나 `safe.directory=*`는 추가하지 않았습니다. |

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
- 최초 guard smoke: 스킬 파일 읽기 권한에서 중단.
- ACL 승인 후 guard smoke: 스킬 파일 읽기는 통과했으며 Git 소유권 검사에서 중단. 뒤의 Node·pnpm·Git 상태 검사는 아직 실행하지 않았습니다.

로컬 원본 증거는 `C:/code/expresso-mongodb/var/mongodb-run/`의 `config-missing.json`, `config-explicit.json`, `probe-v2-*-bundled-proof.json`, `recovery-smoke.jsonl`입니다. probe 통과는 guard나 제품 통합 테스트 통과를 대신하지 않습니다.

## 남은 조건

조정자 `C:/code/expresso-mongodb`와 워커 `C:/code/expresso-mongodb-workers/run-20260829/T01`만 해당 워커 실행 중 Git 신뢰 대상으로 인정할지 사용자 확인이 필요합니다. 그전까지 T01은 blocked이고 파이프라인은 paused입니다. MongoDB replica set 및 트랜잭션 검증은 T01 구현 후 별도로 수행합니다.

## 승인된 ACL 변경 기록

- 대상: `C:/Users/parkm/.codex/skills/parallel-implementation-pipeline`만 변경했습니다. 파일 소유자는 그대로입니다.
- 기존 ACL 백업: `C:/Users/parkm/.codex/skill-backups/parallel-implementation-pipeline/20260829-acl-read-execute/acl-before.json`.
- 일반 `Set-Acl`은 필요한 범위보다 넓은 보안 정보 쓰기에서 `SeSecurityPrivilege` 오류가 났고 ACL이 변경되지 않은 것을 확인했습니다. 소유자·감사 설정을 제외한 DACL만 저장하는 .NET API로 승인된 규칙을 추가했습니다.
- 상위 `.codex`, `skills` 폴더와 `auth.json`의 변경 전후 보안 설명자가 같은지 확인했습니다.
- 로컬 검증 자료: `var/mongodb-run/skill-acl-verification.json`, `recovery-acl-smoke.jsonl`.
