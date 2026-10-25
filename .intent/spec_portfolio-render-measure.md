---
title: 생성 중 브라우저 측정과 구성 재요청
slug: portfolio-render-measure
stage: spec
status: accepted
intent: .intent/intent_portfolio-render-measure.md
date: 2026-10-25
---

# 생성 중 브라우저 측정과 구성 재요청 — 명세

## 요구사항

- [ ] 렌더러 패키지가 페이지 안에서 도는 측정 함수(`inspectRenderedPage`)와 측정값을 결함 목록으로 바꾸는 순수 함수(`renderDefects`)를 낸다. Playwright를 의존하지 않는다.
- [ ] 결함 종류: 가로 넘침 · 한 글자 줄바꿈 · 단 이탈 · 그림 설명 겹침 · 늘어난 태그 · 이미지가 빠진 사례(구성으로 고칠 수 있음, `fixable`), 글자 대비 · 서체 미적용 · 깨진 이미지 · 대상 없는 링크 · 사례 번호 · 본문 누락(기록만).
- [ ] 백엔드 `platform/browser`의 측정기가 Chromium(headless shell)을 처음 쓸 때 한 번 띄우고, 측정마다 새 context로 390 · 926 · 1440px를 잰다. 문서는 공개 페이지와 같은 `pageDocument`(grammar 포함)로 조립하고, `/v1/media/…`는 주입받은 읽기 함수로 채운다. 그 밖의 요청은 서체 CDN만 통과시킨다.
- [ ] 브라우저 실행 · 측정 실패는 생성을 막지 않는다. manifest에 건너뛴 이유가 남는다.
- [ ] `StructuredPageGenerator`가 측정기를 받으면: 렌더 → 측정 → `fixable` 결함이 있으면 결함 문장을 수정 요청으로 붙여 Spec을 다시 받는다(최대 2회). 재요청 Spec은 같은 계약 검사를 지나야 하고, `fixable` 결함 수가 가장 적은 판을 채택한다(같으면 먼저 것).
- [ ] `qaReport`에 `rendered-layout`(fixable 결함) · `rendered-readability`(나머지) 검사가 경고 등급으로 남는다. 페이지 상태는 바꾸지 않는다. manifest `renderMeasure`에 판마다 결함 목록 · 측정 시간 · 채택한 판이 남는다.
- [ ] 워커만 측정기를 주입한다. API의 생성기와 편집 재렌더는 측정하지 않는다.
- [ ] `verify-token-kit.mjs`가 렌더러의 측정 함수와 판정을 쓴다.
- [ ] 배포 · CI가 headless shell을 설치한다. 시스템 의존성과 한국어 폰트는 1회 설치 절차로 `DEPLOYMENT.md`에 적는다.

## 설계

- 렌더러 `src/measure.ts`: `RENDER_MEASURE_WIDTHS = [390, 926, 1440]`, `inspectRenderedPage()`(외부 참조 없는 함수, Playwright가 문자열로 보낸다), `renderDefects(measurements, content)`, `describeRenderDefects(defects)`(모델이 읽을 문장). 판정 기준은 지금 스크립트의 assert와 같다.
- 계약 `page.ts`: `PageQaCheckSchema.name`에 두 값, `PageGenerationManifestSchema`에 선택 필드 `renderMeasure`.
- 백엔드 `platform/browser/page-measurer.ts`: `PageMeasurer` 인터페이스와 `ChromiumPageMeasurer`(`playwright` 1.62.1, web과 같은 판). 가짜 오리진 `http://expresso.measure/`로 문서를 열어 상대 경로 이미지를 가로챈다. 워커 종료 시 브라우저를 닫는다.
- 생성기: 재요청은 기존 `structuredSpecPrompt`의 `previous` · `instruction`을 쓴다. 측정은 `context.style`이 grammar일 때 그 값으로 문서를 조립한다.

## 버린 대안

- 측정 코드를 백엔드에만 두기: 개발 스크립트와 기준이 갈린다.
- 결함이 남으면 `failed_qa`: 공개가 막혀 사용자가 결과를 못 받는다. 렌더러 결함까지 사용자에게 떠넘긴다.
- 대비 · 서체 결함으로도 재요청: 디자인 토큰 문제라 구성으로 못 고친다.

## 함정

- 한 글자 줄바꿈은 실제 서체에 따라 달라진다. 서버에 한국어 폰트가 없으면 대체 서체로 잰다.
- `page.evaluate`에 넘기는 함수는 번들 밖 참조가 있으면 페이지에서 깨진다.
- 재요청 Spec이 계약 검사에 실패하면 그 판은 버리고 횟수는 쓴 것으로 센다.

## 완료 기준

- 렌더러 · 생성기 단위 테스트, 실제 Chromium으로 결함 페이지를 재는 백엔드 테스트(CI는 브라우저 설치 후 필수).
- `pnpm typecheck` · `pnpm test` · `pnpm test:infra` 통과, `verify-token-kit.mjs`로 기존 실행 1개 재검사 통과.
- 체험 서버 실제 생성 1회의 `qaReport` · `manifest.renderMeasure` 확인, 측정 시간 · 메모리를 결함 문서에 기록.
