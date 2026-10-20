---
title: v2 꺼짐 상태의 기록 상세 문서 세션 처리
slug: career-detail-v2-off
stage: intent
status: accepted
author: Nedian0Brien
date: 2026-10-16
---

# v2 꺼짐 상태의 기록 상세 문서 세션 처리

## 문제

`CAREER_EDITOR_V2_ENABLED=false`인 백엔드에서 웹 기록 상세(`/career/records/:id`)를 열면
`GET /api/career/records/:id/document`가 404를 돌려준다. `CareerEditorSession.bootstrap`은
이 404를 네트워크 오류와 같게 다룬다 — 빈 문서를 만들고 `offline`이 된 뒤 `bootstrap()`을 다시 부른다.

2026-10-16 개발 서버(웹 3141 · API 4041, v2 꺼짐, PR #83 수정 포함)에서 재현한 결과:

- 404가 페이지를 연 뒤 약 0.3 · 0.5 · 1 · 2 · 4 · 8초에 나고 이후 10초 간격으로 계속 난다
  (첫 20초 동안 7번). 새로고침하면 처음부터 다시 시작한다.
- 편집기는 빈 문단 하나로 그려진다. 기록에 있는 `bodyMd`("기존 Markdown 본문입니다.")는
  화면에 나오지 않는다.
- 본문은 `contenteditable=true`라 입력할 수 있다. 입력하면 화면에는 보이지만 저장 요청이
  하나도 나가지 않고, 새로고침하면 사라진다. 서버 `bodyMd`도 그대로다. 저장 실패 표시도 없다.

즉 기존 본문이 보이지 않고, 사용자가 쓴 내용이 알림 없이 버려진다.

참고 사실:

- v2가 꺼진 웹의 카테고리 화면(`LegacyCareerBrowser`)은 `bodyMd`를 읽기 전용으로만 보여 준다.
  웹 어디에도 v2 없이 본문을 고치는 화면은 없다.
- `/career/records/:id`는 v2 커밋에서 생겼고, v2 문서 패널의 "넓게 보기"에서만 연결된다.
  v2 꺼짐 상태에서는 주소를 직접 열거나 웹 플래그와 백엔드 플래그가 어긋났을 때 닿는다.
- 웹은 `CAREER_EDITOR_V2_ENABLED`를 자기 프로세스 환경 변수로 읽고(`feature-flag.ts`),
  `deploy.sh`는 이 값을 백엔드 `.env`에만 채운다. 두 값이 어긋날 수 있다.

## 원하는 결과

- 문서 bootstrap이 404면 세션은 다시 요청하지 않는다. 페이지를 30초 열어 두어도 `/document` 요청은 1번이다.
- 네트워크 오류 · 5xx에서는 지금처럼 재시도한다.
- 404 상태의 기록 상세에서 기존 `bodyMd` 내용이 보인다. 빈 문단으로 가리지 않는다.
- 404 상태에서 본문 입력이 막혀 있고(`contenteditable`이 아님) 그 이유가 화면에 보인다.
  입력한 내용이 알림 없이 버려지는 일이 없다.
- 웹 플래그가 꺼져 있으면 기록 상세는 문서 세션을 열지 않고 같은 처리 결과를 보여 준다.
- `CareerEditorSession.test.ts`에 404 경로(재시도 없음 · 입력 처리)와 네트워크 오류 경로(재시도함) 테스트가 있다.

## 영향 범위

- 웹: `CareerEditorSession` · `useCareerEditorSession`, `CareerDocumentEditor`,
  `/career/records/[recordId]/page.tsx`, v2 문서 패널(`DocumentPanel`, 같은 세션을 씀)
- 패키지: `@expresso/editor`의 `markdownToCareerDocument`(현재 루트 진입점으로만 드러남)
- 백엔드 · 계약: 변경 없음
- 결정: 사용자(Nedian0Brien)

## 제약

- PR #83(`fix/editor-browser-uuid`)이 머지되지 않았다. 이 브랜치는 그 위에 쌓고, PR의 base를 그 브랜치로 둔다.
- v2가 켜진 상태의 편집 · 저장 · 재연결 동작은 바뀌지 않는다.
- 404는 세션 입장에서 "v2 꺼짐"과 "기록 없음"을 구분할 수 없다. 둘 다 "문서 세션 없음"으로 다룬다.

## 범위 밖

- 백엔드 문서 API · 플래그 기본값 변경, `deploy.sh`에서 웹 플래그를 채우는 일.
- 401 · 403 처리 방식 변경(지금처럼 재시도).
- v2 꺼짐 상태의 AI 제안 패널 · 에이전트 채팅 동작.

## 열린 질문

1. 404(문서 세션 없음) 상태의 본문을 어떻게 다루는가.
   - (A) 읽기 전용: 기존 `bodyMd`를 블록으로 바꿔 읽기 전용으로 보여 주고, "새 편집기가 꺼져 있어
     본문을 고칠 수 없습니다" 같은 안내를 둔다. 속성은 지금처럼 기존 기록 API로 고칠 수 있다.
     v2 꺼짐 상태의 카테고리 화면과 같은 수준이다.
   - (B) v1 저장: 본문 입력을 Markdown으로 바꿔 `PATCH /api/career/records/:id`의 `bodyMd`로 저장한다.
     v2 꺼짐 상태에서만 쓰는 두 번째 저장 경로와 블록 ↔ Markdown 왕복 변환이 생기고,
     웹에서 지금은 없는 v1 본문 편집 기능을 새로 만드는 일이다.

   답(2026-10-16, 사용자): (A) 읽기 전용으로 진행한다.
