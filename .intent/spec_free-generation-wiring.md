---
title: 자유 생성의 정리본 · 디자인 지침 · 배치 자유 방식 연결
slug: free-generation-wiring
stage: spec
status: accepted
intent: .intent/intent_free-generation-wiring.md
date: 2026-11-15
---

# 자유 생성의 정리본 · 디자인 지침 · 배치 자유 방식 연결 — 명세

## 요구사항

- [ ] API · Worker의 `FormatRoutingPageGenerator`가 `html` 방식에 `BriefedPageGenerator({ refine: true, designSkill, styleMode: "tokens" })`를 쓴다.
- [ ] 디자인 지침 본문이 저장소 안의 모듈에서 오고, 그 해시가 실험 기록(`run.json`의 `skillSha256`)과 같다.
- [ ] 새 방식의 지면은 `styleSpecSnapshot.kit === false`로 저장되고, `pageDocument()`는 그런 문법에 키트 CSS를 싣지 않는다. `kit`이 없는 문법(기존 지면)은 지금처럼 키트를 싣는다.
- [ ] 생성 스트림의 `begin`이 알리는 문법에도 `kit: false`가 들어가 생성 중 미리보기가 키트 없이 열린다.
- [ ] `partialFields()`가 값이 객체 · 배열 · 숫자인 칸을 건너뛰고 뒤의 글자 칸을 읽는다. 건너뛰는 값이 아직 끝나지 않았으면 거기서 멈춘다.
- [ ] 지침을 켠 출력의 칸 순서는 `plan` → `css` → `html` → `rationale`이다.
- [ ] 정제 호출 동안에도 생각 신호(`sink.thinking`)가 흐른다.
- [ ] 구조화 생성 경로의 테스트가 그대로 통과한다.

## 설계

**재사용**

- `BriefedPageGenerator` · `page-brief.ts`(실험에서 만든 것).
- 문서 조립 `pageDocument()` 한 곳. 호출하는 여섯 자리(`PageService.document` · `publishing/service.ts` · 웹의 `PagePreview` · `EditablePagePreview` · `Editor` · `LivePreview`)는 문법을 그대로 넘기므로 고치지 않는다.
- 스타일 스냅샷은 DB 검증 규칙이 자유 객체라 마이그레이션이 없다.

**바뀌는 것**

- `packages/contracts/src/page.ts` — `PageStyleGrammarSchema`에 `kit: z.boolean().optional()`. `pageDocument()`는 `grammar.kit !== false`일 때만 키트 변수와 키트 CSS를 싣는다.
- `packages/contracts/src/page-stream.ts` — `partialFields()`가 글자가 아닌 값을 구조로 건너뛴다.
- `page/generator.ts` — `PageGenerator`에 선택 메서드 `usesKit?(context)`. 없으면 키트를 쓰는 것으로 본다.
- `page/format-router.ts` — 고른 방식의 생성기에 `usesKit`을 넘겨 묻는다.
- `page/service.ts` — 문맥을 조립한 뒤 `generator.usesKit?.(context) === false`면 `context.style`에 `kit: false`를 넣는다. 스트림 `begin`과 저장하는 스냅샷이 이 값을 쓴다.
- `page/briefed-generator.ts` — `usesKit()`은 `false`. 지침을 켠 출력 순서를 CSS 먼저로. 정제 호출에 생각 신호 전달.
- `page/design-skill/frontend-design.ts`(새) — 지침 본문과 출처 · 라이선스 머리말. `LICENSE.txt` 사본을 같은 폴더에 둔다.
- `api/main.ts` · `worker/main.ts` — `html` 생성기 교체.

## 버린 대안

- 스타일 스냅샷을 비워 저장 — 키트는 빠지지만 어떤 디자인으로 만들었는지 기록이 사라지고, 생성 중 미리보기는 `begin`의 문법을 따로 받아 여전히 키트를 싣는다.
- 지면 문서에 `kit` 열 추가 — 계약 · DB 문서 · 여섯 호출 자리를 모두 고쳐야 한다.
- 지침 본문을 실행 때 파일에서 읽기 — 백엔드 빌드는 `tsc`뿐이라 `dist`에 파일이 따라가지 않는다.
- 환경 변수로 옛 방식과 새 방식 고르기 — 요청자가 교체를 정했다. 되돌리려면 이 커밋을 되돌린다.

## 함정

- `LivePreview`는 HTML이 오기 시작해야 문서를 연다. CSS가 먼저 다 오므로 문서를 연 직후의 같은 갱신에서 CSS를 쓴다(지금 코드가 갱신마다 CSS를 다시 쓰므로 그대로 된다).
- 지시를 붙여 다시 만들 때는 직전 지면의 HTML · CSS가 요청에 실린다. 정리본도 다시 만든다.
- 키트로 만든 기존 자유 지면을 지시를 붙여 다시 만들면 새 방식으로 만들어지고 스냅샷이 `kit: false`로 바뀐다.
- `AiPageGenerator`는 제품에서 쓰이지 않게 된다. 실험 스크립트의 기준 조건과 테스트가 쓰므로 남긴다.

## 완료 기준

- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과.
- DB 복사본으로 띄운 제품에서 「자유 생성」으로 포트폴리오 하나를 실제로 만들고, 생성 중 미리보기 · 편집 화면 · 새 탭 미리보기를 확인한다.
