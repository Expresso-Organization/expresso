---
title: 포트폴리오 첫 화면 배경 오브젝트와 인터랙티브 장면
slug: portfolio-backdrop-objects
stage: spec
status: accepted
intent: .intent/intent_portfolio-backdrop-objects.md
date: 2026-10-28
---

# 포트폴리오 첫 화면 배경 오브젝트와 인터랙티브 장면 — 명세

## 요구사항

**계약 · 생성**
- [ ] `STRUCTURED_BACKDROPS`는 `none` + 정적 일곱(`grid` `dots` `stripes` `contour` `rings` `glow` `aurora`) + 장면 여섯(`orb` `terrain` `knot` `constellation` `flow` `ripple`)입니다. `BACKDROP_FALLBACK`이 장면마다 정적 값 하나를 정합니다.
- [ ] 저장 계약 `NameIntro.props.backdrop`은 선택 칸입니다. 옛 저장본은 그대로 통과합니다. 모델 스키마 `intro.props.backdrop`은 모든 유형에서 필수 enum이고 `check`를 더하지 않습니다.
- [ ] 설계 프롬프트 · 다듬기 Spec 프롬프트가 `describeBackdrops()` 한 줄로 종류마다 쓰임을 알립니다. `PAGE_PROMPT_VERSION` 15.

**정적 배경**
- [ ] 첫 화면 다섯 구도가 배경을 그립니다. 값이 없으면 poster는 `stripes`, 나머지는 `none`입니다.
- [ ] 배경 층은 첫 화면의 마지막 자식 `div.xp-backdrop[aria-hidden][data-bleed]`이고 `pointer-events:none`입니다. 첫 화면 `background-image`에는 그리지 않습니다.
- [ ] 색은 TS가 계산해 변수로 넘긴 잉크(`--xp-bd-1`, `--xp-bd-2`)뿐이고 키트 CSS에 새 16진 색이 없습니다. `filter:blur` · `backdrop-filter` · `feTurbulence`를 쓰지 않습니다.
- [ ] 반복 모션은 `@media (prefers-reduced-motion:no-preference)`와 `.xp-page:not([data-motion="none"])` 안에서만 돕니다.

**장면 런타임**
- [ ] 키트는 장면에 `div.xp-scene[data-scene="orb"]`만 냅니다. `<canvas>` · `<script>`는 내지 않습니다. 대체 정적 층은 그 아래에 그대로 둡니다.
- [ ] `pageDocument`가 `data-scene`이 있는 문서에만 `<script src="/scene-runtime/v1.js" defer>`를 붙입니다.
- [ ] 런타임은 캔버스를 만들고 색을 CSS 변수(바탕 · `--xp-bd-1` · `--xp-bd-2`)에서만 읽습니다. 모든 픽셀은 `mix(바탕, 잉크, f)`, `f∈[0,1]`입니다. 가산 혼합 · 하이라이트를 쓰지 않습니다.
- [ ] 움직임 줄이기면 루프 없이 한 장면만 그립니다. `IntersectionObserver` · `visibilitychange`로 멈춥니다. 픽셀 배율은 2를 넘지 않습니다. WebGL이 없거나 문맥을 잃으면 캔버스를 지우고 대체 그림이 남습니다.
- [ ] 포인터는 첫 화면의 `pointermove`를 읽습니다. 스크롤과 연동하지 않습니다.

**스크립트 허용 정책**
- [ ] `page.ts`의 `pageDocumentPolicy(runtimeUrl)` 문자열 하나를 세 라우트(백엔드 `/document`, 웹 편집 미리보기, 웹 공개 문서)가 응답 헤더로 겁니다. 내용: `sandbox allow-scripts allow-popups`(allow-same-origin 없음), `script-src <런타임 절대 주소>`, `form-action 'none'`.
- [ ] 공개 사이트 iframe은 `src="/site/<slug>/document"`와 `sandbox="allow-scripts allow-popups"`로 엽니다. 새 라우트가 배포 스냅샷 문서를 헤더와 함께 냅니다.
- [ ] 모델 출력의 `<script>`는 소독기(`sanitizePage`)가 계속 지웁니다. 인라인 스크립트를 넣은 문서를 공개 라우트로 열면 실행되지 않습니다.

**대비 · 검증**
- [ ] `backdropColors(spec)`가 바탕(캔버스 · 행동색 면) × 부류(선 · 빛)마다 잉크와 첫 화면 보조 · 링크 색을 계산하고, `designQa`가 그 쌍을 봅니다. 38종 통과, 배경 세기 유지.
- [ ] 390 · 1440 렌더 측정에 가로 넘침 · 대비 결함이 없습니다.

## 설계

**재사용** — 지면 변화 data 속성 방식(`stageAttributes`), `ensureContrast` · `readableColors` · `designQa`, `data-bleed`, 기존 모션 조건, DESIGN.html의 스크립트 격리 선례(`design-systems/compiler.ts`: 고정 스크립트 + CSP 해시 + `sandbox="allow-scripts"`), 편집 미리보기 라우트의 헤더 정책 방식, 소독기의 `data-*` 허용(`PAGE_GLOBAL_ATTRIBUTES`, 확인함).

