---
title: 커리어 기록 화면 채팅 우측 레일 배치
slug: record-chat-rail
stage: plan
status: accepted
intent: .intent/intent_record-chat-rail.md
spec: .intent/spec_record-chat-rail.md
date: 2026-11-21
---

# 커리어 기록 화면 채팅 우측 레일 배치 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/agent-chat/ChatRail.tsx` | 공고 레일을 옮긴 공용 레일(새 파일) |
| `services/web/src/features/agent-chat/ChatRail.module.css` | 레일 · 토글 점 · 쌓기 CSS(새 파일) |
| `services/web/src/features/agent-chat/ChatRail.test.tsx` | 공고 레일 테스트를 옮김 |
| `services/web/src/app/(app)/jobs/[jobId]/JobChatRail.tsx` · `.test.tsx` | 삭제 |
| `services/web/src/app/(app)/jobs/[jobId]/page.tsx` · `page.module.css` | 공용 레일 사용, 레일 CSS 제거 |
| `services/web/src/app/(app)/career/records/[recordId]/page.tsx` · `page.module.css` | 프로바이더 · 토글 · 레일 배치 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` | 채팅 제거 |
| `services/web/src/app/(app)/career/[categorySlug]/DocumentPanel.tsx` | 서랍 편집기 아래 채팅 |

## 작업 순서

1. 공용 레일 추출과 공고 화면 전환 — 레일 테스트 통과
2. 기록 페이지 배치와 편집기 · 서랍 정리 — 타입 검사 통과
3. 개발 서버에서 두 화면 확인

## 가장 위험한 단계

공고 화면 CSS 이전. 선택자 하나를 빠뜨리면 공고 레일의 접힘 · 핸들 모양이 깨진다. 공고 상세를 같은 폭으로 열어 이전과 비교한다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
```

화면: `/career/records/<id>`와 `/jobs/<id>`를 1280px · 900px로 열고, 접기 · 펼치기 · 끌어 늘리기 · 새로 고침을 확인한다.
