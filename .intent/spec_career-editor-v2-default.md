---
title: 커리어 편집기 v2 기본 활성화와 이전 기록 화면 삭제
slug: career-editor-v2-default
stage: spec
status: accepted
intent: .intent/intent_career-editor-v2-default.md
date: 2026-10-25
---

# 커리어 편집기 v2 기본 활성화와 이전 기록 화면 삭제 — 명세

## 요구사항

- [ ] 웹 코드 어디에서도 `CAREER_EDITOR_V2_ENABLED`를 읽지 않는다. `/career/[categorySlug]`는 늘 `CareerBrowser`를, `/career/records/[recordId]`는 늘 `CareerDocumentEditor`를 그린다.
- [ ] `LegacyCareerBrowser.tsx`, `feature-flag.ts`, `feature-flag.test.ts`가 없고, 카테고리 `page.module.css`에 어느 파일도 쓰지 않는 클래스가 남지 않는다.
- [ ] API `loadRuntimeConfig`에 `CAREER_EDITOR_V2_ENABLED` 키가 없다. 운영 `.env`에 `CAREER_EDITOR_V2_ENABLED=false`가 남아 있어도 기동되고 무시된다(스키마가 모르는 키는 버린다).
- [ ] `api/main.ts`가 `careerDocumentService`를 늘 `buildApp`에 넘겨 문서 REST·WebSocket이 등록된다.
- [ ] `deploy.sh`가 서버 `.env`에 이 값을 더하지 않는다. `.env.example`에 이 값이 없다.
- [ ] 문서 bootstrap 404(`unavailable`)는 이제 기록이 없다는 뜻이다. 편집기는 이전 본문을 읽기 전용으로 띄우지 않고 "이 기록을 찾을 수 없습니다" 안내를 띄운다. `CareerDocumentReadOnly`와 "문서 편집기가 꺼져 있어" 문구는 없어진다.
- [ ] Playwright에서 v2 꺼짐용 API(4101) · 웹(3101) 서버와 그 시나리오가 없어지고, 남은 서버 명령에서 이 값을 넘기지 않는다.
- [ ] 운영 문서(출시 체크리스트 · 편집기 설계 노트)가 설정값 삭제와 되돌리기 방법을 적는다.

## 설계

- 웹: `page.tsx`(카테고리)에서 `v2Enabled` 분기와 `LegacyCareerBrowser` import를 지우고 `career.viewConfigurations`를 늘 부른다. 헤더 오른쪽 문구는 v2 쪽 `editedLabel`만 남긴다. 기록 상세 `page.tsx`는 `CareerDocumentEditor`만 그린다.
- 편집기: `CareerDocumentEditor`의 `unavailable` 분기를 같은 `section`(`aria-label="커리어 문서"`) 안의 `styles.notice` 한 줄로 바꾼다. 404를 낸 근거는 서버의 `career record not found`(`career-editor/service.ts` bootstrap)뿐이다. `CareerEditorSession.ts`의 `unavailable` 주석을 이 뜻으로 고친다.
- API: `runtime-config.ts`에서 키 · `careerEditorV2Enabled` 필드 · 매핑을 지운다. `buildApp`의 `careerDocumentService?`는 다른 서비스처럼 선택 인자로 둔다(단위 테스트가 부분 조립을 쓴다).
- 스타일: 이전 화면 삭제 뒤 카테고리 `page.module.css`의 클래스마다 `styles.<이름>` 사용처를 찾아, 쓰이지 않는 규칙을 지운다. `loading.tsx`와 기록 상세가 쓰는 클래스는 남는다.

## 버린 대안

- 기본값만 `true`: 운영 `.env`의 `false` 줄이 남아 API가 꺼지고, 이전 화면이 없는 웹이 404를 받는다.
- `CareerDocumentReadOnly`를 404 안내로 계속 쓰기: 기록이 없는데 지난 본문을 보여 주고 "편집기가 꺼져 있다"는 틀린 이유를 댄다.

## 함정

- `test/support/agent-chat-preview.ts`가 `CAREER_EDITOR_V2_ENABLED: "true"`를 넘긴다. 키가 사라지면 무해하지만 지운다.
- `next.config`나 다른 서비스(mobile · desktop)에 같은 값이 없는지 grep으로 한 번 더 본다.
- 졸업작품 설계서(`docs/design-doc/05` · `07`, `docs/졸업작품-설계서.html`)는 2026-09-28 시점 경로 수를 센 기록이다. 경로 수 재집계가 필요해 이번 범위에서 고치지 않고 보고에 적는다.

## 완료 기준

- `git grep -n "CAREER_EDITOR_V2_ENABLED\|careerEditorV2Enabled\|LegacyCareerBrowser" -- services scripts`가 남은 `.env`의 값을 무시하는지 보는 `runtime-config.test.ts` 두 줄만 낸다.
- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` · `pnpm --filter @expresso/web exec playwright test` 통과.
- 설정값 없이, 또 API에 `CAREER_EDITOR_V2_ENABLED=false`를 넣고 띄운 서버에서 `/career/project`가 v2 갤러리를, 기록 클릭이 v2 문서 패널을, `/career/records/:id`가 고칠 수 있는 본문을 보인다.
