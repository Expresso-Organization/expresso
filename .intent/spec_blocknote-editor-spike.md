---
title: 커리어 기록 본문 BlockNote 교체 검증
slug: blocknote-editor-spike
stage: spec
status: accepted
intent: .intent/intent_blocknote-editor-spike.md
date: 2026-10-28
---

# 커리어 기록 본문 BlockNote 교체 검증 — 명세

## 요구사항

- [ ] 기록 패널(`DocumentPanel`)과 전체 페이지(`/career/records/[recordId]`) 본문이 BlockNote 0.56.0 편집기로 열린다.
- [ ] `/` 블록 메뉴, 블록 손잡이 끌어 옮기기, 선택 서식 툴바가 BlockNote 기본 UI로 동작한다.
- [ ] 머리글 행 표, `Shift+Enter` 줄바꿈, 밑줄, 구분선, 콜아웃(커스텀 블록)이 새로고침 뒤 같은 모양으로 열린다.
- [ ] 본문 이미지를 놓으면 `POST /v1/media`로 올라가고 `/v1/media/:id` 주소로 보인다.
- [ ] 두 탭에서 서로 다른 문단을 동시에 고치면 두 수정이 모두 저장된다. 연결이 끊긴 동안의 입력은 재연결 뒤 저장된다.
- [ ] bootstrap 계약은 추가 필드(`editor` · `stateBase64`)만 늘린다. v2 기록의 `document`는 Markdown 투영에서 만든 v1 모양 사본이라 기존 소비자(에이전트 채팅)가 그대로 읽는다.
- [ ] 저장 통로는 기존 WebSocket 프레임(`sync` · `update` · `ack`)과 `career_document_updates` 원장을 그대로 쓴다.
- [ ] 본문 저장 뒤 3초 안에 `career_records.bodyMd`가 BlockNote 본문의 Markdown으로 바뀐다.
- [ ] 기존 v1 문서(`schemaVersion: 1`)를 처음 열면 BlockNote 문서(`schemaVersion: 2`)로 바뀐다. 옮기기 보고 스크립트가 기록별 블록 종류 대응과 사라진 글자 수를 낸다.
- [ ] 보고서 `docs/architecture/career-editor-blocknote-spike.md`에 위 결과, 교체 판단, 남는 작업이 있다.

## 설계

**문서 원본.** Yjs 문서의 XmlFragment `document-store`가 원본이다(BlockNote 기본). v1처럼 JSON 문자열을 Map 키에 넣지 않는다. 그래서 병합은 y-prosemirror가 글자 단위로 한다.

**스냅샷.** `career_document_snapshots`에 `schemaVersion: 2`로 쓴다. `content`에는 BlockNote 블록 JSON, 새 필드 `state`에는 `Y.encodeStateAsUpdate` 바이트를 둔다. 0006 검증 규칙은 추가 필드를 막지 않아 마이그레이션이 필요 없다. `CareerDocumentSnapshotDoc`에 `state?: Binary`를 더한다. 복원은 `state` + 이후 업데이트를 한 `Y.Doc`에 적용한다. `content`에서 Yjs를 다시 만들지 않는다. 다시 만들면 클라이언트 ID가 달라져 대기 중 업데이트가 중복 삽입된다.

**v1 → v2 옮기기.** `bootstrap`이 v1 스냅샷을 만나면 기존 `reconstructYDocument`로 `CareerDocument`를 복원한다. 새 변환기 `careerDocumentToBlockNote`가 BlockNote 블록으로 바꾼다. `ServerBlockNoteEditor.blocksToYDoc`로 Yjs 상태를 만들고 v2 스냅샷을 한 트랜잭션에서 쓴다. 대응표는 다음과 같다.

| v1 | BlockNote |
|---|---|
| paragraph · heading1–3 · blockquote · code · horizontalRule | paragraph · heading(level) · quote · codeBlock · divider |
| bulletList / orderedList / taskList의 listItem | bulletListItem · numberedListItem · checkListItem(중첩은 children) |
| table · tableRow · tableCell · tableHeader | table(`tableContent`, 머리글 행 수 보존) |
| image · file | image · file(`url: /v1/media/{mediaId}`) |
| callout | 커스텀 `callout` 블록 |
| evidence · 알 수 없는 블록 | 원문을 담은 paragraph. 보고서에 손실로 센다 |
| mark bold · italic · strike · code · link | styles bold · italic · strike · code, link 인라인 |

