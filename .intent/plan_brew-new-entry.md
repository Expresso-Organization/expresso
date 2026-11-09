---
title: 새 포트폴리오 첫 화면 공고 우선 재구성
slug: brew-new-entry
stage: plan
status: draft
intent: .intent/intent_brew-new-entry.md
spec: .intent/spec_brew-new-entry.md
date: 2026-11-09
---

# 새 포트폴리오 첫 화면 공고 우선 재구성 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/brew/new/page.tsx` | `ModeHome` async화, `EntrySearch` · `JobsPanel` · `OtherRoutes` 추가, `ModeCards` · `QuickStart` · `path` 제거 |
| `services/web/src/app/(app)/brew/new/page.module.css` | 첫 화면 배치와 검색 칸 · 공고 줄 · 갈래 줄 스타일. 한 열 전환은 중단점 표의 767px |
| `services/web/src/app/(app)/brew/new/loading.tsx` | 로딩 뼈대를 카드 넷에서 새 첫 화면(검색 칸 · 공고 줄 · 갈래)으로 |

## 작업 순서

1. `page.tsx` 재구성 — 타입 검사 통과로 확인
2. `page.module.css` 배치 — 브라우저에서 1000px · 375px 확인
3. 워크트리 웹 · API를 별도 포트와 `<이름>.localhost`로 띄워 dev01로 확인
4. 타입 검사 · 테스트 · 커밋 · 푸시 · PR

## 가장 위험한 단계

3단계. 워크트리 개발 서버가 메인과 쿠키를 공유하거나 체험 DB에 관심 공고가 없으면 확인할 상태가 서지 않는다. 그때는 dev01로 관심 공고를 하나 저장해 확인한다. 화면만 바뀌므로 되돌리기는 커밋 되돌림으로 충분하다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

화면: `/brew/new` 첫 화면 → 검색 → 관심 공고 「이 공고로」 → 붙여넣기 · 주소 · 공고 없이 갈래 열기, 375px.
