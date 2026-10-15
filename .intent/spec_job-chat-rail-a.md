---
title: 공고 상세 우측 사이드바의 공고 전용 에이전트 채팅 — A. 사이드바 · 공고별 대화 · 다시 보내기
slug: job-chat-rail-a
stage: spec
status: accepted
intent: .intent/intent_job-chat-rail.md
date: 2026-10-15
---

# A. 사이드바 · 공고별 대화 · 다시 보내기 — 명세

intent의 A1~A5와 정의서 06b.

## 요구사항

- [ ] A1 데스크톱(≥1024px)에서 `aside.rail`의 자식은 채팅 하나이고, 채팅 높이가 레일 높이와
      같다. 메시지가 늘어도 레일 높이는 그대로이고 채팅 안의 메시지 목록만 스크롤된다.
- [ ] A1 1023px 이하에서 레일이 본문 아래로 내려가도 채팅 높이는 `min(720px, 85dvh)`
      안이다.
- [ ] A2 공고 페이지에 `analyzePostingAction` 폼(포트폴리오 만들기 · 질문 3개로 채우기),
      일치 카드, 빠진 재료 카드가 없다. 회사 톤(브랜드 색 · 공고 말투 · 인상)은 왼쪽 본문
      마지막 절로 나온다. 값이 없으면 절 자체가 없다.
- [ ] A3 공고 페이지에 `?chat=`이 없으면, 대화 목록에서 `contexts`에 이 공고가 있는 가장
      최근 대화를 연다. 없으면 대화 없이(새 대화) 시작하고 첫 메시지를 보내면 이 공고가
      연결된 대화가 생긴다. `?chat=`이 있으면 그 대화를 연다.
- [ ] A3 공고 A에서 공고 B로 이동하면 B 기준으로 다시 고른다(이전 대화 상태가 남지 않는다).
- [ ] A3 `/agent`와 기록 편집기의 대화 복원 방식(`?chat=` → `sessionStorage`)은 그대로다.
- [ ] A4 공고 모드의 새 대화 첫 화면은 회사명 · 직무명과 시작 제안 3개(요건과 내 기록 비교,
      이 공고가 보는 역량, 부족한 요건 보완 질문)를 보여 준다. 표제 크기는 레일 폭에 맞는
      `--ex-text-xl` 이하다. `/agent`와 기록 편집기의 첫 화면은 그대로다.
- [ ] A5 마지막 실행이 `failed` · `interrupted` · `cancelled`이면 오류 문구 옆에 "다시
      보내기"가 있다. 누르면 마지막 사용자 메시지를 그대로 두고 마지막 AI 답변만 새로
      만든다(대화에 같은 질문이 두 번 쌓이지 않는다). 그 답변이 만든 적용 전 기록 변경
      제안은 취소된다.
- [ ] A5 실행 중이거나 마지막 메시지가 AI 답변이 아니면 다시 보내기는 409다.
- [ ] 06b 우측 레일 정의가 채팅 하나로 바뀐다.

## 설계

**공고 모드 진입 — `AgentChat`에 `job` 속성 추가.**
`job?: { id: string; title: string; company: string }`. 주어지면 `context`는
`{ kind: "job", id }`, `contextLabel`은 `title`로 정해지고, 루트에 `styles.rail`이 붙는다
(`.panel` 대신). 기존 `context` · `contextLabel` · `standalone` 속성과 두 화면은 그대로.
공고 페이지는 `<AgentChat key={job.id} job={…} />` — `key`로 공고가 바뀌면 다시 마운트한다.

**공고별 대화 선택 — `useAgentConversation(context, { pick: "latest-for-context" })`.**
첫 선택 effect에서 주소에 `chat`이 있으면 그대로 쓰고, 없고 `pick`이 있으면
`GET /api/agent/conversations`(이미 있는 목록 API, `updatedAt` 내림차순)를 받아
`contexts`에 해당 공고가 있는 첫 대화를 `select`한다. 고르는 동안 `resolving=true`이고,
화면은 이 동안 환영 화면 대신 불러오는 상태를 보인다(환영 화면이 잠깐 보였다 사라지지 않게).
`sessionStorage` 읽기는 `pick`이 없을 때만 한다.

