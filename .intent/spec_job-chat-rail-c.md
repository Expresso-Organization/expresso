---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — C. 대화로 새 기록 만들기
slug: job-chat-rail-c
stage: spec
status: accepted
intent: .intent/intent_job-chat-rail.md
date: 2026-10-15
---

# C. 대화로 새 기록 만들기 — 명세

intent의 C1. PR 59의 P5(사용자 발언 기반 경력 초안 · 승인 · 거절)를 공통 채팅의 도구 + 카드로 가져온다.

## 요구사항

- [ ] 에이전트가 `propose_new_record`로 새 기록 초안을 내면 대화 안에 카드가 나온다: 제목, 본문,
      출처 발언 인용, 카테고리 선택, "승인하고 저장" · "거절".
- [ ] 서버 검증: 출처는 이 대화의 사용자 메시지여야 하고, 인용은 그 메시지 안에 그대로 있어야
      한다(공백 차이 무시). 출처 1~10개. 카테고리를 주면 내 카테고리여야 한다. 어긋나면 저장하지
      않고 어긋난 항목을 에이전트에게 돌려준다.
- [ ] 승인 전에는 기록이 생기지 않는다. 승인하면 카드에서 고친 제목 · 본문 · 카테고리로 새 기록이
      생기고 카드는 "저장했습니다 · 기록 열기"가 된다. 같은 초안을 두 번 승인해도 기록은 하나다.
- [ ] 거절하면 기록이 생기지 않고 카드는 "거절했습니다"가 된다. 처리된 초안은 다시 바꿀 수 없다.
- [ ] 승인 · 거절은 AI 없이 동작한다(에이전트가 꺼졌거나 API 키가 없어도 카드에서 된다). 실행
      중에는 막는다.
- [ ] 카테고리 필수 속성 때문에 저장이 거절되면 카드에 그 이유가 보이고 초안은 그대로 남는다.

## 설계

**계약.** `AgentRecordDraftInputSchema`(도구 입력: `title` ≤300, `categoryId?`, `bodyMd` ≤20,000,
`sources[1..10]{messageId, quote ≤600}`), `AgentRecordDraftSchema`(저장형: + `draftId`,
`categoryId|null`, `categories[{id, name}]`(카드의 선택지), `status: ready|approved|rejected`,
`recordId|null`), `AgentToolResultSchema.recordDraft`, `AgentRecordDraftDecisionSchema`
(`approve`는 `title` · `bodyMd` · `categoryId` 필수, `reject`는 없음).

**런타임.** 도구 `propose_new_record`와 프롬프트 규칙(사용자가 말한 내용만, 팀원의 일을 본인
일로 바꾸지 않음, 상황 · 역할 · 행동 · 결과 순 마크다운, 승인 전에는 저장했다고 말하지 않음).
모델용 대화의 사용자 메시지에 `id`를 싣는다(출처 지정용). `list_career_records`는 카테고리
목록도 함께 돌려준다.

**서비스.** `recordDraft(userId, row, input)`: 출처 검증(`normalize` 재사용) · 카테고리 확인 →
저장형 조립. `decideRecordDraft(userId, id, draftId, decision)`: 실행 중이면 409, 처리된 초안은
같은 결정이면 그대로 · 다른 결정이면 409. 승인은 `career.createRecord(userId, draftId, …)` —
초안 id가 멱등 키라 중복 생성이 없다. 결과를 도구 결과에 `arrayFilters`로 반영.
라우트 `POST /v1/agent/conversations/:id/record-drafts/:draftId`.

**웹.** `RecordDraftCard`(316px): 처리 전에는 제목 입력 · 카테고리 선택 · 본문 textarea ·
출처 인용 · 두 버튼, 처리 후에는 상태 문구와 링크. 훅에 `decideDraft`. `AgentChat`의 도구 분기에
`recordDraft` 추가. 웹 프록시에 `record-drafts/:draftId` POST 허용.

## 버린 대안

- P5처럼 사용자가 발언을 체크박스로 고르는 화면: 316px 레일에서 메시지마다 체크박스를 붙이면
  대화를 읽기 어렵다. 에이전트가 출처를 고르고 서버가 확인한다.
- P5의 `job_chat_facts` 별도 컬렉션: 초안은 대화의 도구 결과로 충분하고, 승인 결과는 기록 자체다.
- 초안 생성에 기존 `record_cleanup` AI 호출을 거치는 것: 같은 대화의 에이전트가 이미 그 일을 한다.

## 함정

- `createRecord`의 멱등 키는 요청 해시와 묶인다 — 같은 초안을 다른 내용으로 다시 승인하면 409.
  처리된 초안은 상태로 막으므로 그 경로에 닿지 않는다.
- 사용자 메시지 8,000자 vs 인용 600자 — 인용 길이는 도구 입력에서 자른다(P5의 500 오류 원인).
- 카테고리에 필수 속성이 있으면 `properties: {}`로는 저장이 거절된다 — 오류를 카드에 보이고 초안을
  남긴다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과. 출처 검증 단위 테스트, 서비스 통합
  테스트(초안 → 승인 시 기록 1개 · 두 번 승인해도 1개, 거절 시 0개, 남의 대화 404, 실행 중 409),
  카드 테스트.
- 브라우저: 보완 인터뷰 답변 뒤 "이 내용으로 기록 만들어 줘" → 초안 카드 → 제목 수정 · 카테고리
  선택 → 승인 → 기록 화면에서 확인.
