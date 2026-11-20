---
title: 앱 전반의 화면 바뀜 모션
slug: app-motion
stage: plan
status: accepted
date: 2026-11-20
---

# 앱 전반의 화면 바뀜 모션 — 계획

## 순서와 파일

1. **고치기 전 측정** — 스크래치패드 `transition-probe/survey.mjs`로 운영 빌드의 이동을 녹화한다(이미 `survey-5`). 새 장면(새 대화 · 관심 없음 · 보기 바꾸기 · 승인 · 온보딩)은 녹화를 더한다.
2. **R1 · R2 공용** — `components/motion/Reveal.tsx`(새), `components/shell/AppShell.tsx`(`AppBody pending`), 셸을 쓰는 `loading.tsx`들, `components/shell/Skeleton.tsx`, `styles/global.css`(`reveal-*` · `ex-anim-skeleton` · `ex-anim-appear`). **관문**: 공고 상세 · 구직 목표의 내용 시각이 survey-5(99ms · 58ms)보다 늦지 않고 막대 프레임이 없어야 3 이후로 간다.
3. **R1 셸 밖** — `app/(app)/edit/[portfolioId]/loading.tsx` · `page.tsx`, `app/(app)/home/page.tsx`(제안 · 위젯 Suspense).
4. **R3 · R4** — `features/agent-chat/useAgentConversation.ts` · `AgentChat.tsx` · `AgentChat.module.css` · `agent-handoff.ts`, `app/(app)/home/page.tsx` · `HomeStart.tsx`, `styles/global.css`.
5. **R5** — `app/(app)/home/ProposalFeed.tsx`, `styles/global.css`(`proposal-move`).
6. **R6** — `features/career-editor/views/CareerViewShell.tsx`.
7. **R7** — `app/(app)/library/page.tsx`(지면 칸 Suspense) · `PreviewFrame.tsx`(새) · `PortfolioGrid.tsx` · `portfolio-grid.module.css`.
8. **R8** — `components/motion/Swap.tsx` · `Swap.module.css`(새), 승인 카드(`AgentChat.tsx`의 기록 변경 제안 · `RecordDraftCard` · `PlanDraftCard` · `ReplanDraftCard` · `JobGoalDraftCard` · `PageEditCard` 중 상태 문구가 있는 곳).
9. **R9** — `app/(auth)/onboarding/OnboardingShell.tsx`, `styles/global.css`(`onboarding-step`).
10. **테스트** — `useAgentConversation.test.tsx`(첫 렌더의 `id`), `Swap` 단위 테스트(처음엔 `data-changed` 없음 · 바뀌면 있음), `tokens.test.ts`가 새 값에 걸리면 맞춘다.

## 검증

- `pnpm --filter @expresso/web typecheck` · `test`.
- 운영 빌드(`next build` → `next start`)와 로컬 API로 Playwright 녹화. `startViewTransition`을 감싸 타입 · 그룹을 기록하고, `ready`에서 애니메이션을 멈춰 0~400ms 프레임을 찍는다.
  - 탐색 · 분석 · 기록 · 홈 위젯: 스켈레톤과 내용이 겹친 프레임.
  - 공고 상세 · 구직 목표: 막대가 보이는 프레임이 없음.
  - 지난 대화 열기 · 대화 바꾸기: 시작 화면 프레임이 없음.
  - 새 대화 · 관심 없음 · 보기 바꾸기 · 승인 · 온보딩: 중간 프레임.
  - #251 홈 → 대화: 입력창 짝과 말풍선이 그대로.
  - 움직임 줄이기 · 모바일 폭.
- 고치기 전 · 후를 나란히 놓은 실시간 · 4배 느린 mp4를 보낸다.

## 위험

- `AppBody`에 이름이 붙으면 #251 전환에서 홈 전체가 한 장으로 찍혀 입력창 짝이 깨질 수 있다. `default="none"`이면 React가 이름을 붙이지 않는지 프레임으로 확인한다.
- 공고 목록처럼 그림이 보이는 자리는 React가 전환 전에 그림을 최대 500ms 기다린다. 탐색의 내용 시각도 전후로 잰다.
- 요구사항마다 커밋을 나눠 하나씩 되돌릴 수 있게 한다.
