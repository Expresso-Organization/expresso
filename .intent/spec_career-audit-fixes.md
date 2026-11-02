---
title: 커리어 기록 감사 결함 전체 수정
slug: career-audit-fixes
stage: spec
status: accepted
intent: .intent/intent_career-audit-fixes.md
date: 2026-11-02
---

# 커리어 기록 감사 결함 전체 수정 — 명세

기준 커밋은 `origin/main` `c2f0a694`(#141 병합 뒤)다. 결함 번호는 감사 보고서(H1–H13, 중간 · 낮음)를 따른다.

## 요구사항

- [ ] R1 운영 `/v1/` WebSocket 핸드셰이크가 101이다. `deploy.sh`가 배포 끝에 이를 확인하고 실패하면 비정상 종료한다. (H1)
- [ ] R2 `/career/records/:id`가 휠로 끝까지 스크롤된다. (H2)
- [ ] R3 「AI 편집」 메뉴 항목이 화면에 보이고 누를 수 있다(가시성 단언 E2E). (H3)
- [ ] R4 세션 토큰이 만료된 뒤 끊겨도 다시 bootstrap해 연결하고, 밀린 업데이트가 저장된다. 재시도 간격은 `ready`를 받기 전까지 줄어들지 않는다. 저장 안 된 입력이 있으면 `beforeunload` 경고가 뜬다. 상태 표시는 오프라인 · 저장 중 · 충돌 · 오류를 실제 상태대로 보인다. (H7, 중간 동기화)
- [ ] R5 편집기 밖 본문 쓰기(인터뷰 재답변, `PATCH bodyMd`)는 Yjs 문서 업데이트로 들어가 열린 편집기에 즉시 반영되고, 쓰기 직전 상태가 이력 「외부 변경 전」으로 남는다. 다음 bootstrap이 편집기 본문을 덮지 않는다. (H4)
- [ ] R6 Markdown → 문서 변환은 이스케이프 없이 인라인 서식 · 링크 · 중첩 목록 · 표를 보존한다. 그 결과 `bodyMd`가 원문과 같은 글을 담는다. (H6)
- [ ] R7 AI 적용은 명령이 가리키는 블록만 바꾸고 나머지 블록 JSON은 그대로다. 되돌리기 뒤 재적용이 실제로 바뀐다. 제안 이후 사람이 고친 대상 블록은 충돌로 남는다. AI 속성 변경은 `validateCareerProperties`를 지난다. (H5, 중간 AI)
- [ ] R8 이력 복원은 확인 뒤 실행되고 직전 상태를 「복원 전」 이력으로 남긴다. (H12)
- [ ] R9 5만 자를 넘는 글 조각이 있어도 bootstrap · 목록이 성공한다. 본문이 상한을 넘으면 편집기가 입력을 막고 이유를 보인다. (H13)
- [ ] R10 8MB까지 그림 업로드가 성공한다. 슬래시 메뉴에 계약이 받지 않는 파일 · 동영상 · 오디오가 없다. (중간 업로드)
- [ ] R11 기록 101건 카테고리에서 속성 변환 · 삭제 · 복원 · 기본값이 Worker에서 끝나고, 그 뒤 PATCH가 성공한다. (H9)
- [ ] R12 retention이 `purgeTrashedCareerRecord`로 지우고, 인용 중인 기록은 건너뛰며, 문서 스냅샷 · 업데이트 · 이력 · 관계 edge · AI 제안도 지운다. 삭제 전 사용처가 있으면 확인을 묻는다. (H10, H11)
- [ ] R13 표 셀이 계산 값을 보이고, 숫자 셀 재입력이 저장되고, 팝업이 Escape로 닫히고, 키보드로 33행 이상 이동한다. 복제는 지금 본문, 이동 미리보기는 속성 이름을 쓴다. 갤러리 표지가 쓰인다. (중간 뷰)
- [ ] R14 서버: 뷰 이름 중복 409, Zod 오류 400, 시각 정렬 커서, 관계 필터, 이동 뒤 계산 · 관계 정리, 휴지통 뒤 롤업 재계산, 계산 Worker의 불필요한 version 증가 제거, 속성 복원 라우트, 스냅샷 인덱스. (중간 백엔드)
- [ ] R15 낮음: 화면 설명문 · 동작 없는 꺾쇠 · 탭 제거, 「아래에 새 기록」 위치, 패널 Escape · 포커스, 모듈 경계 import, 손으로 쓴 요청 스키마를 계약으로, production 비밀값 기본값 차단, 옛 `.tiptap` 선택자 제거.
- [ ] R16 `markdown.test.ts:20`, `e2e/career-editor.spec.ts:65`의 잘못된 기대값을 고치고, R1–R14 재현 시험을 더한다.

## 설계

브랜치 `fix/career-audit` 하나에 단계마다 커밋을 나눠 쌓고 PR 하나로 올린다. 단계가 끝날 때마다 푸시한다.

1. **운영 연결(R1).** `infra/nginx/expresso.ai.kr.conf`에 `map $http_upgrade $connection_upgrade`를 두고 `location /v1/`에 `Upgrade` · `Connection $connection_upgrade`를 넣는다. `scripts/operations/deploy.sh`의 바깥 확인에 `curl --http1.1` 핸드셰이크 101 확인을 더한다. 서버 적용 절차는 `docs/operations/DEPLOYMENT.md`에 적는다.
2. **화면 차단(R2 · R3).** 기록 페이지 `page.module.css`의 `.page`를 감싸는 스크롤 영역(`flex:1; min-height:0; overflow:auto`)을 둔다. 홈 · 공고가 쓰는 `.content` 관례를 재사용한다. AI 메뉴는 `createPortal`로 `body`에 붙이고 단추 위치로 `position: fixed` 배치한다(BlockNote 툴바의 `overflow`를 피함).
3. **세션(R4 · R9 일부).** `CareerEditorSession`: 소켓이 `CLOSE.auth`로 닫히면 토큰을 버리고 `bootstrap()`을 다시 부른다. 다시 받은 상태는 지금 `Y.Doc`에 `Y.applyUpdate`로 합친다(편집기 문서를 바꾸지 않음). `reconnectAttempt`는 `ready`를 받을 때 0으로 돌린다. 서버가 크기 · 프로토콜로 거절하면 상태를 `error`로 두고 같은 pending을 반복 전송하지 않는다. `beforeunload`는 pending · 미전송 묶음이 있을 때만 건다. `session-registry`는 sessionId 대신 소켓마다 발급한 등록 토큰으로 지운다.
4. **본문 원본(R5 · R6 · R8 · R9).** `CareerDocumentService`에 `replaceBodyFromMarkdown(userId, recordId, markdown, summary)`를 둔다. 직전 스냅샷을 이력으로 남긴 뒤 `appendServerUpdate`로 바꾸고 소켓으로 발행한다. 인터뷰(`interview/mongo-answers.ts`)와 `career/service.ts updateRecord`의 BlockNote 기록 본문 쓰기가 이 진입점(`career-editor/index.ts`)을 쓴다. bootstrap의 해시 비교 덮어쓰기는 남기되 덮기 전에 「외부 변경 전」 이력을 남긴다. Markdown 읽기는 서버 BlockNote 편집기의 `tryParseMarkdownToBlocks`(0.56 `BlockNoteEditor.d.ts:793`)로 바꾸고, 스냅샷 없는 기록은 v1을 거치지 않고 BlockNote 스냅샷을 바로 만든다. `blockNoteToCareerDocument`는 5만 자를 넘는 글을 여러 span으로 나눈다. 투영은 `bodyMd`를 계약 상한(20만 자) 안에서 블록 경계로 자른다. 복원은 `restoreRevision`에서 복원 전 스냅샷을 이력으로 남기고, 웹 `RevisionHistory`에 확인 단계를 둔다.
5. **AI 적용(R7).** `ai-proposals.ts apply`: v1 사본에 명령을 적용한 뒤, `changedCommandIds`가 가리키는 블록만 v1 결과를 BlockNote로 바꾸고 나머지는 현재 BlockNote 블록을 그대로 둔 목표 배열을 만든다. 제안 생성 때 대상 블록의 기준 해시를 저장하고 적용 때 비교해 다르면 `conflicted`. 되돌리기는 상태를 `undone`으로 바꾸고 적용은 `ready | undone`에서 허용한다. 속성 변경은 `validateCareerProperties`로 검사한다. 어댑터는 블록 규칙을 `check`로 넘겨 걸린 조각만 같은 대화에서 고쳐 받는다(`platform/ai/fixes.ts` 규칙).
6. **업로드 · 메뉴(R10).** `next.config.ts`에 `serverActions.bodySizeLimit`을 미디어 상한(8MB)보다 조금 크게 둔다. `BlockNoteBody` 슬래시 메뉴에서 file · video · audio 항목을 거른다.
7. **백엔드 정합성(R11 · R12 · R14).** `worker/main.ts`에 `career.property-conversion | -default | -deletion | -restoration` 처리기를 두고, `property-schema.ts`의 인라인 변환 함수를 100건 단위로 재사용한다. retention은 대상 ID를 모아 `purgeTrashedCareerRecord`를 부르고, 그 함수는 문서 · 이력 · 관계 · AI 제안도 지운다. 나머지 R14 항목은 각 파일에서 고친다.
8. **화면 정합성 · 낮음(R13 · R15).** 감사 보고서에 적힌 파일에서 고친다. 표 셀은 `computedProperties`를 먼저 읽는다.
9. **회귀 시험(R16).** 각 단계 PR이 자기 재현 시험을 포함한다. 마지막에 E2E 전체를 돌린다.

## 버린 대안

- 저장 계약(v1)에 글자색 · 정렬 · 토글을 넣기: AI 적용이 대상 블록만 바꾸면 다른 블록은 v1을 거치지 않는다. 계약 확장은 필요 없다.
- 업로드를 별도 Route Handler로 옮기기: 설정 한 줄로 같은 효과다.
- 단계마다 PR을 따로 쌓기(stacked PR): 앞 PR이 병합되기 전 뒤 PR의 기준이 계속 바뀐다. 커밋을 단계별로 나눠 같은 효과를 얻는다.

## 함정

- `bootstrap` 재호출이 편집기의 `Y.Doc`을 새로 만들면 BlockNote가 다시 그려지고 커서가 사라진다. 상태만 합친다.
- 인터뷰 · 정리(record-cleanup)는 기록 `version`으로 동시성을 본다. 문서 쓰기는 `documentVersion`이다. 둘을 같은 트랜잭션에서 올린다.
- `tryParseMarkdownToBlocks`는 서버에서 jsdom 없이 도는지 확인해야 한다(`blocknote-document.ts`가 이미 서버 편집기를 쓴다).
- 운영 nginx는 저장소 파일과 다를 수 있다(와일드카드 인증서를 손으로 바꿨다). 서버 파일을 직접 고쳐야 한다.
- 이 변경은 #153과 같은 파일을 고친다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra`, `pnpm --filter @expresso/web exec playwright test e2e/career-editor` 통과.
- 검증 서버에서 감사 보고서 재현 절차를 다시 따라 결함이 나오지 않는다.
- 운영 핸드셰이크 `curl -4 --http1.1 ... /v1/career/records/<id>/session`이 101이다(서버 적용 뒤).
