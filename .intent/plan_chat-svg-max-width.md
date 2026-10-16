---
title: 채팅 영역 svg 전역 max-width 해제
slug: chat-svg-max-width
stage: plan
status: accepted
intent: .intent/intent_chat-svg-max-width.md
spec: .intent/spec_chat-svg-max-width.md
date: 2026-10-17
---

# 채팅 영역 svg 전역 max-width 해제 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/styles/agent-chat-preflight.css` | 고침 — `.acf-scope svg { max-width: none; }`와 이유 주석 |
| `services/web/e2e/agent-chat-svg.spec.ts` | 새로 — 대화 시드 후 액션바 아이콘 16×16 · `max-width: none` 확인 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 회귀 테스트를 쓰고 수정 전 코드에서 돌린다 — 아이콘 14×16으로 실패해야 한다.
2. preflight에 규칙을 추가한다 — 같은 테스트가 통과한다.
3. dev 서버(3150, API는 job-chat-rail의 4021)에서 svg-survey · global-survey를 돌린다 — 바뀐 것이
   액션바 아이콘뿐인지 확인한다.
4. `next build` 후 `next start`(3151)로 같은 측정을 반복한다.
5. typecheck · 웹 테스트를 돌리고, 커밋 · 푸시 · `main` 기준 PR을 연다.

## 가장 위험한 단계

4단계 프로덕션 빌드다. `NEXT_DIST_DIR`을 따로 지정해 dev의 `.next`와 섞이지 않게 한다. 빌드가
실패하면 `main`에서 같은 빌드를 돌려 이 변경 때문인지 비교한다. 코드 수정은 CSS 규칙 하나라
`git revert`로 되돌린다.

## 검증

```
pnpm --filter @expresso/web exec playwright test e2e/agent-chat-svg.spec.ts
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
node svg-survey.mjs http://localhost:3150 1400 /agent?chat=<id> ...
node global-survey.mjs http://localhost:3151 1400 / /home /jobs ...
```

확인할 화면: `/agent?chat=<id>`에서 어시스턴트 메시지 아래 "복사" · "더 보기" 아이콘.
