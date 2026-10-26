---
title: 개발 현황 스캔 에이전트와 진행 현황 대시보드
slug: status-scan-agent
stage: plan
date: 2026-10-25
---

# 개발 현황 스캔 에이전트 — plan

## 순서

1. `shared/report.ts` — 보고서 · 이력 · 실행 기록 스키마.
2. `scanner/spec.ts` — 설계서 표와 task-spec.js 파싱. 기능 수가 150 · 35 · 24인지 시험으로 확인.
3. `scanner/facts.ts` — PR · 워크플로 · 활동 수집(gh).
4. `scanner/agent.ts` — Claude CLI 호출과 구조화 결과 검사. `scanner/judge.ts` — 도메인 프롬프트 · 근거 경로 검사 · 재시도.
5. `scanner/todos.ts` — 후보 생성과 순위 매기기.
6. `scanner/main.ts` — 다시 볼 도메인 고르기, 잠금, 원자적 쓰기, 이력 · 실행 기록.
7. 로컬에서 실제로 돌린다 — 사실 수집만, 한 도메인 판정, 전체 판정 순.
8. 화면을 보고서에 연결하고 손으로 쓴 칸과 `docs/status/status.json` · `scripts/status/refresh-status.mjs`를 지운다.
9. `infra/server/expresso-status-scan.sh` · systemd 유닛 · nginx 위치 · `docs/operations/ORACLE_HOSTING.md` 절 추가.
10. 서버 적용(사용자 승인 뒤) — 클론 · 설치 · 첫 실행 · 타이머 · nginx 재로드.

## 검증

- `pnpm typecheck` · `pnpm lint` · `pnpm build` 통과, 스캐너 단위 시험(`node --test scanner/*.test.ts`) 통과.
- 로컬 전체 스캔 결과의 판정을 이번 대화의 수작업 조사(2026-10-25)와 비교해 크게 어긋나는 도메인을 확인한다.
- 근거 경로가 전부 실제 파일인지 스캐너가 검사한 수와 버린 수를 실행 기록에 남긴다.
- 대시보드에서 팀원 선택 · 할 일 링크 · 도메인 이력 선 · 바뀐 판정 표시를 브라우저로 확인한다.
- 서버 적용 뒤 `systemctl list-timers`와 `https://dev.expresso.ai.kr/status/data/report.json` 응답을 확인한다.
