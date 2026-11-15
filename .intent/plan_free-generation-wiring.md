---
title: 자유 생성의 정리본 · 디자인 지침 · 배치 자유 방식 연결
slug: free-generation-wiring
stage: plan
status: accepted
intent: .intent/intent_free-generation-wiring.md
spec: .intent/spec_free-generation-wiring.md
date: 2026-11-15
---

# 자유 생성의 정리본 · 디자인 지침 · 배치 자유 방식 연결 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/contracts/src/page.ts` | 스타일 문법의 `kit` 칸, `pageDocument()`의 키트 싣기 조건 |
| `packages/contracts/src/page-stream.ts` · `page-stream.test.ts` | `partialFields()`가 글자가 아닌 값을 건너뜀 |
| `services/backend/src/modules/page/generator.ts` | `PageGenerator.usesKit?` |
| `services/backend/src/modules/page/format-router.ts` · `format-router.test.ts` | `usesKit` 넘겨 묻기 |
| `services/backend/src/modules/page/service.ts` | 스냅샷 · 스트림 문법에 `kit: false` |
| `services/backend/src/modules/page/briefed-generator.ts` · `.test.ts` | `usesKit` · CSS 먼저 · 정제 호출의 생각 신호 |
| `services/backend/src/modules/page/page-brief.ts` | 생각 신호 받기 |
| `services/backend/src/modules/page/design-skill/frontend-design.ts` · `LICENSE.txt` (새) | 지침 본문 · 라이선스 |
| `services/backend/src/api/main.ts` · `worker/main.ts` | `html` 생성기 교체 |
| `scripts/library/renderer/free-lab/run.ts` | 내장 본문을 기본으로 읽기 |
| `docs/architecture/portfolio-free-generation-lab.md` · `portfolio-structured-pipeline.md` | 연결 사실과 달라진 점 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 계약 — `kit` 칸 · `pageDocument()` · `partialFields()`와 테스트. 확인: `pnpm --filter @expresso/contracts test`.
2. 생성기 — 지침 본문 내장, `usesKit`, CSS 먼저, 생각 신호, 라우터 · 서비스 · 조립 자리 교체와 테스트. 확인: 백엔드 테스트.
3. 출력 순서 확인 — 실험 스크립트로 세 인물을 새 순서로 다시 만들어 앞선 지면과 나란히 본다.
4. 제품 검증 — DB 복사본으로 API · Worker · 웹을 띄워 「자유 생성」으로 실제 생성, 생성 중 미리보기 · 편집 화면 · 새 탭 미리보기 확인. 기존 키트 지면과 구조화 지면도 연다.
5. 문서 갱신, `pnpm typecheck` · `pnpm test` · `pnpm test:infra`, 커밋 · 푸시, PR 본문 갱신.

## 가장 위험한 단계

4단계. 문서 조립 조건을 바꾸므로 기존 지면의 화면이 달라질 수 있다. `kit`이 없는 문법은 지금과 같은 경로를 타게 두었고, 기존 키트 지면 하나와 구조화 지면 하나를 열어 전과 같은지 본다. 문제가 있으면 `pageDocument()`의 조건 한 줄과 서비스의 한 줄을 되돌리면 옛 동작으로 돌아간다.

## 검증

```
pnpm typecheck
pnpm test
pnpm test:infra
```

확인할 화면: `/brew/<id>/design`에서 「자유 생성」 선택 → 만들기 → 생성 중 미리보기 → `/edit/<포트폴리오>` → `/edit/<포트폴리오>/preview`.
