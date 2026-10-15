---
title: 공고 상세 우측 채팅 사이드바 접기 · 펼치기와 너비 조절
slug: job-chat-rail-resize
stage: plan
status: accepted
intent: .intent/intent_job-chat-rail-resize.md
spec: .intent/spec_job-chat-rail-resize.md
date: 2026-10-16
---

# 공고 채팅 사이드바 접기 · 너비 조절 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/jobs/[jobId]/JobChatRail.tsx` · `.test.tsx` | 레일 껍데기 · 훅 · 테스트 |
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` | `<aside>`를 `JobChatRail`로 |
| `services/web/src/app/(app)/jobs/[jobId]/page.module.css` | 너비 변수 · 접힘 · 핸들 · 띠 |
| `services/web/src/features/agent-chat/AgentChat.tsx` | `onCollapse` · `onRunningChange` |
| `docs/Expresso Screens.dc.html` | 06b 레일 버튼 · 핸들 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. `AgentChat` 속성 두 개
2. `JobChatRail` + 훅 + 테스트, 페이지 · CSS 교체 — `pnpm --filter @expresso/web test`
3. 정의서 06b
4. 화면 확인(1440 · 1000), 미리보기 브랜치에 합치기, PR E(base D)

## 가장 위험한 단계

2의 첫 페인트. 저장값 적용이 늦으면 316px로 그려졌다가 바뀌는 장면이 보인다 — 레이아웃 효과로
적용하고 전환은 다음 프레임부터 켠다.

## 검증

```
pnpm typecheck
pnpm --filter @expresso/web test
```

화면: 경계 끌기 → 새로고침 → 너비 유지, 접기 → 띠 → 펼치기, 접은 채 입력한 글 유지, 1000px 폭.
