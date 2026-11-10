---
title: 사이드바 크레딧 카드 사용량 섹션 연결
slug: credit-card-usage-link
stage: spec
status: accepted
intent: .intent/intent_credit-card-usage-link.md
date: 2026-11-10
---

# 사이드바 크레딧 카드 사용량 섹션 연결 — 명세

## 요구사항

- [ ] `Sidebar`의 쿼터 카드가 `href="/account#usage"`인 링크 하나다.
- [ ] 링크 안의 `role="meter"` 게이지와 숫자는 그대로 남는다.
- [ ] 마우스를 올리면 카드 테두리가 `--ex-border-firm`으로 바뀐다. 새 색 값은 만들지 않는다.
- [ ] 키보드 포커스는 전역 `:focus-visible`(`--ex-focus-ring`)로 보인다.
- [ ] 데스크톱에서 사이드바를 접으면 카드가 `visibility: hidden`이 되어 Tab 순서에서 빠진다.

## 설계

- 재사용: 설정 화면은 이미 `section#usage`와 `HashScroll`을 갖고 있다. 해시 주소로 들어오면
  본문이 스트리밍된 뒤에도 구획을 맨 위로 맞춘다. `/account#notifications` · `/account#ai-consent`
  링크가 같은 방식을 쓴다.
- 바뀜: `services/web/src/components/shell/Sidebar.tsx`에서 쿼터 카드 `div`를 `next/link`의 `Link`로
  바꾼다. `title="사용량 보기"`를 붙인다.
- 바뀜: `Sidebar.module.css`의 `.quotaCard`에 `display: block`, `color: inherit`,
  `text-decoration: none`, 테두리 색 전환을 더하고 `:hover`에 테두리 색을 둔다. `.copy`의
  `transition`을 덮지 않도록 전환 목록에 `opacity`·`transform`을 함께 적는다.
- 바뀜: 접힘 미디어 쿼리에 `[data-sidebar-collapsed="true"] .quotaCard { visibility: hidden; }`을
  넣고, `.quotaCard` 전환 목록에 `visibility var(--ex-motion-quick)`을 둔다. visibility 전환은 보이는
  쪽을 끝까지 유지하므로 접히는 동안은 보이고 끝나면 숨는다. 새 시간 값은 만들지 않는다.

## 버린 대안

- 배경을 `--ex-bg-tint`로 바꾸는 hover: 게이지 트랙(`--ex-track` #edf1f7)과 거의 같은 색이라 트랙이 사라진다.
- `SidebarFrame`의 접힘 상태로 `tabIndex`를 넘기기: `Sidebar`는 서버 컴포넌트라 상태를 받으려면
  클라이언트 경계를 새로 만들어야 한다. 이미 쓰는 `data-sidebar-collapsed` 속성 선택자로 충분하다.

## 함정

- `.copy`와 `.quotaCard`는 같은 요소에 붙는다. `.quotaCard`에 `transition`을 따로 쓰면 뒤에 오는 규칙이
  `.copy`의 opacity 전환을 지운다.
- 링크 안의 블록 요소: `Link`가 `a`를 그리므로 `display: block`이 없으면 카드 폭과 여백이 깨진다.

## 완료 기준

- `pnpm --filter @expresso/web typecheck` · `pnpm --filter @expresso/web test` 통과.
- 실제 화면에서 카드를 누르면 `/account#usage`로 가고 사용량 구획이 맨 위에 선다.
