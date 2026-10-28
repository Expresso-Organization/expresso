---
title: 지면 생성의 AI 출력 고치기 실패로 생성이 멈추는 문제
slug: page-ai-output-recovery
stage: spec
status: accepted
intent: .intent/intent_page-ai-output-recovery.md
date: 2026-10-28
---

# 지면 생성의 AI 출력 고치기 실패로 생성이 멈추는 문제 — 명세

## 요구사항

- [ ] 설계 먼저 생성(`designFirst`)의 설계 호출 `check`가 섹션 목록 위반(`planViolations`)과 함께 Spec 구조 위반을 냅니다. 구조 위반은 트리 연결 · 중복 · 컨테이너 규칙 · 루트 · 첫 요소 등 `validateRenderableSpec`이 거는 오류입니다. 위반 경로는 `/spec/elements`이고 이유는 검사기의 문장입니다.
- [ ] 구조 검사는 최종 렌더와 같은 함수(`specSetup(...).accept`)로, 설계안이 만든 청사진 내용(`blueprintContent`)에 `fitToContent`를 거친 Spec을 봅니다. 청사진이 통과한 Spec은 최종 렌더의 구조 검사도 통과합니다.
- [ ] `runWithFixes`의 칸 고치기 회차에서 고친 답을 JSON으로 읽지 못하면 예외를 던지지 않습니다. 그 회차는 `changed = false`로 두고 기존 진전 기준으로 다음을 정합니다. 본 출력(첫 답) 읽기 실패는 지금처럼 `AI_INVALID_OUTPUT`입니다.
- [ ] 로그: 고친 답을 읽지 못한 회차는 `ai.fix_unreadable`(계약 · 회차 · 메시지), 적용되지 않은 문법 고치기는 `ai.syntax_fix`에 `edits`(find · replace 앞 80자)를 함께 남깁니다.
- [ ] 출력 거절 · 전체 다시 요청 루프를 더하지 않습니다. `fixes.test.ts`의 규칙 테스트가 그대로 통과합니다.

## 설계

**재사용**
- `structured-generator.ts`의 `specSetup(content, context).accept`와 `specViolations`(예전 생성 경로가 같은 검사를 `check`로 씁니다).
- `design-first.ts`의 `blueprintContent(plan, context)` · `fitToContent`. 청사진 그리기(`renderBlueprint`)가 이미 이 조합으로 Spec을 받아 봅니다.
- `fixes.ts`의 진전 기준(걸린 칸 수 감소 · 값 변화 · 첫 호출 시간).

**바꾸는 것**
- `designFirst`에 선택 인자 `checkSpec(spec, plan) => AiViolation[]`를 더합니다(`DesignFirstHooks` 옆). 설계 `check`는 `[...planViolations, ...checkSpec(...)]`입니다. `design-first.ts`는 `structured-generator.ts`를 가져오지 않습니다(그쪽이 이쪽을 가져와 순환이 생깁니다). 그래서 검사 함수는 생성기가 넘깁니다.
- 설계 출력의 `plan.sections[].media`는 이미지 번호입니다. 청사진 내용을 만들려면 src로 바꾼 설계안이 필요하므로, 지금 호출 뒤에 하던 변환을 `resolvePlan(designPlan, raw)` 함수로 빼서 `check`와 호출 뒤가 같이 씁니다.
- `StructuredPageGenerator.#designFirstPage`가 `checkSpec`으로 `specViolations(specSetup(blueprint.content, context), fitToContent(spec, blueprint.content, plan))`를 넘기고, 경로에 `/spec`을 붙입니다.
- `runWithFixes`: 칸 고치기 회차의 `read(reply)`를 `try`로 감쌉니다. `AiError`(`AI_INVALID_OUTPUT`)면 기록하고 그 회차를 고친 것 없음으로 처리합니다. `read` 안의 문법 고치기 로그에 적용되지 않은 edits를 더합니다.

## 버린 대안

- 끝에서 빠진 닫는 괄호를 서버가 채우기: 깨진 JSON을 코드가 고치지 않는다는 2026-10-27 결정과 어긋납니다.
- 문법 고치기가 적용되지 않으면 이유를 알려 다시 고쳐 받기: 이번 실패에서 그 원인을 로그로 확인하지 못했습니다. 먼저 기록을 남기고, 원인이 보이면 따로 다룹니다.
- 설계 단계에서 실제 내용으로 구조 검사: 설계 시점에는 채운 글이 없습니다. 구조 검사는 글이 아니라 요소 연결을 보므로 청사진 내용으로 충분합니다.

## 함정

- 구조 위반은 경로가 없어 `/spec/elements` 하나로 묻습니다. 모델은 요소 목록 전체를 다시 냅니다. 예전 경로도 같습니다.
- `fitToContent`는 뺀 섹션 · 조건 못 채운 부품을 지우고 컨테이너를 풉니다. 청사진 내용은 설계안 예산으로 칸을 채우므로, 최종 내용에서 더 지워질 요소(예: 수치가 비어 지워지는 MetricStrip)는 청사진에서 남을 수 있습니다. 지워지는 쪽은 연결 오류를 만들지 않습니다(`fitToContent`가 트리에서도 지움).
- 칸 고치기 응답을 읽지 못해 그 회차를 넘기면, 걸린 칸 수가 그대로라 진전 기준에 따라 대개 바로 멈춥니다. 업무 규칙 위반만 남았으면 출력이 돌아오고, 계약 위반이 남았으면 지금처럼 `AI_INVALID_OUTPUT`입니다.

## 완료 기준

```
pnpm --filter @expresso/backend exec vitest run src/platform/ai/fixes.test.ts src/modules/page
pnpm typecheck && pnpm test && pnpm test:infra
```

- 새 테스트: 연결이 끊긴 설계 Spec → `page_design` 고치기 경로에 `/spec/elements`가 있고 생성이 끝난다.
- 새 테스트: 업무 규칙 위반 뒤 고친 답이 읽히지 않음 → 예외 없이 첫 출력이 돌아온다.
