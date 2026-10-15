---
title: v2 꺼짐 상태의 기록 상세 문서 세션 처리
slug: career-detail-v2-off
stage: plan
status: accepted
intent: .intent/intent_career-detail-v2-off.md
spec: .intent/spec_career-detail-v2-off.md
date: 2026-10-16
---

# v2 꺼짐 상태의 기록 상세 문서 세션 처리 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/features/career-editor/session/CareerEditorSession.ts` | `unavailable` 상태 · 404 종료 · 입력 무시 |
| `services/web/src/features/career-editor/session/CareerEditorSession.test.ts` | 404 · 네트워크 오류 · 503 테스트 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.tsx` | `CareerDocumentReadOnly`(속성 목록 · 안내 · 읽기 전용 본문) 추가, 세션 상태로 읽기 전용 · 편집기 본체 분기 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.module.css` | `.notice`를 `.loading` 규칙에 추가, 본문 열 안의 여백 |
| `services/web/src/features/career-editor/editor/CareerDocumentEditor.test.tsx` | `unavailable` 읽기 전용 렌더 테스트 |
| `services/web/src/app/(app)/career/records/[recordId]/page.tsx` | 웹 플래그가 꺼지면 읽기 전용 화면 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 세션 테스트를 먼저 쓴다(404 1회 · 입력 무시 · reject 재시도 · 503 재시도). 404 테스트가 지금 코드에서 실패하는지 본다.
2. 세션을 고친다 — `pnpm --filter @expresso/web exec vitest run src/features/career-editor/session` 통과.
3. `CareerDocumentReadOnly`를 `CareerDocumentEditor.tsx` 안에 만들고 `CareerDocumentEditor`를 바깥(세션 훅) · 본체(편집기 훅)로 나눈다.
   편집기 테스트에 `unavailable` 사례를 더한다 — `vitest run src/features/career-editor/editor` 통과.
4. 기록 상세 페이지에 웹 플래그 분기를 넣는다 — `pnpm --filter @expresso/web typecheck` 통과.
5. 웹 전체 테스트 · 타입 검사.
6. 화면 확인: 웹을 `CAREER_EDITOR_V2_ENABLED=true`로 다시 띄워(백엔드는 false) 재현 스크립트를 돌리고,
   웹 플래그를 빼고 한 번 더 돌린다. 스크린샷을 남긴다.

구현 중 바뀐 점: 읽기 전용 화면을 새 파일로 떼지 않았다. `categoryDefinitions`를 함께 써야 해서
따로 두면 두 파일이 서로를 가져오게 되기 때문이다. spec의 "새 파일" 대신 같은 파일에서 내보낸다.

## 가장 위험한 단계

3단계. 편집기를 둘로 나누면서 v2 켜짐 상태의 훅 순서 · `loadedVersion` 동기화 · 슬래시 메뉴 동작이 바뀔 수 있다.
본체 코드는 옮기기만 하고 고치지 않으며, 기존 편집기 테스트 4개가 그대로 통과하는지로 확인한다.
깨지면 분기를 본체 안의 조기 반환 대신 바깥 컴포넌트에만 두는 지금 설계로 되돌아가 diff를 줄인다.

## 검증

```
pnpm --filter @expresso/web typecheck
pnpm --filter @expresso/web test
node <scratchpad>/repro.mjs http://localhost:3141 <scratchpad>/after
```

화면: 개발 로그인 → `/career/records/:id`. 웹 플래그 켜짐 · 꺼짐 두 조합에서
`/document` 요청 수, 기존 `bodyMd` 표시, 본문 `contenteditable`, 안내 문구, 속성 저장(제목 변경 후 새로고침)을 본다.
