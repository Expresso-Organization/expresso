---
title: 채팅 영역 svg 전역 max-width 해제
slug: chat-svg-max-width
stage: spec
status: accepted
intent: .intent/intent_chat-svg-max-width.md
date: 2026-10-17
---

# 채팅 영역 svg 전역 max-width 해제 — 명세

## 요구사항

- [ ] `.acf-scope` 안 모든 svg의 계산된 `max-width`가 `none`이다.
- [ ] 어시스턴트 메시지 액션바 "복사" · "더 보기" 아이콘이 16×16이다(현재 14×16).
- [ ] `next dev`와 `next build && next start`에서 결과가 같다.
- [ ] intent의 측정 범위에서 채팅 밖 svg와 채팅 안 다른 svg의 크기는 바뀌지 않는다.
- [ ] e2e 회귀 테스트가 시드한 대화에서 액션바 아이콘 16×16과 `max-width: none`을 확인한다.

## 설계

- `services/web/src/styles/agent-chat-preflight.css`의 replaced elements 절 바로 뒤에
  `.acf-scope svg { max-width: none; }`를 추가한다. 이 파일은 Tailwind preflight를 `.acf-scope`
  범위로 옮긴 사본이다. 원본 Tailwind v4는 `img, video`에만 `max-width: 100%`를 준다. 이 규칙은
  전역 규칙이 원본 동작을 덮어쓰지 못하게 막는다. 주석에 이유를 적는다.
- 명시도는 (0,1,1)로, 전역 `svg`(0,0,1)보다 높다. 그래서 CSS를 불러오는 순서와 관계없이 이긴다.
  CSS Modules의 단일 클래스 규칙(0,1,0)보다도 높지만, 채팅 안에서 svg에 `max-width`를 주는 모듈
  규칙은 없다. 채팅 유틸리티(`@layer utilities`)는 원래 레이어 밖 규칙에 지므로 이 규칙으로 새로
  막히는 유틸리티는 없다.
- 회귀 테스트는 `services/web/e2e/agent-chat-svg.spec.ts`에 새로 둔다. e2e 서버에는 AI 런타임이
  없어 메시지 전송이 503을 낸다. 그래서 API(`POST /v1/agent/conversations`)로 대화를 만들고,
  `global-teardown.mjs`처럼 `pnpm --filter @expresso/backend exec tsx -e`로 그 문서에
  사용자 · 어시스턴트 메시지와 `run.status: "complete"`를 넣는다. 그다음 `/agent?chat=<id>`를 열어 잰다.

## 버린 대안

- 전역 `global.css`에서 `svg` 제거: 채팅 밖 15개 화면에서는 바뀐 것이 없었다. 하지만 분석 대시보드 ·
  공개 포트폴리오 · 디자인 카탈로그는 데이터가 없어 확인하지 못했다.
- `:where(.acf-scope) svg`: 전역 규칙과 명시도가 같아 CSS를 불러오는 순서에 결과가 좌우된다.
- 버튼마다 `size-7` 지정: 일곱 곳을 따로 고쳐야 하고, 원인인 전역 규칙의 영향은 그대로 남는다.

## 함정

- `next dev`와 프로덕션 빌드는 CSS 청크 순서가 다를 수 있다. 명시도로 해결했지만 프로덕션 빌드에서 한 번 잰다.
- 이 PR은 `main` 기준이라 PR #89(최근 메시지로 버튼)가 들어 있지 않다. `main`에서는 이 규칙만으로도
  그 버튼의 svg가 0에서 16px로 돌아온다. 버튼 상자 크기는 PR #89가 바로잡는다. 두 PR이 고치는 파일은 겹치지 않는다.
- 시드 스크립트는 e2e 전용 DB 이름(`expresso_career_editor_e2e_<pid>`)인지 확인한 뒤에만 쓴다.

## 완료 기준

```
pnpm --filter @expresso/web exec playwright test e2e/agent-chat-svg.spec.ts   # 수정 전 실패, 수정 후 통과
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

dev 서버와 `next build && next start`에서 svg-survey · global-survey를 다시 돌린다. 바뀐 svg는
액션바 아이콘(14→16)뿐이어야 한다.
