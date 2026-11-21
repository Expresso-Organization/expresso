---
title: 「새 포트폴리오」를 대화로, 옛 단계 화면 걷어내기
slug: brew-chat-entry
stage: spec
date: 2026-11-21
---

# 요구사항과 설계

## 계약 (`agent-chat.ts`)
- 제작 카드 · 상태의 `jobPostingId`를 nullable로(자유 제작). `AgentBrewStart`에 `lengthPreset` · `free`(공고 없음).
- 제작을 가리키는 도구 입력(인터뷰 답 · 견본 · 첫 화면 고치기)은 `jobPostingId` 대신 `brewId`로 — 자유 제작도 같은 길.
- `AgentBrewStartInput`에 `length?`. 새 도구 입력: `AgentFreeBrewInput { title, brief, length? }`, `AgentPostingImportInput { url? | messageId?, companyName?, title?, length? }` — 공고 글은 모델이 옮겨 적지 않고 붙여 넣은 사용자 메시지의 id를 준다(서버가 그 원문을 등록, 등록한 원문은 고칠 수 없다).
- `AgentRunEvent`: `{ kind, brewId(분석 완료는 null), title }` — 모델은 공고 ID 대신 제목 · 제작 ID로 가리킨다.
- 제작 열기 응답(`AgentBrewOpenResponse`)에서 `path`를 지운다 — 모든 단계를 대화의 카드가 맡는다.
- 재개 응답 `AgentBrewResumeResponse { conversationId }`.

## 백엔드
- 대화는 제작을 지금처럼 `brewIds[jobAnalysisId]`로 찾는다(자유 제작도 가짜 분석이 있다).
- `start_portfolio`: 대화에 붙지 않은 공고면 공고가 있는지 확인하고 대화의 자료에 붙인다(에이전트가 찾은 공고). `length`는 카드에 적고 `openBrew`가 제작을 만들 때 쓴다.
- `start_free_portfolio`: `createFreeBrew`로 바로 제작을 만들고 `brewIds`에 적은 뒤 카드(분석 없음)를 세운다.
- `import_job_posting`: 주소는 `JobUrlImporter.read` → 회사 · 제목이 비면 그 칸을 물으라고 돌려준다. 글은 가리킨 사용자 메시지의 원문 그대로(메시지 상한 8,000자). `submitPosting`으로 등록하고(등록이 분석을 맡긴다) 그 분석으로 바로 카드를 세운 뒤 대화 자료에 붙인다 — `start_portfolio`를 다시 부르면 같은 공고의 분석이 둘 생길 수 있어 한 도구에서 끝낸다.
- `openBrew`: AI 대화 단계에서 이 대화에 인터뷰 카드가 없으면 옛 화면 경로 대신 「AI 대화」 카드를 붙인다(실행은 시작하지 않는다). 생성이 있으면 「생성」 카드. `brewPath`는 지운다.
- `MaterialsService.origin(userId, brewId)`: 재개할 때 쓰는 분석 · 공고 · 제목 · 분량.
- `resumeBrew(userId, brewId, { again })`: 그 제작을 적은 대화가 있으면 그 대화, 없으면 새 대화(공고 제작이면 공고를 자료로)에 `brewIds`를 적고 「포트폴리오 제작」 카드 + 지금 단계 카드를 붙인다. `again`이면 디자인 카드를 붙이고 다시 만들기를 연다.
- 생성: 다 만든 제작도 디자인 카드에서 「다시 만들기」(`again`)면 새로 맡긴다.
- 지침: 「새 포트폴리오」 화면 안내를 지우고 세 갈래 시작 · 분량 묻기 · 주소 읽기를 적는다.

## 웹
- `/home?new=portfolio`: 새 대화의 시작 화면에 세 시작 제안(입력창에 글을 넣는다).
- 진입 링크(사이드바 · 라이브러리 · 공고 목록 · 편집 레일 · 온보딩 · `portfolio/new` · `/brew/new`)를 `/home?new=portfolio`로. 공고 상세 · 온보딩 추천의 「이 공고로 만들기」는 공고를 붙인 대화로 넘긴다(`PostingChatStart` → `putAgentHandoff`). 만들던 제작이 있는 공고는 `/brew/<id>`.
- `/brew/[brewId]`(page): 그리는 동안에는 쓰지 않는다 — 화면이 뜬 뒤 `ResumeBrew`가 서버 액션으로 재개 API를 한 번 불러 `/home?chat=<id>`로 넘긴다(링크 미리 받기에서 대화가 생기지 않게). `again=1`이면 다시 뽑기. 옛 단계 주소(analyze · materials · counter)는 `[brewId]/[step]`이 같은 곳으로 넘긴다. 단계 줄(`WizardSteps`)의 지난 단계 링크도 같다.
- `/brew/[brewId]/design`은 카탈로그(`view=catalog`)와 도는 생성의 기다림 화면만 그리고, 그 밖에는 재개로 넘긴다. 카탈로그의 만들기 · 멈추기는 `?view=catalog`로 돌아온다.
- `resumeStep` 링크는 `/brew/<id>`로. 편집의 단계 줄 · 「다시 뽑기」도 같다.
- 지운다: `/brew/new` 전체(재사용 파일은 옮긴다), analyze · materials · counter, 그 화면만 쓰는 부품 · 액션 · 테스트.
