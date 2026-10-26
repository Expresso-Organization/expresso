---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — B. 요건 대조 · 보완 인터뷰
slug: job-chat-rail-b
stage: spec
status: accepted
intent: .intent/intent_job-chat-rail.md
date: 2026-10-15
---

# B. 요건 대조 · 보완 인터뷰 — 명세

intent의 B1 · B2와, 그 둘이 기대는 기록 읽기 도구 · 도구별 카드 분기.

## 요구사항

- [ ] 에이전트는 대화에 연결하지 않은 내 기록도 목록으로 보고(`list_career_records`), 골라서
      본문을 읽는다(`read_career_records`, 한 번에 10개까지). 삭제된 기록과 남의 기록은 보이지
      않는다. 읽은 기록은 대화 안에 "기록 읽기" 도구 줄로 남는다.
- [ ] B1 에이전트가 `record_requirement_review`로 요건 대조를 기록하면 대화 안에 카드가 나온다:
      요약, 강함 · 일부 · 미확인 개수, 요건별 판정 · 공고 인용 · 근거 기록 인용(기록 제목 포함) ·
      설명 · 보완 제안.
- [ ] B1 서버 검증: 공고는 대화에 연결된 것이어야 한다. 공고 인용은 공고 원문 안에, 근거
      인용은 그 기록 본문 안에 그대로 있어야 한다(공백 차이는 무시). 강함 · 일부는 근거 1개
      이상, 미확인은 근거 0개. 요건 이름 중복 금지. 어긋나면 저장하지 않고 어긋난 항목을
      에이전트에게 돌려줘 고쳐 다시 기록하게 한다.
- [ ] B1 카드는 대조 이후 공고 원문이나 근거로 쓴 기록 본문이 바뀌었으면 "다시 대조 필요"를
      표시한다.
- [ ] B2 에이전트는 이전 턴의 도구 결과(대조 결과 포함)를 다음 턴에서도 본다. 보완 질문을
      요청받으면 미확인 · 일부 요건부터 한 번에 한 질문씩 묻고, 답에 역할 · 행동 · 결과 중 빠진
      것이 있으면 그것을 묻고, 충분하거나 사용자가 멈추라고 하면 멈춘다. 기록에 없다는
      이유로 경험이 없다고 단정하지 않는다.
- [ ] 기존 기록 변경 제안 카드 · 승인 · 되돌리기는 그대로 동작한다.
- [ ] 화면 문구 · 저장 데이터에 내부 단계명(P3 등)이 없다. 고정 문자열 메시지로 분기하지 않는다.

## 설계

**계약 — `packages/contracts/src/agent-chat.ts`.**
`RequirementReviewDraftSchema`(에이전트 도구 입력: `jobPostingId`, `summary`, `items[1..12]`
각 `{requirement, jobQuote, kind: must|nice|responsibility, assessment: strong|partial|unconfirmed,
explanation, evidence[0..5]{recordId, quote}, recommendation}` + 판정 · 근거 개수 규칙),
`RequirementReviewSchema`(저장형: 위 + 근거마다 `recordTitle`, `snapshot{jobContentHash,
records[{recordId, textHash}]}`, `createdAt`). `AgentToolResultSchema`에 `review` 선택 필드.
`AgentReviewFreshnessResponseSchema`(`{stale, changed: ("job"|"records")[]}`).
대조 결과는 기록 변경 제안과 같이 대화 문서의 도구 결과에 남는다 — 대화 컬렉션 검증 규칙은
메시지 안쪽을 제한하지 않으므로 마이그레이션이 없다.

**런타임 — `platform/agent/runtime.ts`.** `AgentInput`에 `records.list()` · `records.read(ids)` ·
`review(draft)` 콜백을 더하고 MCP 도구 3개를 등록한다. 대조 검증 실패는 `isError` 도구 결과로
어긋난 항목 목록을 돌려준다. 대화 기록을 모델에 넘길 때 각 메시지의 도구 결과를
`{name, summary, review?}`로 함께 넘긴다(B2가 이전 대조를 보는 경로). 시스템 프롬프트에 대조 ·
인터뷰 규칙을 더한다. `maxTurns`(8) · `maxBudgetUsd`(1)는 바꾸지 않는다 — 기록 읽기를 여러 개
묶어 왕복 수를 줄인다.

