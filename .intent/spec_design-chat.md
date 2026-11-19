---
title: 디자인 선택 단계의 채팅 전환
slug: design-chat
stage: spec
status: accepted
intent: .intent/intent_design-chat.md
date: 2026-11-19
---

# 디자인 선택 단계의 채팅 전환 — 명세

## 요구사항

- [ ] `POST /v1/brews/:id/design-chat/open`은 대화가 없으면 만들고 첫 답(자료 머리 + 말 + 견본 세 개)을 시작한다. 두 번 불러도 대화는 하나다.
- [ ] `POST …/design-chat/messages`는 세 가지를 받는다: 말(`say`, 대상 견본 · 첫 화면 · 카탈로그 판을 붙일 수 있음), 견본으로 그리기(`draw`), 카탈로그 판으로 그리기(`draw_catalog`). 202로 바로 답하고 답은 뒤에서 만든다.
- [ ] 말에는 에이전트가 무엇을 띄울지 정한다: 없음 · 견본 · 첫 화면 · 고친 첫 화면.
- [ ] 첫 화면 여러 장은 동시에 그리고, 끝난 장부터 대화에 놓인다. 한 장이 실패해도 나머지는 남는다.
- [ ] 모든 AI 호출은 사용자 ID를 실어 사용량에 남고, 답을 시작하기 전에 동의(`career_records`)와 이번 달 크레딧 한도를 본다.
- [ ] 답을 만드는 중에 API가 꺼지면 그 답은 `interrupted`로 남고 다시 시도할 수 있다.
- [ ] `POST …/design-chat/selection`으로 고른 첫 화면을 저장한다.
- [ ] `POST /v1/generation-jobs`가 `designSnippetId`를 받는다. 그 생성은 자유 생성이고, 완성 지면의 HTML은 고른 첫 화면의 HTML로 시작하며 CSS는 그 CSS로 시작한다(서버가 이어 붙인다).
- [ ] 생성 중 미리보기는 고른 첫 화면을 먼저 보이고 그 아래로 나머지가 쓰인다.
- [ ] AI가 꺼진 서버(`AI_PROVIDER=off`)에서 디자인 단계는 기존 카탈로그 화면을 연다.
- [ ] 기존 카탈로그 화면의 동작과 구조화 생성 경로는 그대로다(`?view=catalog`).

## 설계

```mermaid
flowchart TD
  W["웹 디자인 단계 page.tsx (바뀜)"] --> C["DesignChat 화면 (새로)"]
  W --> K["DesignCatalog 화면 (재사용)"]
  C --> P["Next 프록시 /api/brews/id/design-chat (새로)"]
  P --> R["design-chat 라우트 (새로)"]
  R --> S["DesignChatService (새로)"]
  S --> D[("design_chats 컬렉션 (새로)")]
  S --> SRC["brewPageSources: 레시피 · 근거 읽기 (PageService에서 꺼냄)"]
  S --> AI["AiClient: page_design · page_generation, Sonnet (재사용)"]
  C --> G["생성 요청 designSnippetId (바뀜)"]
  G --> J["GenerationService.submit (바뀜)"]
  J --> WK["Worker → PageService.generate (바뀜)"]
  WK --> B["BriefedPageGenerator: 첫 화면 뒤를 이어 쓰기 (바뀜)"]
  WK --> ST["PageStream seed 이벤트 → LivePreview (바뀜)"]
```

**재사용하는 것**

- 화면: 제품 채팅의 `Thread`(`components/assistant-ui/elements/thread.aui`) + `useExternalStoreRuntime`, 시안의 카드 · 무대 · 전환 코드, `DesignThumb`, `BrewFrame`, `Dialog`.
- AI: `AiClient.complete` + `check`(걸린 칸만 고침), `briefedSystem`(디자인 지침), `sanitizePage`, `MeteredAiClient`(사용량).
- 실행: 에이전트 채팅의 방식 — API 프로세스에서 뒤로 돌리고, 1초마다 `heartbeatAt`, 읽을 때 60초 넘게 멎은 실행을 `interrupted`로, `preClose`에서 `close()`.
- 한도 · 동의: `MongoEntitlementService.check(userId, "portfolio.generate")`, `ConsentApi.require`.

**계약(`packages/contracts/src/design-chat.ts`)**

