---
title: v2 꺼짐 상태의 기록 상세 문서 세션 처리
slug: career-detail-v2-off
stage: spec
status: accepted
intent: .intent/intent_career-detail-v2-off.md
date: 2026-10-16
---

# v2 꺼짐 상태의 기록 상세 문서 세션 처리 — 명세

## 요구사항

- [ ] `CareerEditorSession.bootstrap`이 404를 받으면 상태가 `unavailable`이 되고, 재연결 타이머를 걸지 않는다.
      `reconnectDelay: () => 0`으로 여러 번 flush해도 fetch 호출은 1번이고 소켓을 만들지 않는다.
- [ ] `unavailable`에서 `updateDocument`를 불러도 상태가 바뀌지 않고 `hasPendingUpdates()`가 `false`다.
- [ ] fetch가 reject하거나 5xx를 돌려주면 지금처럼 `offline`이 되고 다시 bootstrap한다(fetch 2번 이상).
- [ ] `CareerDocumentEditor`는 세션 상태가 `unavailable`이면 읽기 전용 화면을 그린다 —
      기록의 `bodyMd`가 블록으로 보이고, 본문 요소가 `contenteditable="false"`이며,
      서식 도구 · 블록 핸들 · 슬래시 메뉴 · 선택 영역 빠른 편집이 없고, 읽기 전용인 이유를 적은 안내가 있다.
- [ ] 웹 플래그(`careerEditorV2Enabled()`)가 꺼져 있으면 `/career/records/:id`는 문서 세션 없이
      같은 읽기 전용 화면을 그린다. `/document` 요청이 0번이다.
- [ ] 읽기 전용 화면에서도 속성 목록(`PropertyList`)은 그대로 있고 기존 기록 API로 저장된다.
- [ ] `bodyMd`가 빈 문자열이면 본문 자리에 빈 문단이나 "비어 있음" 문구를 띄우지 않는다.
- [ ] v2 켜짐 상태의 기존 세션 · 편집기 테스트가 그대로 통과한다.

## 설계

**세션** (`session/CareerEditorSession.ts`)

- `SessionStatus`에 `"unavailable"`을 더한다. 뜻은 "이 기록에 문서 세션이 없다"이다.
  404는 v2 꺼짐과 기록 없음을 구분할 수 없으므로 이름에 v2를 넣지 않는다.
- `bootstrap()`에서 `response.status === 404`이면 `document`를 만들지 않고
  `setSnapshot({ status: "unavailable" })` 뒤 돌아간다. 다른 비정상 응답과 예외는 지금 catch 경로를 그대로 탄다.
- `updateDocument`는 `unavailable`이면 아무것도 하지 않는다. 그래서 pending이 쌓이지 않고,
  `useCareerEditorSession`의 풀은 지금 규칙대로 30초 뒤 세션을 정리한다.

**읽기 전용 화면** (새 파일 `editor/CareerDocumentReadOnly.tsx`)

- 입력: `mode`, `record?`, `category?`. 세션을 쓰지 않는다.
- 본문은 기존 `careerEditorExtensions` · `careerDocumentToTiptap`으로 Tiptap을 `editable: false`로 띄운다.
  `bodyMd` → 블록 변환은 `@expresso/editor` 루트의 `markdownToCareerDocument`를 쓴다
  (`agent-chat/ResourcePreview.tsx`가 같은 진입점에서 `careerDocumentToMarkdown`을 이미 가져다 쓴다).
- 표시 순서: 속성 목록 → 안내 → 본문. 바깥 `section`과 `.content`는 편집기와 같은
  `CareerDocumentEditor.module.css` 클래스를 써서 여백 · 글꼴이 같다.
- 안내 문구: "문서 편집기가 꺼져 있어 본문을 읽기만 할 수 있습니다." 스타일은 기존 `.loading` 규칙을 같이 쓰는 `.notice`.
  새 토큰이나 값을 만들지 않는다.

**편집기** (`editor/CareerDocumentEditor.tsx`)

- 바깥 컴포넌트가 `useCareerEditorSession`만 부르고, `unavailable`이면 `CareerDocumentReadOnly`를,
  아니면 지금의 편집기 본체(`useEditor` 등 훅을 가진 내부 컴포넌트)를 그린다. 훅 호출 순서를 조건에 따라 바꾸지 않기 위해 나눈다.
  `DocumentPanel`(v2 패널)도 이 컴포넌트를 쓰므로 웹 v2 켜짐 · 백엔드 v2 꺼짐 조합에서도 같은 처리를 받는다.

**페이지** (`app/(app)/career/records/[recordId]/page.tsx`)

- 카테고리 페이지와 같은 방식으로 `careerEditorV2Enabled()`를 읽어 꺼져 있으면 `CareerDocumentReadOnly`를, 켜져 있으면 지금처럼 `CareerDocumentEditor`를 그린다.

## 버린 대안

- (B) v1 저장 — intent 단계에서 사용자가 (A)를 골랐다.
- 404 상태에서 `offline`을 유지한 채 재시도 간격만 늘리기 — 요청이 줄 뿐 끝나지 않고, 입력 유실도 그대로다.
- 401 · 403 · 모든 4xx를 종료 상태로 묶기 — intent 범위 밖. 이번에는 404만 종료로 본다.
- 읽기 전용 본문을 Tiptap 없이 `<p>{bodyMd}</p>`로 그리기(`LegacyCareerBrowser` 방식) — 같은 화면 안에서
  v2 편집기와 제목 · 목록 · 코드 블록 모양이 달라진다. 변환기와 확장이 이미 있으므로 그것을 쓴다.
- 페이지 분기만 두고 세션은 그대로 두기 — 웹 · 백엔드 플래그가 어긋나면 그대로 재현된다.

## 함정

- 웹은 `@expresso/editor`를 `dist`로 가져온다. PR #83 수정이 `dist`에 있어야 `markdownToCareerDocument`가
  브라우저에서 돈다(같은 `randomUUID` 문제). 이 브랜치는 #83 위에 있다.
- `useEditor`의 `content`는 처음 만들 때만 쓰인다. 읽기 전용 화면은 `record.id`를 `key`로 받아 기록이 바뀌면 새로 만든다.
- 테스트에서 fetch가 404 `Response`를 돌려줄 때 본문이 없으므로 `response.json()`을 부르지 않아야 한다.
- 숨겨진 Claude 브라우저 창은 rAF가 멈추므로 화면 확인은 headless Chrome 스크립트로 한다.

## 완료 기준

- `pnpm --filter @expresso/web test`와 `pnpm --filter @expresso/web typecheck` 통과. 새 테스트:
  세션 404(재시도 없음 · 입력 무시) · 네트워크 오류 및 503(재시도), 편집기 `unavailable` 읽기 전용 렌더.
- 개발 서버(웹 3141 · API 4041, 백엔드 v2 꺼짐)에서 headless Chrome으로
  - 웹 플래그 켜짐: 30초 동안 `/document` 404가 1번, 기존 `bodyMd`가 보이고, 본문이 `contenteditable="false"`, 안내가 보인다.
  - 웹 플래그 꺼짐: `/document` 요청 0번, 같은 화면.
  - 스크린샷을 남긴다.
