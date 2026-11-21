---
title: 작업물 재료를 채팅에서 받아 커리어 기록에 붙이기
slug: work-materials
stage: spec
date: 2026-11-21
---

# 요구사항과 설계

## 계약 (`agent-chat.ts`)
- `AgentAttachmentSchema` `{ mediaId, name? }`. `SendAgentMessageSchema.attachments?`(그림 6장까지) · `AgentMessageSchema.attachments?`.
- 도구 입력: `AgentRepoReadInputSchema` `{ url }`, `AgentWorkAttachInputSchema` `{ recordId, items: (image{mediaId,caption} | site{url,caption} | repo{url,summary})[] }`(6개까지).
- 도구 결과 `workMaterials` `{ recordId, recordTitle, items: { kind, src?, url?, caption }[] }` — 카드.
- 모델에 넘기는 제작 상태에 `materials: { id, title }[]`(고른 기록).

## 백엔드
- `platform/net/public-url.ts` — http(s)만, DNS로 사설 · 링크로컬 · 루프백 대역을 막는다(`url-import.ts`와 같은 대역).
- `platform/browser/site-capture.ts` — Playwright로 1440×900을 열어 첫 화면 JPEG. 모든 요청의 호스트를 공개 주소로 검사하고 아니면 abort, 20초 상한.
- `platform/github/repo-reader.ts` — `github.com/{owner}/{repo}`만. api.github.com repo · languages · readme(6,000자까지), 10초 상한, `GITHUB_TOKEN`이 있으면 쓴다.
- 에이전트 서비스: 보낸 첨부는 그 사용자의 미디어인지 확인해 저장. `workMaterials` 포트(`main.ts`에서 조립: 미디어 업로드 · 찍기 · 레포 · 기록 갱신).
  붙이기는 그 사용자의 기록인지 확인하고, 본문의 `## 작업물` 아래(없으면 끝에 새로)에 `![caption](/v1/media/id)` · `[사이트](url)` · `[저장소 owner/repo](url) — summary`를 덧붙여 `updateRecord`.
- 런타임: `read_repository` · `attach_work_materials` 도구, 대화에 첨부(mediaId · 이름)와 붙인 결과 요약. 지침: AI 대화 단계에서 고른 기록마다 작업물을 먼저 청하고, 받으면 붙인다.

## 웹
- `AgentChat`: 입력창 옆 그림 단추 · 붙여넣기 → `uploadCareerMediaAction` → 보낼 때 `attachments`. 사용자 메시지에 축소 그림.
- `WorkMaterialsCard`: 기록 이름 · 붙인 그림 · 링크.
