---
title: 개발 현황 스캔 에이전트와 진행 현황 대시보드
slug: status-scan-agent
stage: spec
date: 2026-10-25
---

# 개발 현황 스캔 에이전트 — spec

## 요구사항

1. 대상 기능은 `docs/design-doc/02-요구사항-정의.md`의 2.5(T번호) · 2.3(AI-n) · 2.6(ADM-n) 표와 `docs/task-spec.js`(동작 · 규칙)에서 실행 때마다 읽는다. 담당은 표의 개발담당 칸이다.
2. 판정은 도메인 단위로 Claude Code(`claude -p`)가 main 클론을 읽어 매긴다. 도구는 `--tools Read,Grep,Glob`로 제한하고 결과는 `--json-schema`로 받는다. 요청한 기능 id가 빠지거나 남으면 실패로 보고 한 번 다시 묻는다.
3. 근거 경로는 클론에 실제로 있는 파일만 남긴다(줄 번호가 파일 길이를 넘으면 줄 번호를 뗀다).
4. 다시 볼 도메인 고르기:
   - origin/main이 마지막 스캔 커밋과 다를 때만, 바뀐 파일이 도메인 경로 힌트에 걸린 도메인만 다시 판정한다.
   - 마지막 전체 스캔이 7일 지났거나 `--full`이면 전부 다시 본다.
   - 판정은 1시간에 한 번까지만 돈다.
5. 사실 수집(AI 없음)은 매 실행마다 한다. 열린 PR(CI 결과 · 충돌 · 리뷰 · 마지막 갱신 · 변경 규모), main의 워크플로 최근 실행(CI · 운영 배포 · 포털 발행), 주별 머지 PR · 커밋 수가 대상이다.
6. 할 일:
   - 후보를 코드가 만든다. 후보는 세 종류다.
     - 담당 기능의 미완료(판정 근거 포함)
     - 이번 학기 주차에 걸친 일정 항목
     - 그 팀원 계정의 손봐야 할 PR(CI 실패 · 충돌 · 7일 넘게 멈춤 · 리뷰 대기)
   - Claude는 후보 id만 골라 순서와 한 줄 이유를 붙인다. 후보에 없는 id는 버린다.
7. 결과는 출력 폴더에 쓴다.
   - `report.json`: 최신 상태 전부
   - `history.json`: 스캔마다 도메인별 판정 수
   - `runs.json`: 최근 실행 50건
   - 쓰기는 임시 파일 → 이름 바꾸기로 한다. 동시 실행은 잠금 파일로 막는다.
8. 대시보드는 `/status/data/report.json` · `history.json`만 읽는다. 손으로 쓴 판정 · 막힌 자리 · 파일럿 · 마일스톤 · 일정 차트 칸은 없앤다.

## 설계

- **위치**: `services/dev-portal/status/`(독립 pnpm 루트) 안에 둔다.
  - `shared/report.ts` — zod 스키마. 스캐너와 화면이 같이 쓴다.
  - `scanner/*.ts` — Node 24가 타입을 지우고 바로 실행한다(`erasableSyntaxOnly`). 빌드 단계가 없다.
- **설정**: `scanner/config.json`에 둔다.
  - 학기 2주차 시작일
  - 제안서 일정 항목(주차 · 담당)
  - 팀원 이름 ↔ GitHub 계정(답을 받으면 채운다)
  - 도메인별 경로 힌트(예: D1 → `services/backend/src/modules/career`, `services/web/src/features/career-editor` …)
  - 판정 모델 · 예산 상한
- **에이전트 호출**: 백엔드 `platform/ai/claude-code.ts`와 같은 방식이다.
  - 프롬프트는 stdin으로 넘긴다
  - `--output-format stream-json --verbose`, `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`
  - `--no-session-persistence`, `--max-budget-usd`
  - cwd는 클론이고, 결과는 마지막 `result` 봉투의 `structured_output`을 쓴다
- **사실 수집**: `gh api` · `gh pr list --json`을 쓴다(서버의 gh는 로그인되어 있다). 로컬에서는 개발자의 gh를 쓴다.
- **서버**:
  - `infra/server/expresso-status-scan.sh`
    - 클론 `~/expresso-status-scan`을 origin/main으로 맞춘다
    - 잠금 파일이 바뀌었으면 `pnpm install --frozen-lockfile`
    - `node scanner/main.ts --repo … --out /var/lib/expresso-status`
  - `infra/systemd/expresso-status-scan.{service,timer}` — 15분 간격
  - `infra/nginx/dev.expresso.ai.kr.conf` — `location /status/data/ { alias /var/lib/expresso-status/; }`
- **화면**: 이전 판에서 손으로 쓴 칸은 지우고, 사이드바 · 지표 카드 · 데이터 표 틀은 그대로 둔다.
  - 머리: 마지막 스캔 시각 · 대상 커밋 · 실패 표시
  - 지표: 완료율과 7일 전 대비 변화, 동작 경로 비율, 이번 주 머지 PR, 손봐야 할 PR 수
  - 팀원 할 일 목록(사이드바에서 고름)
  - 도메인 진척(완료율 막대 + 이력 선)
  - 전체 판정 추이
  - 주별 활동
  - PR · CI · 배포 상태
  - 기능 표: 최근 스캔에서 바뀐 판정 표시, 행을 누르면 근거
- **로컬 개발**: `pnpm scan -- --out ../../../docs/status/data`. `docs/status/data/`는 커밋하지 않는다(.gitignore). 개발 서버 미들웨어가 `/status/data/*`를 거기서 읽는다.

## 열린 질문

- 팀원 ↔ GitHub 계정 짝 — 사용자 답 대기. 비어 있으면 PR 기반 할 일만 빠지고 나머지는 돈다.
- 서버 sudo 적용 여부 — 사용자 답 대기. 코드와 설정 파일은 그 답과 관계없이 저장소에 준비한다.