**공고 모드 첫 화면 — `ChatWelcome`을 모드별로.** 현재 `Thread`의 `Welcome` 컴포넌트에
속성을 넘길 수 없으므로 `ChatContext`에 `job`을 실어 `ChatWelcome`이 읽는다. 공고 모드는
회사명(작은 글씨) · 직무명(2줄 말줄임) · 한 줄 설명 · 시작 제안 3개(아이콘 + 제목 한 줄).

**레일 레이아웃.** `page.module.css`의 `.rail`은 `padding: 0; overflow: hidden; display: flex`.
`AgentChat.module.css`에 `.rail { display:flex; height:100%; min-height:0; }`
(테두리 · 둥근 모서리 없음, 레일의 왼쪽 테두리를 그대로 쓴다). `.rail`의 헤더 · 자료 줄 ·
환영 화면 여백은 `.panel` 규칙과 같은 값을 쓴다 — `.panel` 규칙의 선택자에 `.rail`을
더한다. 1023px 이하에서는 `.rail { height: min(720px, 85dvh); }`.

**다시 보내기 — 백엔드 `AgentChatService.retry`.**
`send`의 앞부분(동의 확인 · 문맥 적재 · 크기 확인)을 `prepare`로 묶어 둘이 함께 쓴다.
`retry`는 실행 상태와 마지막 두 메시지(user, assistant)를 확인하고, 마지막 답변의 도구 중
`proposal.status === "ready"`인 제안을 `documents.cancelAiProposal`로 취소한 뒤,
`version` 조건으로 마지막 답변을 빈 답변(새 id)으로 바꾸고 `run`을 새 id · 같은
`requestId`로 `running`으로 둔 다음 `execute`를 다시 부른다.
라우트 `POST /v1/agent/conversations/:id/retry`(본문 없음, API 키 처리는 `messages`와 같다),
웹 프록시 허용 목록에 `retry` 추가, 훅에 `retry()` 추가.

**회사 톤 절.** 지금의 `railCard` 마크업을 왼쪽 `.section`으로 옮기고 제목을 다른 절과 같은
`blockTitle`로 쓴다. 쓰이지 않게 되는 클래스(`matchCard` 계열, `railCard*`, `railCta`,
`topRecord*`, `.brew`)는 지운다.

## 버린 대안

- 공고별 `sessionStorage` 키: 다른 기기 · 새 창에서 이어지지 않는다. 대화 목록의
  `contexts`가 이미 서버에 있다.
- 다시 보내기를 새 `requestId`로 같은 문장을 다시 보내는 것: 대화에 같은 질문이 두 번
  남고, 실패한 답변의 제안이 남는다.
- `Thread`를 복사해 공고 전용 Thread를 만드는 것: 프레임워크 원본을 쓰는 기존 방침과 어긋난다.

## 함정

- `Next` 클라이언트 이동에서 같은 위치의 컴포넌트는 상태를 유지한다 — `key` 필수.
- `useAgentConversation`의 목록 폴링 effect가 `id`에 의존해 다시 돈다. 첫 선택은 그와 별도
  요청으로 한다.
- 레일 높이 100%는 `.body`가 높이를 갖고 있어야 성립한다. `.body`는 `flex:1; overflow:auto`
  이므로 레일이 늘어나지 않도록 `align-self: stretch` + `max-height: 100%`를 확인한다.
- `owned()`가 60초 하트비트로 `interrupted`를 만드는 경로도 다시 보내기 대상이다.

## 완료 기준

- `pnpm typecheck`, `pnpm test` 통과. `useAgentConversation.test.tsx`에 공고별 선택 2건,
  `service.integration.test.ts`에 다시 보내기 2건(정상 · 실행 중 409)이 추가되어 통과.
- `pnpm test:infra`로 백엔드 통합 테스트 통과.
- 브라우저에서 공고 상세: 데스크톱 · 1023px · 375px 폭 스크린샷, 공고 A → B 이동 시 대화가
  바뀌는 것, 다시 보내기 후 메시지 수가 늘지 않는 것을 확인.
