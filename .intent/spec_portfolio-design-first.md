---
title: 디자인 먼저 생성과 단계별 화면 전달
slug: portfolio-design-first
stage: spec
status: accepted
intent: .intent/intent_portfolio-design-first.md
date: 2026-10-26
---

# 디자인 먼저 생성과 단계별 화면 전달 — 명세

## 요구사항

- [ ] **설계(새 계약 `page_design`)**: 입력은 원자료(레시피 섹션 · 기록 제목과 원문(항목당 1,500자까지) · 이미지 유무)와 디자인 · 유형. 출력은 최종 Spec과 칸 예산(섹션별 싣기 여부, 시각 형태, 제목 · 요약 · 본문 · 항목 · 수치 개수와 글자 수). 싣지 않은 섹션은 내용과 Spec에서 함께 빠진다.
- [ ] **글 채우기**: 섹션마다 병렬 호출로 칸을 채운다. 예산은 스키마의 `max`로 강제하고, 넘으면 기존 계약 위반 재요청을 탄다. 수치는 원문 대조(`ungroundedNumbers`)를 지난 것만 남긴다.
- [ ] **내용 계약 확장**: `StructuredSection`에 `metrics`(값 · 단위 · 이전 값 · 설명)와 `steps`를 선택 필드로 더한다. 교체하지 않아 다듬기 · 편집 · 검사 경로가 그대로 읽는다.
- [ ] **시각 부품**: `MetricStrip`(수치 강조 줄), `CaseBeforeAfter`(전후 비교 막대), `CaseFlow`(과정 흐름), `CaseShowcase`(이미지 격자), `PullQuote`(큰 인용). 서버에서 HTML · SVG로 그려 스크립트 없이 보인다. 막대는 퍼센트 너비, 색은 디자인 변수.
- [ ] **청사진**: 설계가 끝나면 최종 구조의 DOM을 한 번 그린다. 루트 `data-stage="blueprint"`, 글 자리마다 `data-slot="/sections/<id>/summary"`(편집 패치와 같은 경로) 스켈레톤. 청사진 모습은 CSS만으로 정한다.
- [ ] **순차 채움**: 스트림에 `blueprint`(문서) · `fill`(경로 · 글) · `stage` 사건을 더한다. `LivePreview`는 청사진 문서를 한 번 열고, `fill`은 슬롯 글만 바꾸고, 다 차면 `data-stage`를 지워 디자인을 입힌다. 이 단계에 모델 호출은 없다. 그 뒤 초안 저장 · 다듬기는 지금과 같다.
- [ ] **지면 스크립트**: 구조화 지면의 `pageDocument`가 키트 고정 스크립트를 `<head>`에 싣고 CSP `script-src 'sha256-…'` · `connect-src 'none'`. 소독기는 `script`를 계속 지운다. `/document` 헤더와 공개 사이트 iframe은 `sandbox="allow-scripts allow-popups"`(same-origin 없음). 자유 HTML 지면은 그대로.
- [ ] **차트 라이브러리 판정**: ECharts SSR(`renderToSVGString`)을 디자인 변수 색 · 390px · 용량으로 실제 그려 본다. 이번 부품은 HTML/CSS로 충분한지와 함께 결과를 문서에 남긴다.
- [ ] **다듬기**: 검토 스키마에 새 부품이 들어간다. 칸 예산 변경은 이번에 하지 않는다.
- [ ] **호출별 기록**: manifest에 호출마다 계약 · 모델 · 시간 · 출력 토큰 · 비용. 단계 시각(설계 끝 · 채움 끝 · 저장)도 남긴다.

## 설계

- 생성기 흐름: `design()` → `renderBlueprint()` → `fill()`(병렬) → `validateRenderableSpec` → 렌더 → 측정 → 저장. 기존 내용 정리 · 구성 두 호출을 대체한다. 기존 경로는 재생성(`previous`가 있을 때)에서 계속 쓴다.
- 청사진은 내용 자리에 경로 표지(`⟦/sections/a/title⟧`)를 넣어 렌더한 뒤, 표지를 슬롯 요소로 바꾼다. 부품마다 슬롯 코드를 넣지 않는다.
- 설계 모델은 기본 opus, 글 채우기는 sonnet으로 시작하고 첫 실측에서 opus와 비교한다.

## 버린 대안

- 채움을 iframe 안 스크립트로: 미리보기 iframe은 부모가 문서를 직접 만질 수 있어 필요 없다.
- 단계마다 문서를 새로 그리기: 깜빡이고 스크롤이 튄다.
- 차트를 클라이언트 라이브러리로만: 스크립트가 꺼지면 수치가 안 보인다.

## 함정

- 해시가 판마다 같으려면 키트 스크립트에 지면별 문자열이 한 글자도 없어야 한다.
- 측정기는 서체 호스트만 통과시킨다. 키트 스크립트는 인라인이라 영향 없다.
- 병렬 채움은 공급자 동시 실행 한도에 걸릴 수 있다 — 동시 4개로 묶는다.

## 완료 기준

- 첫 커밋 뒤 가상 프로필 3종 × 디자인 3종 새 구조 / 지금 구조 비교 이미지를 사용자에게 보내 방향을 확인받는다.
- 브라우저 테스트: 키트 스크립트 실행 · 내용 속 `<script>` 제거 · `fetch` 차단 · 앱 쿠키 접근 불가.
- 체험 서버 실제 생성: 청사진 · 채움 끝 · 초안 · 다듬은 판 시각, 화면 녹화.
- `pnpm typecheck` · `pnpm test` · `pnpm test:infra`.