- `DesignTokens` — 바탕 · 글자 · 강조 색(#rrggbb), 서체 계열(`TemplateFontSchema`), 밀도.
- `DesignDirection`(견본) — `id · name · words · tokens`.
- `DesignSnippet`(첫 화면) — `id · origin(agent|user|catalog|edit) · name · note · words · tokens · css · html · fromSnippetId`.
- 메시지 — 사용자 말(`text`, `subject`)과 에이전트 답(`text`, `status`, `card`). `card`는 `directions` · `screens`(장마다 `drawing|done|failed`) · `revision`.
- `DesignChat` — `messages · snippets · selectedSnippetId · run · version`.
- `SubmitGenerationSchema`에 `designSnippetId`. `templateId` · `designSystemRevisionId` · `designSnippetId` 가운데 하나만 받는다.

**백엔드(`services/backend/src/modules/page/design-chat/`)**

- `sources.ts` — `PageService.#context`의 레시피 · 섹션 · 근거 · 공고 · 회사 조립을 `brewPageSources(db, userId, brewId)`로 꺼낸다. `#context`는 이 함수를 쓰고 포트폴리오에 딸린 것(스타일 · 그림)만 더한다. 디자인 단계에는 포트폴리오가 없어서 제작 ID로 읽어야 한다.
- `prompts.ts` — 호출 네 가지의 계약과 요청.
  - 여는 호출(`page_design`): 자료를 읽어 `head`(직무 · 한 줄 · 소개 · 다루는 것 · 앞세울 사실)와 말, 견본 세 개를 낸다. `head`의 숫자는 출처와 대조한다.
  - 답하는 호출(`page_design`): 대화 요약 · 대상 · 사용자의 말을 읽고 `say`와 `show`(none|directions|screens|revision)를 낸다. 선택 규칙(넓게 볼 때 견본, 좁혀졌거나 구체적일 때 첫 화면)은 시스템 프롬프트에 둔다.
  - 그리는 호출(`page_generation`): `head`와 방향의 말로 첫 화면 한 장면을 낸다(`name · note · tokens · css · html`). 2026-11-17 측정에 쓴 요청을 옮긴다.
  - 고치는 호출(`page_generation`): 지금 첫 화면과 지시를 받아 지시가 가리킨 것만 바꾼다.
  - 네 호출 모두 `modelTier: "sonnet"`을 명시한다. 두 계약의 기본은 Opus다.
- `service.ts` — `DesignChatService`. `get · open · send · select · retry · close`와 생성 쪽이 쓰는 `findDesignSnippet`.
- `routes.ts` — 위 라우트. AI가 없으면 등록하지 않는다(503).

**고른 첫 화면을 완성 지면으로**

- `generation_jobs` · `portfolios` 문서에 `designSnippetId`를 싣는다(두 컬렉션의 검증 규칙은 추가 필드를 막지 않는다). 템플릿은 Clarity, `styleOverrides`는 첫 화면의 색 · 서체 · 밀도, 방식은 `html`.
- `PageService.#context`가 `portfolio.designSnippetId`로 첫 화면을 읽어 `context.seed`에 넣는다.
- `BriefedPageGenerator`는 `seed`가 있으면 요청에 확정된 첫 화면을 보이고 **그 뒤만** 쓰게 한다. 결과는 서버가 `seed.html + html`, `seed.css + css`로 붙인다.
- `PageStream`에 `seed` 이벤트를 더한다. `LivePreview`는 `seed`를 받으면 그 첫 화면을 먼저 그리고 이후 조각을 그 뒤에 붙인다.

**데이터**

- 새 컬렉션 `design_chats`(마이그레이션 0033 — 0032는 `feat/home-agent-first`가 쓴다). `(userId, brewId)` 고유 인덱스. 계정 삭제 목록(`PURGED_COLLECTIONS`)에 넣는다.

**웹**

- `features/design-chat/` — `DesignChat.tsx`(시안에서 옮김), `useDesignChat.ts`(실행 중 1.5초마다 `since=<version>`으로 다시 읽음 — 제작 흐름의 `use-refresh-while`과 같은 주기), `thread.ts`(대화 → 스레드 메시지 변환).
- `app/api/brews/[brewId]/design-chat/[[...path]]/route.ts` — 쿠키의 토큰을 붙여 넘기는 프록시(에이전트 채팅 프록시와 같은 방식).
- `design/page.tsx` — 대화를 쓸 수 있으면 `DesignChat`, `?view=catalog`이거나 쓸 수 없으면 `DesignCatalog`.
- `thread.aui.tsx` — 런타임이 중단을 지원하지 않으면 멈춤 버튼 대신 꺼진 보내기 버튼을 둔다.

## 버린 대안

- **완성 지면에서 모델이 첫 화면을 다시 쓰게 하고 `check`로 대조**: 2026-11-17에 두 번 재서 두 번 다 같았지만, 한 글자가 달라지면 지면 전체를 다시 받거나 생성이 실패한다. 서버가 붙이면 어긋날 수 없고 출력도 짧아진다.
- **에이전트 채팅 모듈로 구현**: `main`에서는 서버 인증이 허용된 계정이 아니면 개인 API 키가 있어야 한다. 서버 인증 작업은 열린 PR에 있다.
- **SSE**: 에이전트 채팅의 SSE도 서버가 500ms마다 문서를 다시 읽어 보내는 방식이다. 답이 한 번에 오는 이 대화에서는 1.5초 폴링과 보이는 것이 같다.
- **새 AI 계약 이름**: 계약을 더하면 기본 모델 표 · 동의 표 · 사용량 이름표를 함께 고쳐야 한다. `page_design` · `page_generation`으로 충분하다.
- **그릴 때마다 원문 전체를 넘기기**: 여는 호출이 뽑은 `head`만 넘기면 세 장이 같은 사실을 쓰고 요청이 짧다. 측정도 이 모양으로 했다.

## 함정

- 여는 호출을 페이지 렌더에서 시작하면 안 된다. `router.refresh()`와 프리페치가 렌더를 여러 번 일으킨다. 화면이 뜬 뒤 클라이언트가 `open`을 한 번 부른다.
- `AiCallOptions`에 중단 신호가 없다. 실행을 멈출 수 없으므로 멈춤 버튼을 보이지 않는다.
- `#context`는 고정폭(`mono`)을 고딕으로 내린다. 고른 첫 화면이 고정폭이면 완성 지면 요청의 스타일 문단이 첫 화면과 어긋난다. `seed`가 있을 때는 첫 화면의 서체 계열을 그대로 적는다.
- `usageSink`는 `userId`가 없으면 크레딧에 더하지 않는다. 측정 스크립트는 `userId: null`이었다.
- 모델이 쓴 HTML · CSS를 앱 안에 그린다. `sanitizePage`를 거친 것만 저장하고, 화면은 `sandbox=""` iframe으로 그린다(시안과 같다).
- 첫 화면이 `<main>`으로 감싸여 있으면 뒤에 붙는 섹션이 그 밖에 놓인다. 그리는 호출에 "첫 화면은 `<header>`나 `<section>` 하나로 쓰고 지면 전체를 감싸는 틀을 두지 않는다"를 적는다.
- 지시를 붙여 지금 지면을 고칠 때(`previous && instruction`)는 `seed`를 쓰지 않는다. 직전 지면에 첫 화면이 이미 있다.
- 새 컬렉션은 `migrations.test.ts`(20) · `schema.test.ts`(88)의 수와 계정 삭제 통합 테스트를 건드린다.
- 운영 서버는 `claude` CLI를 호출마다 띄운다. 세 장을 동시에 그리면 프로세스 셋이 함께 돈다(2026-11-17 로컬에서 다섯 개 동시 34초).

## 완료 기준

- `pnpm typecheck`와 `pnpm test` 통과, `pnpm test:infra`에서 새 통합 테스트(`design-chat.mongo.integration.test.ts`) 통과.
- 복사본 DB(`expresso_free_lab`)와 `AI_PROVIDER=claude-code`로 띄운 서버에서, 윤하린 제작의 디자인 단계를 열어 첫 질문 → 견본 누르기 → 말로 고치기 → 고르기 → 만들기를 끝까지 하고, 완성 지면의 맨 앞이 고른 첫 화면과 같은지 헤드리스 Chrome으로 확인한다.
- `AI_PROVIDER=off`로 띄우면 디자인 단계가 기존 카탈로그 화면을 연다.
