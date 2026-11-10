---
title: 공용 창의 Tailwind 의존 제거
slug: shared-dialog-styles
stage: spec
status: accepted
intent: .intent/intent_shared-dialog-styles.md
date: 2026-11-10
---

# 공용 창의 Tailwind 의존 제거 — 명세

## 요구사항

- [ ] `DialogOverlay` · `DialogContent` · `DialogHeader` · `DialogFooter` · `DialogTitle` · `DialogDescription`의 기본 모양이 `components/ui/dialog.module.css`에서 온다. Tailwind 클래스 문자열을 쓰지 않는다.
- [ ] 기본 규칙의 특정도는 요소 하나(0,0,1)다. 부르는 쪽의 클래스(CSS Modules · Tailwind 유틸리티, 모두 0,1,0)가 불러온 순서와 상관없이 이긴다. 에이전트 채팅 preflight(`:where(.acf-scope) *`, 0,0,0)보다는 기본 규칙이 이긴다.
- [ ] 색 · 글자 크기는 `--ex-*` 토큰만 쓴다. 지금 에이전트 채팅 테마가 Tailwind 색에 이어 둔 토큰과 같은 값이다(`popover`=`--ex-bg`, `popover-foreground`=`--ex-fg`, `muted`=`--ex-bg-tint`, `muted-foreground`=`--ex-fg-muted`, `border`=`--ex-border`).
- [ ] `DialogContent`의 닫기 단추는 `Button` 없이 그리고 `aria-label="닫기"`를 단다. "Close" 글자를 없앤다.
- [ ] 열고 닫을 때 100ms 흐려짐 · 확대(95%)는 base-ui의 `data-starting-style` · `data-ending-style` 전환으로 옮긴다. 움직임 줄이기 설정에서는 전환하지 않는다.
- [ ] `data-slot` 속성은 그대로 둔다(`AgentChat.module.css`가 `[data-slot="dialog-title"]`를 읽는다).

## 설계

- 재사용: base-ui `Dialog` 원시 요소, `cn()`(부르는 쪽 클래스 합치기), 기존 `data-slot`, `--ex-*` 토큰.
- 새로 만듦: `components/ui/dialog.module.css`. 선택자는 `div:where(.content)`처럼 요소에 `:where()`를 붙인다. 설명(`DialogDescription`)은 `render={<div />}`로 `div`가 되기도 하므로 `:is(p, div):where(.description)`으로 쓴다.
- Tailwind 값 옮기기: 위치 `fixed` · 50% · `translate(-50%,-50%)`, `z-index: 50`, 너비 `100%` · 최대 `calc(100% - 2rem)` · 480px(`--ex-bp-sm`) 이상 `24rem`. Tailwind `sm`(640px)은 앱 중단점 표(`tokens.test.ts`)에 없어 가장 가까운 앱 중단점을 쓴다, 모서리 12px, 안쪽 여백 16px, 간격 16px, 테두리 대신 1px 고리(`--ex-fg` 10%), 배경 덮개 `--ex-fg` 10% · 블러 4px, 바닥 줄 `--ex-bg-tint` 50% · 위 테두리 `--ex-border`, 제목 `--ex-text-lg` · 500 · 줄 높이 1, 설명 `--ex-text-sm` · `--ex-fg-muted`.

## 버린 대안

- 기본 규칙을 `@layer`에 넣기: 에이전트 채팅 preflight가 레이어 밖이라 창 안 머리말 · 바닥 줄의 여백 · 테두리를 지운다.
- 클래스 특정도(0,1,0)로 쓰기: 부르는 쪽 CSS Modules와 같아져 CSS가 실린 순서에 따라 승패가 바뀐다. `cn()`의 tailwind-merge도 모듈 클래스 충돌은 거르지 못한다.
- 앱 전체에 Tailwind를 싣기: 앱 UI(CSS Modules)의 리셋과 섞인다(`portfolio-utilities.css` 머리말 참고).

## 함정

- 첨부 미리보기(`attachment.aui.tsx`)는 `p-2` · `sm:max-w-3xl` · `[&>button]:…`로 덮어쓴다. Tailwind 유틸리티(0,1,0 이상)가 기본 규칙(0,0,1)을 이기므로 그대로 먹는다. 닫기 단추가 `button`인 것도 그대로다.
- `DialogFooter`의 `showCloseButton`은 여전히 `Button`을 쓴다. 지금 쓰는 곳이 없다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck` · `test` 통과.
- 브라우저: 홈에서 공용 창을 띄운 화면, 커리어 휴지통 창, 에이전트 채팅 동의 창을 확인하고 위치 · 크기 · 배경을 계산된 스타일로 비교한다.