**새로 만드는 것**
- `packages/portfolio-renderer/src/backdrop.tsx`: 정적 일곱 종 마크업 · `BACKDROP_CSS` · `describeBackdrops()`. 등고선 · 동심원 SVG는 고정 좌표.
- `packages/portfolio-renderer/src/scene-runtime/`: 런타임 진입점, 장면 여섯(3D는 three.js `WebGLRenderer` + `ShaderMaterial`, 2D는 canvas 2D), 공통 루프(배율 · 멈춤 · 포인터), 색 함수 `inkMix()`. esbuild로 한 파일로 묶어 `services/web/public/scene-runtime/v1.js`에 둡니다(빌드 산출물, git 제외).
- `services/web/src/app/site/[slug]/document/route.ts`: 공개 문서 라우트.

**표면별로 보이는 것**

| 표면 | 스크립트 | 보이는 것 |
|---|---|---|
| 공개 사이트 · 편집 미리보기 · 배포 미리보기 | 런타임만 | 장면 |
| 생성 중 미리보기(`LivePreview`) · 축소 미리보기(`PagePreview`) | 없음 | 대체 그림 |
| 내려받은 HTML · 측정기 · 스크린샷 검토 | 런타임 주소에 못 닿음 | 대체 그림 |

**런타임 주소** — 웹은 요청 출처로 절대 주소를 만들고, 백엔드는 `APP_BASE_URL`로 만듭니다. 문서 안 `<script src>`는 상대 경로라 웹 출처에서 열릴 때만 받아집니다. 경로의 `v1`은 런타임과 `data-scene` 약속의 판입니다. 배포 스냅샷은 고정되므로 약속을 깨는 변경은 `v2` 파일을 새로 두고 `v1`을 남깁니다.

**연결** — `catalog.ts` NameIntro에 칸 하나 · 설명 한 구절, `kitCss`가 배경 변수와 `BACKDROP_CSS`를 이어 붙임, 포스터 `background-image` 줄무늬 삭제.

## 버린 대안

- 런타임을 문서에 인라인하고 해시로 허용(DESIGN.html 방식): three.js 묶음이 배포 스냅샷마다 저장되고, 공개 사이트에서는 페이지 데이터에 한 번 더 실려 휴대폰 전송량이 커집니다. 외부 파일은 한 번 받아 캐시합니다.
- 문서 안 `<meta>` CSP에 기대기: 이미 배포된 스냅샷에는 meta가 없어 iframe에 `allow-scripts`를 주면 소독기 한 겹만 남습니다. srcdoc의 CSP 상속도 MDN에서 확인되지 않았습니다.
- CSP `'self'`: 불투명 출처에서 무엇과 맞는지 확인되지 않았습니다. MDN에서 확인한 "슬래시로 끝나지 않는 경로는 그 파일 하나에만 맞음" 규칙으로 절대 주소를 씁니다.
- 정적 배경과 장면을 두 칸으로 두기: "장면은 있는데 배경 없음" 조합을 `check`로 막아야 합니다. 한 칸이면 대체 그림이 구조로 보장됩니다.
- 수집 원본의 React WebGL 배경 이식: 공개 지면은 정적 HTML이라 React가 돌지 않습니다. 요청이 three.js이므로 런타임에서 새로 씁니다.

## 함정

- `measure.ts`의 대비 검사는 조상의 배경색만 봅니다. 배경 층과 캔버스는 형제라 보지 못하므로 대비는 `designQa` 정적 계산과 런타임 색 함수 테스트가 맡습니다.
- `kit-styles.ts`의 `.xp-hero>*` 등장 애니메이션이 배경 층에도 걸립니다. 더 높은 명시도로 덮습니다.
- 시각화 세션이 `catalog.ts` · 설계 프롬프트 · `kit-styles.ts`를 고칩니다. 그 세 곳은 한두 줄만 고칩니다.
- 숨긴 브라우저 창은 애니메이션 프레임이 멈춥니다. 스크린샷과 프레임 측정은 headless Chrome으로 합니다.
- 워커는 셸의 `AI_PROVIDER`를 물려받습니다. 실제 생성 때 값을 명시합니다.

## 완료 기준

- `pnpm typecheck`, `pnpm test`, `pnpm test:infra` 통과.
- 체험 서버 공개 지면 1440 · 390 스크린샷에 장면이 보이고, 포인터 이동 전후 화면이 다릅니다.
- 견본 화면 열세 종 × 밝은 · 어두운 디자인 스크린샷.
- 인라인 스크립트를 넣은 문서가 공개 라우트에서 실행되지 않는다는 브라우저 확인(CSP 위반 기록).
- 런타임 gzip 크기와 390px · CPU 4배 감속 프레임 시간 측정값.