**서비스 — `modules/agent-chat`.** 새 파일 `requirement-review.ts`에 순수 함수:
본문 정규화(공백 압축), 기록 텍스트(제목 + `careerDocumentToMarkdown(document)` + 속성 값),
초안 검증(어긋난 항목 목록 반환), 해시. `AgentChatService`는 실행 시 콜백을 만든다:
목록은 `career.listRecords`(최근 수정순 100개, 제목 · 카테고리 · 상태), 읽기는
`career.getRecord` + `documents.bootstrap`(기록당 4,000자), 대조는 연결된 공고 확인 →
`jobs.get`의 `descriptionRaw` → 검증 → 저장형 조립. `freshness(userId, conversationId, toolId)`는
저장된 해시와 현재 해시를 비교한다. 라우트 `GET /v1/agent/conversations/:id/reviews/:toolId`.

**웹.** `RecordTool`을 도구 결과 모양으로 나누는 분기로 바꾼다(`proposal` → 기존 제안 화면,
`review` → `RequirementReviewCard`, 그 밖 → 요약). 카드는 316px 기준: 머리(요건 대조 ·
개수 칩 · 최신성), 요약, 요건 줄(판정 아이콘 + 요건) — 누르면 펼쳐 인용 · 설명 · 근거 ·
보완 제안. 판정 아이콘은 공고 상세 `COVERAGE`와 같은 매핑(check-circle / warning-circle /
circle-dashed)과 상태 토큰을 쓴다. 최신성은 카드가 열릴 때 한 번 조회한다. 웹 프록시에
`reviews` GET 경로를 허용한다.

## 버린 대안

- P3처럼 서버가 별도 AI 호출로 대조를 만드는 것: 같은 대화 안에 AI가 둘이 되고, 결과가
  에이전트에게 돌아가지 않아 인터뷰가 그 결과를 못 본다(PR 65의 결함 그대로).
- 공고 연결 시 기록 전체를 문맥에 미리 붙이는 것: 대화마다 120,000자 상한을 먹고, 에이전트가
  필요한 기록만 고를 수 없다.
- 대조를 별도 컬렉션에 저장: 보완점 정리(D)가 같은 대화의 도구 결과에서 읽으면 충분하고,
  계정 삭제 연결도 대화 문서 하나로 끝난다.
- 인용 불일치 시 대조 전체 실패(P3 방식): 에이전트가 고칠 기회 없이 끝난다.

## 함정

- `documents.bootstrap`은 스냅샷이 없으면 만든다(쓰기). 이미 연결 기록 문맥이 같은 경로를 쓴다.
- 대화 메시지 JSON 160,000자 상한 — 대조 결과가 커서 일찍 닿을 수 있다. 저장형 필드마다 길이
  상한을 둔다(인용 600자, 설명 1,200자).
- 도구 결과를 프롬프트에 넣으면 이전 기록 변경 제안의 명령 전체가 들어갈 수 있다 — 이름 · 요약
  · 대조만 넣는다.
- 웹 프록시는 경로 길이 3을 넘으면 404 — `reviews/:toolId`를 위해 규칙을 넓힌다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과. 계약 테스트(판정 · 근거 규칙), 검증 함수
  단위 테스트(공백 차이 허용 · 없는 인용 · 남의 기록 · 중복 요건), 서비스 통합 테스트(대조 저장 ·
  검증 실패 시 미저장 · 기록 수정 후 최신성 stale).
- 브라우저: 공고 상세에서 "요건과 내 기록 비교"로 실제 에이전트가 기록을 읽고 대조 카드를 남긴다.
  기록을 고친 뒤 카드가 "다시 대조 필요"를 보인다. "부족한 요건 보완 질문"에 한 질문씩 묻는다.