**웹.** `CareerDocumentEditor`의 본문 자리를 새 `BlockNoteBody`로 바꾼다. `next/dynamic`(`ssr: false`)로 불러온다. UI 변형은 `@blocknote/ariakit`을 쓴다. Mantine이나 Tailwind 의존을 새로 들이지 않고, `--bn-*` 변수를 `tokens.css`의 `--ex-*`에 연결한다. 협업은 0.56 방식대로 `extensions: [CollaborationExtension({ fragment: doc.getXmlFragment("document-store"), user })]`로 켠다(`@blocknote/core/yjs`). `provider`는 선택이라 넘기지 않는다(`YCursorPlugin.ts` 74행 확인). 머리글 행은 `tables: { headers: true }`로 켠다. 콜아웃은 슬래시 메뉴에 항목을 더하고, 내보내기에서는 인용으로 쓴다. 전송은 `CareerEditorSession`이 맡는다. `Y.Doc`의 `update` 이벤트를 받아 원격 출처가 아닌 것만 기존 `update` 프레임으로 보낸다. 받은 프레임은 원격 출처로 `Y.applyUpdate`한다. 300ms 동안 모인 업데이트는 `Y.mergeUpdates`로 하나로 보낸다.

**`bodyMd` 투영.** `appendUpdate`가 커밋된 뒤 기록별로 2초 debounce 타이머를 건다. 타이머가 돌면 문서를 복원하고 `blocksToMarkdownLossy` 결과를 `bodyMd`에 쓴다. 단일 API 프로세스 가정이다. 운영용 방식(outbox · Worker)은 보고서에 적는다.

**이미지.** 웹에는 미디어 프록시 라우트가 없고 포트폴리오 편집은 서버 액션으로 올린다(`edit/[portfolioId]/media-actions.ts`). 같은 방식으로 커리어 편집기 서버 액션을 두고 `media.upload`로 `POST /v1/media`를 부른다. BlockNote `uploadFile`은 이 액션이 돌려준 `/v1/media/{id}` 주소를 쓴다. 주소 만드는 법은 `components/portfolio/Media.tsx`를 따른다.

## 버린 대안

- `@blocknote/mantine`: Mantine 런타임과 CSS가 들어오고 토큰 체계와 따로 논다.
- `@blocknote/shadcn`: Tailwind 4가 웹에 있지만 저장소 규칙은 CSS Modules다.
- `y-websocket` 같은 기성 provider: 기존 인증(`ex_session` · sessionToken) · ack · 원장을 다시 만들어야 한다.
- `content` JSON으로 Yjs를 매번 다시 만드는 방식: 위 「스냅샷」의 중복 삽입 문제.

## 함정

- `@blocknote/server-util`은 `react` · `react-dom` · `jsdom`을 요구한다. 백엔드에 처음 들어오는 의존이다. 보고서에 비용으로 적는다.
- AI 제안(`ai-proposals.ts`)과 압축(`compaction.ts`), 단건 조회(`career/service.ts` `getRecord`), `agent-chat/requirement-review.ts`는 v1 복원을 쓴다. 이번에는 v2 기록에서 이 경로가 실패하지 않게 v2 분기만 둔다. AI 제안 생성 · 적용은 v2에서 409로 막는다.
- BlockNote는 0.x다. 버전을 `0.56.0`으로 고정한다.
- 숨은 브라우저 창에서는 rAF가 멈춘다. 동시 편집 확인은 탭 두 개를 앞에 두고 하거나 headless Chrome으로 한다.

## 완료 기준

```bash
pnpm typecheck
pnpm --filter @expresso/backend test -- src/modules/career-editor
pnpm --filter @expresso/web test -- src/features/career-editor
cd services/backend && node --env-file=.env --import tsx src/modules/career-editor/spike-migrate-report.ts   # 기록별 대응표 · 손실 글자 수
```

화면은 검증 서버(`blocknote-spike.localhost:3160`)에서 요구사항 순서대로 확인하고 스크린샷을 보고서에 붙인다.
