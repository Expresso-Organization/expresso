---
title: 초안 먼저 전달과 스크린샷으로 지면 다듬기
slug: portfolio-visual-review
stage: spec
status: accepted
intent: .intent/intent_portfolio-visual-review.md
date: 2026-10-25
---

# 초안 먼저 전달과 스크린샷으로 지면 다듬기 — 명세

## 요구사항

- [ ] `StructuredPageGenerator.generate`는 구성 1회(계약 위반 재요청은 유지) → 렌더 → 측정 1회 뒤 초안을 돌려준다. 측정 결함 재요청 루프는 `refine`으로 옮긴다.
- [ ] `PageService.generate`가 구조화 초안을 저장할 때 같은 트랜잭션에서 `refinement: { status: "pending" }`을 두고 outbox `page.refine`(멱등 키 `page-refine:<pageId>`)을 남긴다.
- [ ] 워커 `page.refine` → `PageService.refine`: 초안이 최신 판이 아니면 `superseded`. 아니면 `StructuredPageGenerator.refine`을 돌려 채택이면 새 판을 저장하고(저장 직전 최신 판 재확인) 초안에 `adopted`와 새 판 ID, 아니면 `kept` · `skipped` · `failed`와 이유를 남긴다. AI가 없으면 `skipped`.
- [ ] `refine`: (1) 측정 결함 재요청(최대 2회, 기존 규칙) (2) 스크린샷 검토 — 1440 첫 화면 · 1440 전체 · 390 전체를 보여 `page_review` 계약으로 지적 목록과 새 Spec을 받는다 (3) 새 Spec을 그려 재고 고칠 결함이 늘지 않으면 전후 스크린샷을 무작위 순서 A/B로 보여 승자를 받는다. 새 판이 이기면 채택.
- [ ] `AiCallSpec.images`(base64 PNG · JPEG). Claude Code는 `--input-format stream-json`으로 글과 이미지 블록을 보낸다. 픽스처 키에 이미지 해시가 들어간다. Codex는 `AI_UNAVAILABLE`.
- [ ] 계약: `GeneratedPage.refinement`(선택), manifest `visualReview`(지적 · 비교 결과 · 이유 · 시간 · 채택), AI 계약 `page_review`.
- [ ] 편집 화면: `refinement.status === "pending"`이면 단계 줄과 미리보기 위에 다듬는 중 안내를 보이고 8초마다 새로 읽는다.

## 설계

- 측정기 `measure(html, { screenshots })`: 같은 context에서 1440 첫 화면(PNG) · 1440 전체 · 390 전체(JPEG 품질 70, 높이 7,800px까지)를 함께 돌려준다.
- `refine` 입력은 저장된 초안에서 만든다: 내용 · Spec은 `generationManifest.structured`, 디자인은 `findPortfolioDesign(portfolio)`, 테마는 `styleSpecSnapshot`, 유형은 Spec 루트 `archetype`, 사용자 수정 요청은 초안 `instruction`.
- 프롬프트는 `structuredSpecPrompt`를 재사용하고, 검토 문단(무엇을 보는지 · 구성만 고친다)과 비교 문단을 더한다.
- 새 판은 `editComposition`처럼 이전 판을 복사해 `generationJobId: null`, `revision + 1`로 만든다.

## 버린 대안

- 다듬기를 생성 작업 안에서 끝내기: 사용자가 모델 호출 3–5회를 기다린다.
- 고친 모델이 스스로 채점: 자기 판을 고르는 경향이 있어 따로 비교하고 순서를 섞는다.

## 함정

- 사용자가 다듬기 중에 지면을 고치면 덮지 않는다(최신 판 재확인).
- 긴 전체 페이지 스크린샷은 이미지 한도를 넘는다 — 높이를 자른다.
- outbox 재전달로 같은 다듬기가 두 번 돌면 두 번째는 `pending`이 아니라 바로 끝낸다.

## 완료 기준

- 생성기 · 서비스 · AI 클라이언트 테스트, 실제 Chromium 스크린샷 테스트, `pnpm typecheck` · `pnpm test` · `pnpm test:infra`.
- 체험 서버 실제 생성 1회: 초안 열림 → 다듬는 중 표시 → 결과, 초안 · 다듬은 판 비교 이미지, 시간 · 비용 기록.
