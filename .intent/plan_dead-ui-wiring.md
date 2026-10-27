---
title: 동작하지 않는 화면 요소 정리
slug: dead-ui-wiring
stage: plan
status: accepted
intent: .intent/intent_dead-ui-wiring.md
spec: .intent/spec_dead-ui-wiring.md
date: 2026-10-27
---

# 동작하지 않는 화면 요소 정리 — 구현 계획

PR 다섯 개. 1번은 이 브랜치(`feat/dead-ui-wiring`)에서 intent · spec · plan과 함께 연다. 2번(공고) · 3번(홈 · 온보딩)은 1번과 파일이 겹치지 않아 각자 워크트리를 가진 세션으로 나눠 제안한다. 4번은 1번과 `Editor.tsx`를 함께 쓰고 5번은 `lib/sample`을 지우므로 1–3번 뒤에 이 세션에서 한다. 새 브랜치는 이 plan 커밋에서 따고, 시작할 때 main을 받는다. 웹 경로는 `services/web/src/`, 백엔드는 `services/backend/src/` 기준.

## 바뀌는 파일

| PR | 파일 | 무엇을 |
|---|---|---|
| 1 셸 · 검색 · 알림 | `packages/database` `documents/analytics.ts` · `mongodb-migrations/0020` · `schema.test.ts` | `NotificationDoc.subject`, `deadline_reminders` enum · 정의 upsert |
| | `packages/contracts` 알림 계약 | `subject`, 읽음 응답 |
| | `modules/engagement` service · routes | `subject` 저장, `POST /notifications/:id/read` · `/notifications/read-all` |
| | `modules/scheduling` service · public | `deadline_reminders` 실행 |
| | `worker/processors/generation.ts` · `worker/main.ts` | 생성 완료 알림 |
| | `components/CommandPalette.tsx` · 새 `palette-actions.ts` | 검색 · 알림 실데이터, 장식 제거 |
| | `components/shell/Sidebar*.tsx` · `SidebarNav.tsx` · `WizardShell.tsx`, `edit/[portfolioId]/Editor.tsx` 레일 | 링크 · 팔레트 열기 · 장식 제거 · 레일 활성 계산 |
| 2 공고 | `app/(app)/jobs/page.tsx` · `page.module.css` · `ConditionChip.tsx` · `JobFilter.tsx` · 새 `jobs-actions.ts` · `browse-copy.ts` · `AddCondition.tsx` · `SortMenu.tsx` · `SaveSearchButton.tsx` · `RecentSearches.tsx` · `use-popover.ts`, `lib/api/endpoints.ts`, 계약 `job-market.ts`(저장한 검색 응답), `lib/sample/jobs.ts` 삭제 | 조건 · 칩 · 정렬 · 검색 저장 · 지우기 · 진입 버튼, 샘플 제거 |
| 3 홈 · 온보딩 | `home/page.tsx` · `HomeChrome.tsx`, `onboarding/first-portfolio` · `materials` · 단계 정의, `SocialSignIn.tsx`, 브루 제목(계약 `UpdateBrewSchema` · brew 서비스 · `WizardShell`) | 진입 연결, 온보딩 실데이터, 이력서 단계 · GitHub 제거, 제목 변경 |
| 4 편집 · 배포 | `edit/[portfolioId]/Editor.tsx` · `EditorPanels.tsx` · `page.tsx` · `edit-actions.ts` · 새 미리보기 라우트, `deploy/DeployPanel.tsx` · `deploy/page.tsx`, `brew/[brewId]/materials/page.tsx`, `modules/portfolio-editing/service.ts`(묻고 나서), 내보내기 경로 | 보기 상태 · 되돌리기 · HTML · 미리보기 · 가져오기 · 이력, actor 기록, 내보내기 · 도메인 · 장식 제거 |
| 5 설정 | `account/page.tsx` · `AccountNav.tsx` · `loading.tsx` · 새 `account-actions.ts` · 내보내기 라우트, PRO 잠금 표시(`MaterialPicker` · `Dashboard`), `lib/sample` 삭제 | 사용량 · 내보내기 · 삭제 · 알림 설정, 요금제 · 결제 제거 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. PR 1 백엔드: 계약 · 문서 → engagement 라우트 → scheduling · 생성 알림 → 통합 테스트(`engagement.integration.test.ts`, scheduling 테스트). `pnpm test:infra` 통과로 확인.
2. PR 1 웹: 팔레트 · 사이드바 · 레일. dev01로 생성 1회 → 알림 패널 확인.
3. PR 2–5 순서대로. 각 PR 시작 전에 `sync_with_base_branch`로 main을 받고, 열린 PR 목록과 분류표 「보류」를 다시 대조한다.
4. PR 4의 `portfolio-editing/service.ts` 수정은 사용자에게 묻고 진행한다. 거절되면 이력 필터 행을 제거 대상으로 올려 다시 묻는다.
5. 마지막 PR에서 `lib/sample` 디렉터리를 지우고 판정 스캔을 다시 돌린다.

## 가장 위험한 단계

- 마이그레이션 번호 충돌. DB `schema_migrations`의 최대 번호와 열린 브랜치의 `mongodb-migrations/` 폴더를 함께 보고 고른다. 충돌하면 번호만 바꾼 커밋으로 되돌린다.
- 온보딩 단계에서 `materials`를 빼면 단계 번호 · 진행 표시 · 이어하기(`resume-step.ts`)가 함께 바뀐다. 단계 정의 한 곳에서 빼고 테스트로 확인한다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
node <scratchpad>/dead-buttons.cjs services/web/src
grep -rn "lib/sample" services/web/src
```

화면: `DEV_LOGIN`으로 dev01 로그인 → ⌘K 검색 · 알림 패널, 사이드바 ＋ · 포트폴리오 행 → `/jobs` 조건 · 저장 · 지우기 → `/home` 만들기 · 이어서 답하기 → `/edit/{id}` 모바일 · 확대 · 되돌리기 · 미리보기 → `/account` 사용량 · 내보내기 · 알림 설정.
