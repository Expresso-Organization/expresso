---
title: 편집기 패키지 브라우저 UUID 생성 오류 수정
slug: editor-browser-uuid
stage: plan
status: accepted
intent: .intent/intent_editor-browser-uuid.md
spec: .intent/spec_editor-browser-uuid.md
date: 2026-10-16
---

# 편집기 패키지 브라우저 UUID 생성 오류 수정 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/editor/src/document.ts` | 수정 — `node:crypto` import 제거, `globalThis.crypto.randomUUID()` |
| `packages/editor/src/markdown.ts` | 수정 — 같은 교체 |
| `packages/editor/src/runtime-imports.test.ts` | 신규 — 런타임 소스의 `node:` import 금지 가드 |
| `services/web/src/features/career-editor/editor/browserRuntime.test.ts` | 신규 — `node:crypto`에 randomUUID가 없는 jsdom 환경에서 두 함수 호출 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 두 테스트를 추가하고 수정 전 코드로 돌린다 — 가드는 `document.ts` · `markdown.ts` 두 곳을 지목하며 실패, 웹 테스트는 `randomUUID is not a function`으로 실패.
2. 두 소스를 고치고 `pnpm --filter @expresso/editor build` — `grep -n "node:crypto" packages/editor/dist/*.js`가 비어 있다.
3. editor · web · backend 테스트와 `pnpm typecheck` — 전부 통과.
4. 화면 확인 — 전용 DB `expresso_editor_uuid`, `QUEUE_PREFIX=expresso-editor-uuid`, `CAREER_EDITOR_V2_ENABLED=false`, API 4031 · 웹 3131로 띄우고 개발 로그인 뒤 기록을 하나 만들어 `/career/records/:id`를 연다. 편집기와 빈 문단, 콘솔 오류 없음을 확인하고 스크린샷을 남긴다. Claude 브라우저 창이 숨겨져 있으면 rAF가 멈춰 편집기 마운트가 늦어 보이므로 Playwright headless Chrome(`channel: "chrome"`)으로 잰다. 같은 서버에서 editor 두 파일만 main 버전으로 지은 dist로도 한 번 돌려 실패가 재현되는지 확인한다.
5. 구현 커밋 `fix: 편집기 패키지 브라우저 UUID 생성 오류 수정`, 푸시, PR.

## 가장 위험한 단계

4단계. 워크트리 전용 백엔드를 띄우려면 `.env`와 마이그레이션이 필요하고, 공유 DB를 건드리면 다른 브랜치 서버와 섞인다. 전용 DB와 QUEUE_PREFIX를 쓰고 워커는 띄우지 않는다(기록 상세 확인에 큐 소비자가 필요 없음). 끝나면 띄운 프로세스를 내리고 전용 DB는 남겨 둔다.

소스 변경 자체는 두 줄 교체라 되돌리기는 커밋 revert 하나로 된다.

## 검증

```
pnpm --filter @expresso/editor test
pnpm --filter @expresso/web test
pnpm --filter @expresso/backend test
pnpm typecheck
```

UI: 웹 3131의 `/career/records/:id` — 편집기 본문이 그려지고 "문서를 불러오고 있습니다."가 남아 있지 않다. 네트워크에서 `GET /api/career/records/:id/document`가 404인 것도 함께 본다(v2 꺼짐 확인).
