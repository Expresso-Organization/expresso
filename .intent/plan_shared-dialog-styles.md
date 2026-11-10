---
title: 공용 창의 Tailwind 의존 제거
slug: shared-dialog-styles
stage: plan
status: accepted
intent: .intent/intent_shared-dialog-styles.md
spec: .intent/spec_shared-dialog-styles.md
date: 2026-11-10
---

# 공용 창의 Tailwind 의존 제거 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/components/ui/dialog.module.css` | 창 기본 모양 (새 파일) |
| `services/web/src/components/ui/dialog.tsx` | Tailwind 문자열을 모듈 클래스로, 닫기 단추를 `button`으로 (고침) |
| `services/web/src/components/ui/dialog.test.tsx` | 닫기 단추 이름 · 모듈 클래스 · 부르는 쪽 클래스 합치기 (새 파일) |

## 작업 순서

1. 바꾸기 전 화면 기록 — 커리어 휴지통 창 · 에이전트 채팅 동의 창의 계산된 위치 · 크기 · 여백을 브라우저에서 잰다.
2. `dialog.module.css`와 `dialog.tsx` — 타입 검사 통과.
3. `dialog.test.tsx` — 통과.
4. 바꾼 뒤 같은 값을 다시 재고 홈에서 창을 띄워 본다.

## 가장 위험한 단계

2단계. 에이전트 채팅 창의 머리말 · 바닥 줄 여백이 기본 규칙과 부르는 쪽 모듈 사이에서 바뀔 수 있다. 1단계에서 잰 값과 4단계 값을 비교한다. 어긋나면 그 칸만 부르는 쪽 모듈로 옮긴다. 되돌리기는 `dialog.tsx` 한 파일이다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

브라우저: `/career/<분류>` 휴지통 창, 에이전트 채팅 동의 창. Tailwind가 없는 화면은 공용 창을 쓰는 화면이 아직 없으므로(PR #215 머지 전), 커리어 화면에서 Tailwind가 든 스타일시트를 꺼(`CSSStyleSheet.disabled`) 같은 창을 다시 연다.
