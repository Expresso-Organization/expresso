---
title: 편집기 패키지 브라우저 UUID 생성 오류 수정
slug: editor-browser-uuid
stage: spec
status: accepted
intent: .intent/intent_editor-browser-uuid.md
date: 2026-10-16
---

# 편집기 패키지 브라우저 UUID 생성 오류 수정 — 명세

## 요구사항

- [ ] `packages/editor/src/document.ts` · `markdown.ts`가 `node:crypto`를 import하지 않고 `globalThis.crypto.randomUUID()`로 블록 ID를 만든다.
- [ ] `packages/editor/src`의 런타임 소스(`*.test.ts`, `__fixtures__` 제외)에 `node:` 내장 모듈 import가 없음을 단언하는 테스트가 있고, 수정 전 코드에서 실패한다.
- [ ] `services/web`에 jsdom 환경 테스트가 있다. `node:crypto`를 `randomUUID`가 없는 모듈로 바꿔 둔 상태에서 `createEmptyCareerDocument()` · `markdownToCareerDocument()`가 UUID 형식 ID를 가진 문서를 돌려준다. 수정 전 dist로는 `randomUUID is not a function`으로 실패한다.
- [ ] `pnpm typecheck` · editor · web · backend 테스트가 통과한다.
- [ ] `CAREER_EDITOR_V2_ENABLED=false` 백엔드에 붙은 웹에서 기록 상세가 빈 문단 편집기로 열리고, 콘솔에 `randomUUID` 오류가 없다.

## 설계

- 두 파일의 `import { randomUUID } from "node:crypto"`를 지우고 호출부를 `globalThis.crypto.randomUUID()`로 바꾼다. 같은 패키지 테스트(`commands.test.ts`, `document.test.ts`)가 이미 전역 `crypto.randomUUID()`를 쓰고 있어 타입(`@types/node`의 전역 `crypto` 선언)도 그대로 통과한다.
- 가드 테스트는 `packages/editor/src/runtime-imports.test.ts`에 둔다. `node:fs`로 `src`를 재귀로 읽어 정규식으로 `from "node:` · `import("node:`를 찾는다. 테스트 파일 자체는 Node에서만 돌므로 `node:fs` 사용이 문제되지 않는다.
- 웹 테스트는 `services/web/src/features/career-editor/editor/browserRuntime.test.ts`에 둔다. `// @vitest-environment jsdom`, `vi.mock("node:crypto", () => ({ default: {} }))`로 브라우저 번들의 crypto-browserify 상황(randomUUID 없음)을 재현한다. 수정 전 main에서 이 구성으로 실패하는 것을 확인했다.

## 버린 대안

- `next.config.ts`의 `transpilePackages`에 editor 추가 — 소스에서 `node:crypto`를 가져오는 한 Turbopack은 똑같이 polyfill로 바꾼다. 원인을 해결하지 못한다.
- `crypto.randomUUID`가 없을 때 `getRandomValues`로 만드는 폴백 — 지원 대상(secure context) 밖을 위한 코드다. intent에서 범위 밖으로 정했다.
- jsdom 환경에서 두 함수를 호출만 하는 테스트 — vitest는 Node 위에서 돌아 `node:crypto`가 살아 있으므로 수정 전에도 통과한다. 회귀를 잡지 못한다.

## 함정

- 웹은 editor를 `dist`로 가져온다(`exports.default` = `./dist/*.js`). 소스 수정 뒤 `pnpm --filter @expresso/editor build`를 돌리지 않으면 웹 테스트와 개발 서버가 옛 코드를 본다. web CI(`web-ci.yml` 「계약 · 편집기 빌드」)는 editor를 먼저 짓는다.
- `randomUUID`는 secure context 전용이다. 개발 출처 `127.0.0.1` · `localhost`와 운영 HTTPS는 해당한다.
- 웹 테스트의 `vi.mock`은 dist 모듈에도 닿는다(실측). 모킹 모듈은 `default` 키가 있어야 vitest가 받아들인다.

## 완료 기준

```
# 가드·웹 테스트를 먼저 추가해 수정 전 실패를 확인한 뒤 소스를 고치고 editor를 다시 짓는다
pnpm --filter @expresso/editor test        # 전부 통과
pnpm --filter @expresso/web test           # 전부 통과
pnpm --filter @expresso/backend test       # 전부 통과
pnpm typecheck                             # 오류 없음
```

화면: 웹 3131 · API 4031(전용 DB · QUEUE_PREFIX, `CAREER_EDITOR_V2_ENABLED=false`)에서 `/career/records/:id`를 열어 편집기와 빈 문단이 보이는 것을 스크린샷으로 남긴다.
