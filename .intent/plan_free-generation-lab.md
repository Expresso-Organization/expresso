---
title: 자유 생성 파이프라인 실험 — 정제된 컨텍스트와 디자인 스킬
slug: free-generation-lab
stage: plan
status: accepted
intent: .intent/intent_free-generation-lab.md
spec: .intent/spec_free-generation-lab.md
date: 2026-11-15
---

# 자유 생성 파이프라인 실험 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `services/backend/src/modules/page/generator.ts` | `SYSTEM` · `buildPrompt` · `authorPrompt` · `markupProblem` · `pageQa` 내보내기(동작 변경 없음) |
| `services/backend/src/modules/page/page-brief.ts` (새) | 정리본 계약 · 정제 호출 · 출처 대조 검사 · `briefPrompt` |
| `services/backend/src/modules/page/page-brief.test.ts` (새) | 섹션 누락 · 출처에 없는 수치 · 이전 값 검사 |
| `services/backend/src/modules/page/briefed-generator.ts` (새) | `BriefedPageGenerator`(정제 · 스킬 두 스위치) |
| `services/backend/src/modules/page/briefed-generator.test.ts` (새) | 둘 다 끄면 기준과 같은 프롬프트, 스킬 켜면 정책이 스킬 뒤 · `plan` 먼저 |
| `scripts/library/renderer/free-lab/capture.ts` (새) | DB 복사본에서 인물 세 명의 생성 문맥을 JSON으로 저장 |
| `scripts/library/renderer/free-lab/run.ts` (새) | 조건 · 입력 · 반복별 실제 생성과 기록 |
| `scripts/library/renderer/free-lab/measure.mjs` (새) | 390 · 1440px 스크린샷과 측정 |
| `scripts/library/renderer/free-lab/sheet.mjs` (새) | 비교 화면 `index.html` |
| `docs/library/previews/portfolio/runs/free-lab-2026-11-15/` (새) | 입력 · 요청 · 응답 · 지면 HTML · 스크린샷 · 측정 |
| `docs/architecture/portfolio-free-generation-lab.md` (새) | 방법 · 결과 표 · 눈가림 평가 · 다음 결정 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 생성기 — `generator.ts` 내보내기, `page-brief.ts`, `briefed-generator.ts`와 테스트. 확인: 백엔드 `pnpm --filter @expresso/backend test`에서 새 테스트 통과.
2. 입력 — DB를 `expresso_free_lab`으로 복사하고 마이그레이션, `capture.ts`로 세 인물의 문맥 저장. 확인: 문맥 JSON 세 개에 섹션 · 근거 · 스타일 문법이 있고 실제 사용자 정보가 없다.
3. 시험 실행 — 윤하린 × 네 조건(지면 4건 · 정리 1건). 확인: 네 지면을 브라우저로 열어 보고, 프롬프트가 의도대로 갔는지 요청 기록을 읽는다. 문제가 있으면 여기서 생성기를 고친다.
4. 전체 실행 — 나머지 인물 · 반복 · 다른 디자인 · 구조화 기준(약 15건)을 백그라운드로 돌린다.
5. 측정과 비교 화면 — `measure.mjs` · `sheet.mjs`. 확인: `index.html`에 모든 칸이 채워진다.
6. 눈가림 평가 — 조건 이름을 가린 스크린샷을 별도 에이전트에게 준다.
7. 결과 문서 — 표 · 평가 · 다음 결정.
8. 검증 — `pnpm typecheck` · `pnpm test`, 운영 계정 정보 검색, 커밋 · 푸시 · PR.

## 가장 위험한 단계

3단계 시험 실행. 스킬 본문과 스타일 문법이 부딪혀 고른 색을 버리거나, 정리본이 길어 지면 호출이 끊기거나, 스킬이 권한 스크립트를 소독기가 지워 화면이 비는 경우가 여기서 드러난다. 전체 실행 전에 네 지면을 직접 열어 보고 생성기를 고친다. 실행 폴더는 조건별로 나뉘어 있어 고친 뒤 그 조건만 새 실행 ID로 다시 만든다. 제품 경로에 연결하지 않으므로 되돌릴 것은 브랜치뿐이다.

## 검증

```
pnpm typecheck
pnpm test
node --import ./services/backend/node_modules/tsx/dist/loader.mjs scripts/library/renderer/free-lab/run.ts --run free-lab-2026-11-15 --generate
node scripts/library/renderer/free-lab/measure.mjs free-lab-2026-11-15
node scripts/library/renderer/free-lab/sheet.mjs free-lab-2026-11-15
grep -rl -i -E "libera3920|parkmj9260|minjae|Nedian" docs/library/previews/portfolio/runs/free-lab-2026-11-15 || echo "운영 계정 정보 없음"
```

확인할 화면: `docs/library/previews/portfolio/runs/free-lab-2026-11-15/index.html`을 열어 인물 × 조건 격자의 스크린샷과 각 지면 링크를 본다.
