---
title: 화면 문구 어휘 표준화
slug: ui-wording-standard
stage: plan
status: draft
intent: .intent/intent_ui-wording-standard.md
spec: .intent/spec_ui-wording-standard.md
date: 2026-11-10
---

# 화면 문구 어휘 표준화 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/web/src/app/(app)/account/page.tsx` | 「지면 / 지면 밝기」 → 「화면 / 테마」 |
| `services/web/src/components/ThemePicker.tsx` | `aria-label` 「테마」 |
| `services/web/src/app/**`, `components/**`, `features/**`, `lib/**` 문구가 있는 파일 약 60개 | 교체표 적용 |
| `services/web/src/**/*.test.*` (문구를 확인하는 테스트) | 바뀐 문구에 맞춤 |
| `services/backend/src/modules/{page,layout,generation}/*.ts`, `platform/html/sanitize.ts` | 사용자에게 가는 오류 메시지만 |
| `packages/contracts/src/layout.ts`, `structured-portfolio.ts`, `portfolio-styles.ts` | 사용자 노출 메시지와 프리셋 한 줄 설명만 |
| `docs/Expresso Screens.dc.html` | 1685행 「지면 순서」 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 교체 스크립트 작성(스크래치패드) — 주석 줄을 건드리지 않고 문자열 부분만 치환. `--dry-run`으로 변경 줄 수 확인.
2. 기계 치환 가능한 묶음 적용(지면 · 판 · 칼럼 · 십시오 등) 후 `git diff`로 모든 줄 읽기, 조사 교정.
3. 문맥 의존 묶음(자리 · 칸 · 놓기 · 나가 · 뽑 · 재료 · 매칭)을 파일별로 손으로 수정.
4. 백엔드 · 계약 오류 메시지, 정의서 수정.
5. 테스트 문구 맞춤, 계약 `dist` 재빌드.
6. 검증 명령 실행, 설정 화면 확인.

각 단계 끝에 `git diff --stat`으로 범위를 확인하고, 4단계까지는 타입이 바뀌지 않으므로 `tsc`로 문자열 깨짐(따옴표)만 본다.

## 가장 위험한 단계

3단계. 뜻이 갈리는 말을 잘못 바꾸면 문장이 틀린다(예: 「자리」가 일자리가 아닌 곳). 되돌리기: 파일별 `git checkout -- <파일>` 후 해당 줄만 다시 수정. 커밋 전에 변경 줄을 모두 읽는다.

## 검증

```
pnpm typecheck
pnpm test
git grep -nP '지면 밝기|십시오|여쭙|무릅|줄 세' -- services/web/src ':!*.test.*'
```

UI: `DEV_LOGIN`으로 `<이름>.localhost:<포트>` 웹을 띄워 설정 → 화면 섹션 스크린샷을 확인한다.
