---
title: 보완점 정리 카드의 「다시 대조 필요」 표시와 PR 65 · 70 잔여 흡수
slug: gap-review-freshness
stage: spec
status: accepted
intent: .intent/intent_gap-review-freshness.md
date: 2026-10-27
---

# 보완점 정리 카드의 「다시 대조 필요」 표시와 PR 65 · 70 잔여 흡수 — 명세

## 요구사항

- [ ] 보완점 정리 도구 결과(`GapReview`)를 만들 때, 근거로 인용한 기록(`sourceType: "record"`)마다
      기록 글의 해시를 `snapshot.records`에 저장한다. 같은 기록은 한 번만. 사용자 발언 근거는 넣지 않는다.
- [ ] `GET /v1/agent/conversations/:id/reviews/:toolId`가 보완점 정리 도구 id도 받는다. 응답 모양은
      지금과 같은 `{ stale, changed }`(`AgentReviewFreshnessResponseSchema`).
- [ ] 보완점의 `stale`은 다음 중 하나라도 참이면 참이다.
      (a) 그 보완점보다 앞에 있는 가장 최근 요건 대조(만들 때 기준이 된 대조)가 오래되었다 — 기존 `reviewFreshness`.
      (b) `snapshot.records`의 기록 중 하나가 없어졌거나 글 해시가 다르다.
      `changed`는 (a)의 값과 (b)의 `"records"`를 중복 없이 합친다.
- [ ] `snapshot`이 없는 예전 보완점은 (a)만 본다. 예전 대화를 읽을 때 계약 검사가 실패하지 않는다.
- [ ] 다른 사용자의 대화, 이 대화에 없는 도구 id, 대조도 보완점도 아닌 도구 id는 404.
- [ ] `GapReviewCard`는 대화 id가 있으면 열릴 때 한 번 최신성을 묻고, `stale`이면 머리에
      `RequirementReviewCard`와 같은 「다시 대조 필요」 표시를 보인다. 조회가 실패하면 표시하지 않는다.
- [ ] `AgentChat.module.css`의 `.resourceResults .result strong`에 `line-clamp: 2`를 더한다.
- [ ] 모델에 넘기는 대화(`conversationForModel`)에는 `snapshot`을 싣지 않는다(지금처럼 고른 필드만).

## 설계

**재사용**
- 판정: `AgentChatService.reviewFreshness`(공고 해시 · 대조 근거 기록 해시)와 `recordTexts`, `hash`
  (`requirement-review.ts`)를 그대로 쓴다. 요건 대조의 `snapshot.records` 항목 모양을 계약에서
  `RecordSnapshotSchema`로 꺼내 두 스키마가 같이 쓴다.
- 라우트 · 웹 프록시: 기존 `reviews/:toolId` 경로를 그대로 쓴다. 보완점도 "검토 결과"이므로 경로 이름이
  맞고, 프록시(`app/api/agent/[...path]/route.ts`)의 허용 규칙과 응답 파싱을 바꾸지 않는다. 주석만
  "요건 대조 · 보완점 최신성"으로 고친다.
- 카드 표시: `ToolCard.module.css`의 `.stale`과 `arrows-clockwise` 아이콘.

**바뀌는 것**
- 계약 `GapReviewSchema`에 `snapshot: { records: RecordSnapshot[] ≤140 }` 선택 필드. 140은 보완점 20개 ×
  근거 7개(스키마 상한)다.
- `buildGapReview`가 `records` 맵(이미 근거 검증에 쓰는 글)에서 해시를 계산해 `snapshot`을 채운다.
- `freshness(userId, id, toolId)`는 대화의 도구를 순서대로 펼쳐 `toolId`의 위치를 찾는다. `review`면 지금
  동작. `gapReview`면 그 위치 앞에서 가장 최근의 `review`를 찾아 (a), `snapshot`으로 (b)를 계산하는
  `gapFreshness`로 간다. 기준 대조를 다시 찾는 규칙은 만들 때의 `latestReview(messages)`와 같다.
- 웹: `RequirementReviewCard`의 조회 `useEffect`를 `useToolFreshness(conversationId, toolId)` 훅으로 꺼내
  두 카드가 쓴다. `GapReviewCard`에 `conversationId` · `toolId` 속성을 더하고 `AgentChat.tsx`의 분기에서
  넘긴다.

## 버린 대안

- 보완점에 기준 대조의 도구 id를 저장: 위치로 다시 찾는 규칙이 만들 때의 규칙과 같아서 저장할 필요가
  없고, 예전 보완점에도 그대로 적용된다.
- 기록의 `updatedAt`과 보완점 `createdAt` 비교: 제목 · 속성만 바뀌어도 표시가 뜬다. 요건 대조와 같은 글
  해시 기준을 쓴다.
- 새 경로 `gap-reviews/:toolId`: 응답 모양이 같은데 백엔드 라우트와 프록시 허용 규칙만 하나씩 늘어난다.
- 보완점 근거 기록을 대조 근거 기록과 같다고 보고 (a)만 보기: 보완점 근거는 대조에 없던 기록도 인용할
  수 있다(`service.gapReview`가 근거 기록을 따로 읽는다).

## 함정

- 도구 결과는 `AgentToolResultSchema`(strict)로 대화 응답에 실려 웹에서 파싱된다. `snapshot`을 필수로
  두면 예전 대화가 502가 된다 — 선택 필드여야 한다.
- 기록을 지우면 `recordTexts`에서 빠진다. 없는 기록은 바뀐 것으로 본다(요건 대조와 같다).
- 웹 테스트는 contracts의 `dist`를 본다. 계약을 고친 뒤 낡은 dist면 카드 테스트만 깨진다.
- 열린 질문 1(뒤에 새 대조가 있는 보완점)은 이 명세에서 표시하지 않는 쪽으로 썼다. 표시하기로 하면
  `freshness` 응답에 이유 하나(`"review"`)와 카드 문구 「다시 정리 필요」가 추가된다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과.
- 단위: `buildGapReview`의 `snapshot`(기록 근거만 · 중복 없음 · 해시). 계약: `snapshot` 없는 보완점 파싱.
- 통합: 보완점 최신성 — 처음 `stale: false`, 보완점만 인용한 기록을 고치면 `{ stale: true, changed: ["records"] }`,
  관계없는 기록을 고치면 그대로, 다른 사용자 404.
- 카드: 최신성 조회 경로와 「다시 대조 필요」 표시, 대화 id가 없으면 조회하지 않음.
