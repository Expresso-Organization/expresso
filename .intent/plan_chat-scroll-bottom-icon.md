---
title: 채팅 "최근 메시지로" 버튼 아이콘 표시
slug: chat-scroll-bottom-icon
stage: plan
status: accepted
intent: .intent/intent_chat-scroll-bottom-icon.md
spec: .intent/spec_chat-scroll-bottom-icon.md
date: 2026-10-17
---

# 채팅 "최근 메시지로" 버튼 아이콘 표시 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/assistant-ui/elements/thread.aui.tsx` | 고침 — `ThreadScrollToBottom`의 `p-4` → `size-8`, 머리 NOTE에 사유 한 줄 |
| `services/web/e2e/agent-chat-layout.spec.ts` | 새로 — 버튼 svg 16×16 · 콘텐츠 폭 ≥ 16px 회귀 테스트 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 회귀 테스트를 먼저 쓰고 수정 전 코드에서 실패하는지 본다 — svg 폭 0으로 실패해야 한다.
2. `thread.aui.tsx`를 고친다 — 같은 테스트가 통과한다.
3. 이 워크트리에서 웹 개발 서버를 띄워(API는 job-chat-rail의 4021) 세 화면을 재측정하고
   전후 스크린숏을 남긴다.
4. typecheck · 웹 테스트를 돌린다.
5. 커밋 · 푸시 · PR(`main` 기준).

## 가장 위험한 단계

3단계. 공유 API(4021)와 다른 워크트리 서버를 건드릴 수 있다. 새 서버는 다른 포트(4150대)로만
띄우고 끝나면 내린다. 읽기만 하며 데이터를 쓰지 않는다. 코드 수정은 한 줄이라
`git revert`로 되돌린다.

## 검증

```
pnpm --filter @expresso/web exec playwright test e2e/agent-chat-layout.spec.ts
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
node measure-stb.mjs http://localhost:<port> after   # 세션 scratchpad의 측정 스크립트
```

화면: `/agent`, `/jobs/[jobId]` 채팅 레일, `/career/records/[recordId]` 채팅 패널에서
`.aui-thread-scroll-to-bottom` 안 svg 크기.
