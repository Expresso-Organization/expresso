/**
 * 토큰 키트의 CSS입니다.
 *
 * 값은 모두 디자인 시스템 변수(`cssVariables`)와 키트 보정 변수(`--xp-*`)에서 옵니다.
 * 시각 기준은 설계 문서(`DESIGN.html`)의 섹션 예시이고, 견본 카드 크기의 규칙을 페이지
 * 섹션 크기로 옮겼습니다. 컴포넌트 규칙 4종과 배치·밀도는 `.xp-page`의 data 속성이 바꿉니다.
 *
 * 접두사가 `xp-`인 이유: 문서 래퍼가 함께 싣는 지면 키트 CSS가 `.k-`를 씁니다.
 */
import { KIT_LAYOUT } from "./design-layout.js";

const { wideMargin: WM, group: GROUP, collapseBelow: COLLAPSE } = KIT_LAYOUT;

/**
 * 등장 규칙(`data-reveal`) — 키트 공통 스크롤 등장입니다. 스크립트 없이 CSS 스크롤 타임라인(`animation-timeline:view()`)만 씁니다.
 *
 * 등장 단위는 `.xp-block`의 직계 자식입니다. 블록이 `.xp-inner` 바로 아래든 `.xp-group` 안이든 같습니다. 직계 자식이 `ul` · `ol` ·
 * `[data-reveal="stagger"]`이면 그 자식 대신 안의 항목이 단위가 됩니다. 단위는 자기가 화면에 들어올 때 디자인의 요소 간격만큼
 * 아래에서 떠오르고, 같은 부모 안 2 · 3 · 4번째 이후 단위는 디자인의 컴포넌트 간격만큼씩 늦게 시작합니다.
 *
 * 새 부품을 만들 때:
 * - 바깥 요소에 `xp-block` 클래스를 주면 따로 할 일이 없습니다.
 * - 나란한 항목을 차례로 보이려면 `ul` · `ol`을 쓰거나, 그 묶음 요소에 `data-reveal="stagger"`를 붙입니다. 블록의 직계 자식이어야 합니다.
 * - 배경처럼 움직이면 안 되는 요소에는 `data-reveal="none"`을 붙입니다. 그 요소와 자손이 모두 빠집니다.
 *   문서 루트(`<html data-reveal="none">`)에 붙이면 첫 화면을 포함한 지면 전체가 빠집니다(`pageDocument({ reveal: false })`).
 *
 * 등장 선언은 움직임 줄이기가 아니고(`no-preference`) 브라우저가 스크롤 타임라인을 지원할 때(`@supports`)만 있습니다. 둘 중 하나가
 * 아니면 시작 상태(투명)도 선언되지 않아 내용이 처음부터 보입니다. 덮어쓰는 규칙(`animation:none`)으로 끄지 않습니다.
 * 청사진 단계(`:root[data-stage]`)와 `data-motion="none"` 지면에서도 꺼집니다.
 *
 * 지원 근거: MDN browser-compat-data 8.1.7(2026-10-22) — `animation-timeline` · `view()` · `animation-range`가
 * Chrome · Edge 115, Safari 26, Firefox 159부터입니다.
 */
const REVEAL_ON = `:root:not([data-stage]) .xp-page:not([data-motion="none"])`;
const REVEAL_OFF = `[data-reveal="none"],[data-reveal="none"] *`;
/**
 * 단위가 다 나타나는 지점입니다. 단위의 위쪽이 화면 아래쪽 25vh를 지나는 동안 나타나므로, 읽는 자리인 위쪽 4분의 3에서는
 * 늘 불투명합니다. `entry` 백분율은 단위 높이에 따라 거리가 달라져 쓰지 않습니다.
 */
const REVEAL_ZONE = "25vh";
/**
 * 문서 끝 마무리 구간입니다. 문서 끝에서는 더 내릴 수 없어 마지막 단위의 위쪽이 `REVEAL_ZONE` 선을 넘지 못할 수 있습니다.
 * 그 단위는 문서 스크롤 타임라인(`scroll(root)`)의 마지막 `REVEAL_ZONE` 동안 `xp-settle`이 마저 불투명하게 만듭니다.
 * `xp-settle`은 끝 상태만 적어 시작 값으로 앞 애니메이션의 현재 값을 이어받으므로, 이미 다 보인 단위에는 영향이 없습니다.
 */
const REVEAL_TAIL = `calc(100% - ${REVEAL_ZONE}) 100%`;
/** 등장 단위 선택자입니다. `nth`는 같은 부모 안의 순서 조건입니다. 스크롤 타임라인에서는 `animation-delay`가 진행에 영향을 주지 않아 순서는 구간 시작으로 밉니다. */
function revealUnits(nth: string): string {
  const block = `${REVEAL_ON} .xp-block:not(${REVEAL_OFF})`;
  return `${block}>:not(ul,ol,[data-reveal])${nth},${block}>:is(ul,ol,[data-reveal="stagger"])>:not([data-reveal="none"])${nth}`;
}

export const KIT_CSS = String.raw`
.xp-page{--xp-pad:clamp(20px,5vw,56px);--xp-bleed:max(var(--xp-pad),(100vw - var(--content-width)) / 2);--xp-section:var(--section-gap);--xp-rule:var(--border-width) solid var(--border);--xp-small:max(13px,calc(var(--type-example-body) * .86));--xp-name:clamp(2.6rem,5.2vw + 1rem,calc(var(--type-example-display) * 1.3));--xp-h2:clamp(1.55rem,1.6vw + 1rem,var(--type-example-heading));
  min-height:100vh;margin:0;overflow-x:clip;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:var(--type-example-body);line-height:var(--line-example-body);word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.xp-page *,.xp-page *::before,.xp-page *::after{box-sizing:border-box}
.xp-page :is(h1,h2,h3,p,ol,ul,dl,dd,figure,blockquote){margin:0;padding:0}
.xp-page li{list-style:none}
.xp-page a{color:var(--xp-accent-text);text-decoration-thickness:1px;text-underline-offset:.22em}
.xp-page a:focus-visible{outline:2px solid var(--xp-accent-text);outline-offset:3px;border-radius:2px}
.xp-page[data-density="compact"]{--xp-section:calc(var(--section-gap) * .8)}
.xp-page[data-density="spacious"]{--xp-section:calc(var(--section-gap) * 1.2)}
.xp-page[data-divider="none"]{--xp-rule:0 solid transparent}
.xp-page[data-divider="double"]{--xp-rule:3px double var(--border)}
.xp-page[data-divider="dashed"]{--xp-rule:var(--border-width) dashed var(--border)}
.xp-page[data-divider="dotted"]{--xp-rule:max(2px,var(--border-width)) dotted var(--border)}
.xp-page[data-divider="thick"]{--xp-rule:2px solid var(--text)}

.xp-inner{width:min(100% - var(--xp-pad) * 2,var(--content-width));margin-inline:auto;padding-block:calc(var(--xp-section) * .7) var(--xp-section);display:grid;gap:var(--xp-section)}

/* 글자 */
.xp-eyebrow{display:block;color:var(--xp-muted);font-family:var(--font-mono);font-size:12px;line-height:1.5;letter-spacing:.08em}
.xp-name{font-family:var(--font-display);font-size:var(--xp-name);font-weight:var(--xp-weight);line-height:1.02;letter-spacing:calc(var(--xp-tracking) * 1.6)}
.xp-headline{max-width:30ch;font-family:var(--font-display);font-size:clamp(1.2rem,.9vw + 1rem,calc(var(--type-example-heading) * .78));font-weight:var(--xp-weight-mid);line-height:var(--line-example-heading);letter-spacing:var(--xp-tracking)}
.xp-h2{font-family:var(--font-display);font-size:var(--xp-h2);font-weight:var(--xp-weight);line-height:var(--line-example-heading);letter-spacing:var(--xp-tracking)}
.xp-h3{font-size:calc(var(--type-example-body) * 1.06);font-weight:var(--xp-weight);line-height:1.4}
.xp-lead{max-width:var(--measure);color:var(--xp-muted);font-size:calc(var(--type-example-body) * 1.08);line-height:var(--line-example-body)}
.xp-body{display:grid;gap:.85em;max-width:var(--measure)}
.xp-body p{color:var(--text)}
.xp-small{color:var(--xp-muted);font-size:var(--xp-small);line-height:1.55}

/* 표식 — 라벨 앞에 붙는 디자인별 기호 */
.xp-page[data-marker="prompt"] .xp-eyebrow::before{content:"$ ";color:var(--xp-accent-text)}
.xp-page[data-marker="bullet"] .xp-eyebrow::before{content:"■  ";color:var(--xp-accent-text)}
.xp-page[data-marker="bracket"] .xp-eyebrow::before{content:"[ ";color:var(--xp-accent-text)}
.xp-page[data-marker="bracket"] .xp-eyebrow::after{content:" ]";color:var(--xp-accent-text)}
.xp-page[data-marker="rule"] .xp-eyebrow::before{content:"";display:inline-block;width:22px;margin-right:10px;border-top:1px solid var(--xp-accent-text);vertical-align:middle}
.xp-page[data-marker="numbered"] .xp-eyebrow::before{content:"— ";color:var(--xp-accent-text)}

/* 면 — 카드와 테두리 방식 */
.xp-panel{position:relative;padding:clamp(20px,2.4vw,calc(var(--component-gap) * 1.35));border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface);box-shadow:var(--shadow);--xp-muted:var(--xp-muted-surface)}
.xp-page[data-chrome="window"] .xp-panel{padding-top:calc(clamp(20px,2.4vw,calc(var(--component-gap) * 1.35)) + 30px)}
.xp-page[data-chrome="window"] .xp-panel::before{content:"";position:absolute;inset:0 0 auto;height:30px;border-bottom:var(--border-width) solid var(--border);border-radius:var(--card-radius) var(--card-radius) 0 0;background:var(--elevated)}
.xp-page[data-chrome="window"] .xp-panel::after{content:"";position:absolute;top:11px;left:14px;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:15px 0 0 var(--border),30px 0 0 var(--border)}
.xp-page[data-chrome="masthead"] .xp-panel{padding-top:calc(clamp(20px,2.4vw,calc(var(--component-gap) * 1.35)) + 14px)}
.xp-page[data-chrome="masthead"] .xp-panel::before{content:"";position:absolute;inset:12px clamp(20px,2.4vw,calc(var(--component-gap) * 1.35)) auto;border-top:3px double var(--text)}
.xp-page[data-chrome="masthead"] .xp-hero{padding-top:22px;border-top:4px double var(--text)}
/* 기울인 패널은 모서리가 제자리 밖으로 나갑니다. 높이가 폭의 두 배를 넘지 않는 목차 카드만 기울이고,
   0.6도 기울였을 때 그 모서리가 제자리 안에 남도록 1 / (1 + 2·sin 0.6°) ≈ .979배로 줄입니다 */
.xp-page[data-chrome="sticker"] .xp-mosaic .xp-panel{transform:rotate(-.6deg) scale(.979)}
.xp-page[data-chrome="sticker"] .xp-mosaic .xp-panel:nth-of-type(2n){transform:rotate(.5deg) scale(.979)}
.xp-page[data-chrome="panel"] .xp-panel::before{content:"";position:absolute;inset:0 0 auto;height:1px;border-radius:var(--card-radius) var(--card-radius) 0 0;background:color-mix(in srgb,var(--canvas) 55%,white);pointer-events:none}
.xp-page[data-chrome="frame"] .xp-panel::before{content:"";position:absolute;inset:8px;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);border-radius:max(0px,calc(var(--card-radius) - 6px));pointer-events:none}
.xp-page[data-chrome="blob"] .xp-panel{border-radius:calc(var(--card-radius) * 2.1) calc(var(--card-radius) * .8) calc(var(--card-radius) * 2.1) calc(var(--card-radius) * .8)}

/* 행동 */
.xp-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--element-gap) calc(var(--element-gap) * 1.6)}
.xp-page .xp-act{display:inline-flex;align-items:center;gap:.5em;padding:.78em 1.25em;border-radius:var(--control-radius);background:var(--action);color:var(--xp-action-text);font-size:var(--xp-small);font-weight:var(--xp-weight);line-height:1;text-decoration:none;transition:transform var(--motion-duration) var(--motion-easing),background var(--motion-duration) var(--motion-easing)}
.xp-page .xp-act:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--action) 88%,var(--text))}
.xp-quiet{font-size:var(--xp-small);font-weight:var(--xp-weight-mid)}
.xp-tags{display:flex;flex-wrap:wrap;gap:calc(var(--element-gap) * .6)}
.xp-case-body{display:grid;align-content:start;gap:calc(var(--component-gap) * 1.1);min-width:0}
.xp-tags li{padding:.42em .85em;border:var(--border-width) solid var(--border);border-radius:var(--control-radius);color:var(--xp-muted);font-size:var(--xp-small);line-height:1.3}

/* 첫 화면 */
.xp-hero{display:grid;gap:calc(var(--element-gap) * 1.5);padding-top:calc(var(--xp-section) * .4)}
.xp-hero .xp-name{margin-top:calc(var(--element-gap) * -.2)}
.xp-hero .xp-headline{margin-top:calc(var(--element-gap) * -.4)}
.xp-hero .xp-actions{margin-top:calc(var(--element-gap) * .5)}
.xp-hero[data-variant="split"]{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:var(--component-gap) calc(var(--component-gap) * 2);align-items:end}
.xp-hero[data-variant="split"] .xp-hero-side{display:grid;gap:calc(var(--element-gap) * 1.3)}
.xp-hero[data-variant="media"]{grid-template-columns:minmax(0,6fr) minmax(0,5fr);gap:calc(var(--component-gap) * 1.6);align-items:center}
.xp-hero[data-variant="media"] .xp-hero-text{display:grid;gap:calc(var(--element-gap) * 1.4)}
.xp-hero-art img{width:100%;aspect-ratio:4/3;object-fit:cover;border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface)}
.xp-hero-art figcaption{margin-top:10px}

/* 섹션 머리 */
.xp-block{display:grid;align-content:start;gap:calc(var(--component-gap) * 1.1);padding-top:calc(var(--xp-section) * .5);border-top:var(--xp-rule);container-type:inline-size}
.xp-head{display:grid;gap:calc(var(--element-gap) * .7);align-content:start}

/* 강조 — 번호를 세우는 방식 */
.xp-num{font-family:var(--font-display);font-weight:var(--xp-weight);font-variant-numeric:tabular-nums}
.xp-page[data-emphasis="boxed"] .xp-num{padding:.05em .3em;border:var(--border-width) solid var(--text);border-radius:var(--control-radius)}
.xp-page[data-emphasis="underlined"] .xp-num{padding-bottom:.04em;border-bottom:.12em solid var(--accent)}
.xp-page[data-emphasis="oversized"] .xp-num{font-size:1.35em}
.xp-page[data-emphasis="bar"] .xp-num{padding-left:.4em;border-left:.14em solid var(--accent)}

/* 작업 목록 */
.xp-index-list{display:grid;border-top:var(--xp-rule)}
.xp-index-list a{display:grid;grid-template-columns:3.2em minmax(0,1fr) auto;gap:var(--element-gap) calc(var(--element-gap) * 1.4);align-items:baseline;padding-block:calc(var(--element-gap) * 1.15);border-bottom:var(--xp-rule);color:inherit;text-decoration:none;transition:background var(--motion-duration) var(--motion-easing)}
.xp-index-list a:hover{background:color-mix(in srgb,var(--surface) 70%,transparent)}
.xp-index-list strong{display:block;font-family:var(--font-display);font-size:calc(var(--type-example-body) * 1.2);font-weight:var(--xp-weight);line-height:1.35;letter-spacing:var(--xp-tracking)}
.xp-index-list small{display:block;margin-top:4px}
.xp-index-list .xp-arrow{color:var(--xp-accent-text)}
.xp-index[data-variant="rail"] .xp-index-list a{grid-template-columns:2.4em minmax(0,1fr);padding-block:calc(var(--element-gap) * .8)}
.xp-index[data-variant="rail"] .xp-index-list strong{font-size:var(--type-example-body)}
.xp-index[data-variant="rail"] .xp-index-list :is(small,.xp-arrow){display:none}
.xp-mosaic{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--component-gap)}
.xp-mosaic a{display:grid;gap:calc(var(--element-gap) * .8);align-content:start;color:inherit;text-decoration:none}
.xp-mosaic img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:max(0px,calc(var(--card-radius) - 4px))}
.xp-mosaic strong{font-family:var(--font-display);font-size:calc(var(--type-example-body) * 1.15);font-weight:var(--xp-weight);line-height:1.35;letter-spacing:var(--xp-tracking)}

/* 사례 */
.xp-case-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:calc(var(--component-gap) * 1.4);align-items:start}
.xp-par{display:grid;grid-template-columns:minmax(4.5em,auto) minmax(0,1fr);gap:calc(var(--element-gap) * .9) calc(var(--element-gap) * 1.3)}
.xp-par dt{padding-top:.18em;color:var(--xp-muted);font-family:var(--font-mono);font-size:12px;letter-spacing:.04em}
.xp-par dd{line-height:1.6}
.xp-par dd+dt,.xp-par dd+dt+dd{padding-top:calc(var(--element-gap) * .9);border-top:var(--xp-rule)}
.xp-notes{display:grid;gap:calc(var(--element-gap) * 1.3);max-width:var(--measure)}
.xp-notes section{display:grid;gap:.35em}
.xp-metrics{padding-block:calc(var(--section-gap) * .5)}
.xp-metric-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr));gap:var(--component-gap);border-block:var(--xp-rule);padding-block:calc(var(--element-gap) * 1.6)}
.xp-metric-strip a{display:grid;gap:.35em;color:inherit;text-decoration:none}
.xp-metric-value{font-family:var(--font-display);font-weight:var(--xp-weight);letter-spacing:var(--xp-tracking);font-size:clamp(2rem,4.2vw,3.4rem);line-height:1;color:var(--xp-accent-text)}
.xp-metric-label{font-weight:var(--xp-weight-mid)}
.xp-compare-list{display:grid;gap:calc(var(--element-gap) * 1.6);align-content:start}
.xp-compare{display:grid;gap:.5em}
.xp-compare-label{font-weight:var(--xp-weight-mid)}
.xp-bar{display:grid;grid-template-columns:3.2em minmax(0,1fr) minmax(4.5em,auto);align-items:center;gap:.6em;min-height:2em}
/* 칸을 명시합니다. 막대가 2열을 먼저 차지하면 자동 배치가 이름표를 3열로, 값을 다음 줄로 밀어냅니다 */
.xp-bar>.xp-small{grid-column:1;grid-row:1}
.xp-bar-fill{grid-column:2;grid-row:1;height:1.4em;width:var(--w,100%);border-radius:var(--control-radius);background:var(--border)}
.xp-bar-value{grid-column:3;grid-row:1;font-family:var(--font-display);font-weight:var(--xp-weight);white-space:nowrap}
.xp-bar[data-tone="after"] .xp-bar-value{color:var(--xp-accent-text)}
.xp-steps{display:grid;gap:0;border-top:var(--xp-rule)}
.xp-steps li{display:grid;grid-template-columns:3.2em minmax(0,1fr);gap:calc(var(--element-gap) * 1.2);padding-block:calc(var(--element-gap) * 1.2);border-bottom:var(--xp-rule)}
.xp-steps li>div{display:grid;gap:.4em;max-width:var(--measure)}
.xp-gallery{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--element-gap)}
.xp-gallery figure:first-child{grid-row:span 2}
.xp-gallery figure:only-child{grid-column:1/-1}
.xp-figure img{width:100%;height:100%;min-height:180px;object-fit:cover;border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface)}
.xp-figure figcaption{margin-top:8px}
/* 본문 흐름의 그림은 원래 비율로 높이를 정합니다. 칸을 채우는 갤러리 · 격자 그림만 height:100%를 씁니다. */
.xp-case-body>.xp-figure img,.xp-row-body .xp-figure img{height:auto}
.xp-sources{display:flex;flex-wrap:wrap;gap:6px calc(var(--element-gap) * 1.4);font-size:var(--xp-small)}

/* 경력·근거·연락 */
.xp-timeline{display:grid;gap:0;border-top:var(--xp-rule)}
.xp-timeline li{display:grid;grid-template-columns:minmax(7.5em,auto) minmax(0,1fr);gap:var(--element-gap) calc(var(--element-gap) * 1.6);padding-block:calc(var(--element-gap) * 1.3);border-bottom:var(--xp-rule)}
.xp-timeline li>div{display:grid;gap:.3em;max-width:var(--measure)}
.xp-evidence-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--element-gap)}
.xp-evidence-list details{padding:calc(var(--element-gap) * 1.1) calc(var(--element-gap) * 1.2);border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface);--xp-muted:var(--xp-muted-surface)}
.xp-evidence-list summary{display:grid;gap:.3em;cursor:pointer;list-style:none}
.xp-evidence-list summary::-webkit-details-marker{display:none}
.xp-evidence-list summary strong{font-weight:var(--xp-weight);line-height:1.4}
.xp-evidence-list details[open] summary{margin-bottom:calc(var(--element-gap) * .8)}
.xp-contact{display:grid;gap:calc(var(--element-gap) * 1.2);justify-items:start}
.xp-footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding-top:calc(var(--element-gap) * 1.2);border-top:var(--xp-rule)}

/* 묶음 */
.xp-group{display:grid;align-items:start;gap:calc(var(--component-gap) * ${GROUP.gap});container-type:inline-size}
.xp-group>.xp-index[data-variant="rail"]{position:sticky;top:calc(var(--element-gap) * 2)}
.xp-group[data-group="columns"]{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.xp-group[data-group="columns"][data-variant="wide-start"]{grid-template-columns:minmax(0,${GROUP.wide}fr) minmax(0,1fr)}
.xp-group[data-group="columns"][data-variant="wide-end"]{grid-template-columns:minmax(0,1fr) minmax(0,${GROUP.wide}fr)}
.xp-group[data-group="grid"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.xp-group[data-group="band"]{padding:clamp(20px,3vw,calc(var(--component-gap) * 1.5));border-radius:var(--card-radius);background:var(--surface);--xp-muted:var(--xp-muted-surface)}
.xp-group[data-group="band"][data-variant="accent"]{background:transparent;border-top:3px solid var(--accent);border-radius:0}
.xp-group .xp-case-grid{grid-template-columns:minmax(0,1fr)}

/* 배치 — 넓은 여백은 머리를 왼쪽 단에, 촘촘한 격자는 간격을 줄이고 표를 펼칩니다 */
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block{grid-template-columns:minmax(${WM.minHead}px,${WM.head}fr) minmax(0,${WM.body}fr);column-gap:calc(var(--component-gap) * ${WM.gap})}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block>.xp-head{position:sticky;top:24px}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block>:not(.xp-head){grid-column:2}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block .xp-case-grid{grid-template-columns:minmax(0,1fr)}
.xp-page[data-layout="dense-grid"] .xp-inner{gap:calc(var(--xp-section) * .75)}
.xp-page[data-layout="dense-grid"] .xp-index[data-variant="rows"] .xp-index-list{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--component-gap)}
.xp-page[data-layout="single-column"] .xp-case-grid{grid-template-columns:minmax(0,1fr)}

/* 좁은 폭 — 한 열로 접습니다 */
@container (max-width:720px){
  .xp-case-grid,.xp-group[data-group="columns"][data-variant]{grid-template-columns:minmax(0,1fr)}
  .xp-par{grid-template-columns:minmax(0,1fr);gap:.25em}
  .xp-par dd+dt,.xp-par dd+dt+dd{border-top:0}
  .xp-par dd+dt{margin-top:calc(var(--element-gap) * .7);padding-top:calc(var(--element-gap) * .7);border-top:var(--xp-rule)}
  .xp-timeline li{grid-template-columns:minmax(0,1fr);gap:.35em}
}
@media (max-width:${COLLAPSE}px){
  .xp-hero[data-variant="split"],.xp-hero[data-variant="media"]{grid-template-columns:minmax(0,1fr)}
  .xp-page[data-layout="wide-margin"] .xp-inner>.xp-block{grid-template-columns:minmax(0,1fr)}
  .xp-page[data-layout="wide-margin"] .xp-inner>.xp-block>.xp-head{position:static}
  .xp-page[data-layout="wide-margin"] .xp-inner>.xp-block>:not(.xp-head){grid-column:1}
  .xp-page[data-layout="dense-grid"] .xp-index[data-variant="rows"] .xp-index-list{grid-template-columns:minmax(0,1fr)}
  .xp-gallery{grid-template-columns:minmax(0,1fr)}
  .xp-gallery figure:first-child{grid-row:auto}
  .xp-group[data-group="columns"][data-variant]{grid-template-columns:minmax(0,1fr)}
  .xp-group>.xp-index[data-variant="rail"]{position:static}
}

/* 유형 — 포스터형. 첫 화면은 창 폭 전체를 행동색 면으로 채웁니다.
   본문 영역 바깥 폭(--xp-bleed, .xp-page에 정의)은 창 폭 단위로만 계산해, 면과 글자 띠가 같은 경계를 씁니다. */
.xp-hero[data-variant="poster"]{position:relative;display:flex;flex-direction:column;gap:calc(var(--element-gap) * 1.1);min-height:min(92vh,980px);margin:calc(var(--xp-section) * -.7) calc(var(--xp-bleed) * -1) 0;padding:calc(var(--xp-section) * .5) var(--xp-bleed) 0;background-color:var(--action);color:var(--xp-action-text);overflow:hidden}
.xp-poster-role{font-family:var(--font-mono);font-size:var(--xp-small);letter-spacing:.08em;text-transform:uppercase}
.xp-poster-name{font-family:var(--font-display);font-weight:var(--xp-weight);letter-spacing:calc(var(--xp-tracking) - .02em);line-height:.9;font-size:clamp(4.2rem,19vw,17rem)}
/* 문서 기본 여백 초기화(.xp-page :is(h1 …))보다 우선해야 이름이 면의 아래쪽으로 내려갑니다. */
.xp-hero[data-variant="poster"] .xp-poster-name{margin-top:auto}
.xp-poster-name[data-name-length="medium"]{font-size:clamp(3.2rem,11.5vw,10.5rem)}
.xp-poster-name[data-name-length="long"]{font-size:clamp(2.5rem,7.2vw,6.8rem)}
.xp-poster-line{max-width:30ch;font-family:var(--font-display);font-size:clamp(1.15rem,1.7vw,1.55rem);line-height:1.35}
.xp-page .xp-poster-cue{align-self:flex-start;color:inherit;font-size:var(--xp-small);font-weight:var(--xp-weight);text-decoration:underline;text-underline-offset:.3em}
.xp-marquee{display:flex;overflow:hidden;margin:calc(var(--element-gap) * 1.4) calc(var(--xp-bleed) * -1) 0;border-top:1px solid color-mix(in srgb,var(--xp-action-text) 40%,transparent)}
.xp-marquee ul{display:flex;flex:none;gap:2.4rem;padding:.8em 1.2rem;font-family:var(--font-display);font-size:clamp(1rem,1.4vw,1.25rem);font-weight:var(--xp-weight);text-transform:uppercase;letter-spacing:.02em;white-space:nowrap}
.xp-marquee li::after{content:"✦";margin-left:2.4rem}
.xp-poster-about-text{max-width:28em;font-family:var(--font-display);font-size:clamp(1.45rem,2.7vw,2.5rem);font-weight:var(--xp-weight-mid);letter-spacing:var(--xp-tracking);line-height:1.3;text-wrap:pretty}
.xp-poster-index{display:grid;gap:var(--element-gap)}
.xp-poster-index ol{border-top:var(--xp-rule)}
.xp-poster-index a{display:grid;grid-template-columns:4ch minmax(0,1fr) minmax(0,20rem);gap:var(--element-gap) var(--component-gap);align-items:baseline;padding-block:1em;border-bottom:var(--xp-rule);color:inherit;text-decoration:none;transition:color var(--motion-duration) var(--motion-easing)}
.xp-poster-index strong{font-family:var(--font-display);font-size:clamp(1.45rem,6vw,4.2rem);text-wrap:balance;font-weight:var(--xp-weight);letter-spacing:var(--xp-tracking);line-height:1.02}
.xp-poster-index a:hover{color:var(--xp-accent-text)}
.xp-page[data-archetype="poster"] .xp-case .xp-h2{font-size:clamp(2.2rem,4.6vw,4.4rem);line-height:1.04;text-wrap:balance}
/* 넓은 여백 배치에서 제목은 좁은 왼쪽 단에 놓입니다. 한글 다섯 글자 낱말이 그 단 한 줄에 들어가는 크기를 넘지 않습니다 */
.xp-page[data-archetype="poster"][data-layout="wide-margin"] .xp-inner>.xp-block>.xp-head{container-type:inline-size}
.xp-page[data-archetype="poster"][data-layout="wide-margin"] .xp-inner>.xp-block>.xp-head .xp-h2{font-size:clamp(1.6rem,calc(100cqi / 5),4.4rem)}
.xp-page[data-archetype="poster"] .xp-case .xp-eyebrow .xp-num{display:block;margin-bottom:.15em;font-family:var(--font-display);font-size:clamp(3rem,7vw,6.4rem);line-height:1;color:var(--xp-accent-text)}
.xp-page[data-archetype="poster"] .xp-contact{border:0;box-shadow:none;background:var(--action);color:var(--xp-action-text);padding:clamp(28px,6vw,84px)}
.xp-page[data-archetype="poster"] .xp-contact .xp-eyebrow{color:inherit}
.xp-page[data-archetype="poster"] .xp-contact .xp-h2{font-size:clamp(3rem,9vw,8rem);line-height:.95}
.xp-page[data-archetype="poster"] .xp-contact .xp-act{background:var(--xp-action-text);color:var(--action)}

/* 유형 — 글 · 목록형. 큰 소개 문장 아래 "기간 · 제목 · 요약" 행이 붙어 이어집니다. */
.xp-hero[data-variant="sentence"]{display:grid;gap:calc(var(--element-gap) * 1.2);max-width:min(100%,54rem);padding-top:calc(var(--xp-section) * .3)}
.xp-sentence-meta{font-size:var(--xp-small);color:var(--xp-muted)}
.xp-sentence-meta strong{color:var(--text);font-weight:var(--xp-weight)}
.xp-sentence{font-family:var(--font-display);font-size:clamp(1.9rem,3.3vw,3.1rem);font-weight:var(--xp-weight-mid);letter-spacing:var(--xp-tracking);line-height:1.2}
.xp-sentence-intro{max-width:var(--measure);color:var(--xp-muted)}
.xp-sentence-focus{display:flex;flex-wrap:wrap;gap:.3em .9em;font-size:var(--xp-small);color:var(--xp-muted)}
.xp-sentence-focus li+li::before{content:"·";margin-right:.9em}
.xp-inner>.xp-row-heading+.xp-row{margin-top:calc(var(--xp-section) * -1 + var(--element-gap))}
.xp-inner>.xp-row+.xp-row{margin-top:calc(var(--xp-section) * -1)}
.xp-row{border-bottom:var(--xp-rule)}
.xp-row-heading+.xp-row{border-top:var(--xp-rule)}
.xp-row summary{display:grid;grid-template-columns:9.5rem minmax(0,1fr) minmax(0,1.25fr) 1.5rem;gap:var(--element-gap) var(--component-gap);align-items:baseline;padding-block:1.05em;cursor:pointer;list-style:none}
.xp-row summary:not(:has(.xp-row-period)){grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) 1.5rem}
.xp-row summary::-webkit-details-marker{display:none}
.xp-row-title{font-family:var(--font-display);font-size:calc(var(--type-example-body) * 1.15);font-weight:var(--xp-weight)}
.xp-row-summary{color:var(--xp-muted)}
.xp-row-toggle{justify-self:end;color:var(--xp-accent-text);transition:transform var(--motion-duration) var(--motion-easing)}
.xp-row details[open] .xp-row-toggle{transform:rotate(45deg)}
.xp-row summary:hover .xp-row-title{color:var(--xp-accent-text)}
.xp-row-body{display:grid;gap:var(--element-gap);max-width:calc(var(--measure) + 10rem);padding:0 0 1.6em calc(9.5rem + var(--component-gap))}
.xp-row summary:not(:has(.xp-row-period))+.xp-row-body{padding-left:0}
.xp-row-body .xp-figure{max-width:40rem}
.xp-page[data-archetype="list"] .xp-contact{border:0;box-shadow:none;background:transparent;padding:0}
/* 유형의 좁은 폭 규칙은 유형 규칙 뒤에 둡니다. 같은 우선순위에서 앞의 좁은 폭 블록에 두면 넓은 폭 규칙이 이깁니다. */
@media (max-width:${COLLAPSE}px){
  .xp-hero[data-variant="poster"]{min-height:min(84vh,760px)}
  .xp-poster-index a{grid-template-columns:3ch minmax(0,1fr)}
  .xp-poster-index a>.xp-small{grid-column:2}
  .xp-row summary,.xp-row summary:not(:has(.xp-row-period)){grid-template-columns:minmax(0,1fr) 1.5rem}
  .xp-row summary>:not(.xp-row-toggle){grid-column:1}
  .xp-row-toggle{grid-column:2;grid-row:1}
  .xp-row-body{padding-left:0}
}

/* 지면 변화 — 크기(data-scale) · 배경(data-surface) · 폭(data-width). 섹션마다 값을 달리해 같은 모양이 반복되지 않게 합니다.
   유형 규칙과 같은 우선순위이므로 유형 규칙 뒤에 둡니다. */
/* 크기: lead는 사례 첫머리를 크게 그리는 표지, compact는 작게 줄인 사례입니다 */
.xp-block[data-scale="lead"]{gap:calc(var(--component-gap) * 1.5);padding-bottom:calc(var(--xp-section) * .3)}
.xp-block[data-scale="lead"]>.xp-head{gap:calc(var(--element-gap) * 1.1)}
.xp-block[data-scale="lead"]>.xp-head .xp-eyebrow .xp-num{display:block;margin-bottom:.12em;font-family:var(--font-display);font-size:clamp(3.4rem,9vw,8rem);line-height:.9;letter-spacing:calc(var(--xp-tracking) * 2);color:var(--xp-accent-text)}
.xp-block[data-scale="lead"]>.xp-head .xp-h2{max-width:20ch;font-size:clamp(2.2rem,4.6vw,calc(var(--type-example-display) * 1.2));line-height:1.05;text-wrap:balance}
.xp-block[data-scale="lead"]>.xp-head .xp-lead{max-width:38ch;font-family:var(--font-display);font-size:clamp(1.15rem,1.5vw,1.5rem);line-height:1.4}
.xp-block[data-scale="compact"]{gap:var(--component-gap)}
.xp-block[data-scale="compact"] .xp-h2{font-size:calc(var(--xp-h2) * .78)}
.xp-block[data-scale="compact"] .xp-lead{font-size:var(--type-example-body)}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block[data-scale="lead"]>.xp-head{grid-column:1/-1;position:static}
/* 배경: field는 디자인의 행동색 면, inverse는 본문색과 바탕색을 뒤집은 면입니다. 글자 · 선 · 막대 색을 그 면에 맞춰 다시 정합니다 */
.xp-block:is([data-surface="field"],[data-surface="inverse"]){padding:clamp(24px,3.6vw,calc(var(--component-gap) * 2));border-top:0;border-radius:var(--card-radius)}
.xp-block[data-surface="field"]{--xp-on:var(--xp-action-text);background:var(--action);color:var(--xp-action-text);--xp-muted:var(--xp-muted-field);--xp-muted-surface:var(--xp-muted-field);--xp-accent-text:var(--xp-action-text);--xp-bar-after:var(--xp-action-text);--xp-num-bg:var(--xp-action-text);--xp-num-text:var(--action)}
.xp-block[data-surface="inverse"]{--xp-on:var(--canvas);background:var(--text);color:var(--canvas);--xp-muted:var(--xp-muted-inverse);--xp-muted-surface:var(--xp-muted-inverse);--xp-accent-text:var(--xp-accent-inverse);--xp-bar-after:var(--xp-accent-inverse);--xp-num-bg:var(--xp-accent-inverse);--xp-num-text:var(--text)}
.xp-block:is([data-surface="field"],[data-surface="inverse"]) *{border-color:color-mix(in srgb,var(--xp-on) 28%,transparent)}
.xp-block:is([data-surface="field"],[data-surface="inverse"]) :is(.xp-body p,.xp-par dd,.xp-h3){color:inherit}
.xp-block:is([data-surface="field"],[data-surface="inverse"]) .xp-panel{background:color-mix(in srgb,var(--xp-on) 7%,transparent);box-shadow:none}
.xp-block:is([data-surface="field"],[data-surface="inverse"]) .xp-bar-fill{background:color-mix(in srgb,var(--xp-on) 30%,transparent)}
/* 폭: bleed는 창 폭 전체로 넓히고 안쪽 여백을 본문 폭 경계에 맞춥니다. 최상위 블록에서만 넓힙니다 */
.xp-inner>.xp-block[data-width="bleed"]{margin-inline:calc(var(--xp-bleed) * -1);padding-inline:var(--xp-bleed);border-radius:0}
.xp-inner>.xp-block[data-width="bleed"]:not([data-surface]){border-bottom:var(--xp-rule)}

/* 큰 인용 */
.xp-quote{gap:calc(var(--element-gap) * 1.2);padding-block:calc(var(--xp-section) * .45)}
.xp-quote-text p{max-width:24ch;font-family:var(--font-display);font-size:clamp(1.7rem,3.4vw,3.1rem);font-weight:var(--xp-weight-mid);letter-spacing:var(--xp-tracking);line-height:1.22;text-wrap:balance}
.xp-quote-text p::before{content:"“";display:block;height:.55em;margin-bottom:.1em;color:var(--xp-accent-text);font-size:1.9em;line-height:1}
.xp-quote[data-scale="lead"] .xp-quote-text p{max-width:20ch;font-size:clamp(2.2rem,5.4vw,5rem);line-height:1.1}
.xp-quote[data-scale="compact"] .xp-quote-text p{max-width:34ch;font-size:clamp(1.3rem,2.2vw,1.9rem)}
.xp-quote figcaption a{color:inherit}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block:is(.xp-quote,.xp-metrics)>*{grid-column:1/-1}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block:is(.xp-quote,.xp-metrics){grid-template-columns:minmax(0,1fr)}

/* 수치 강조 줄 — 색면 · 반전 띠 위에서는 위아래 선을 걷습니다 */
.xp-metrics:is([data-surface="field"],[data-surface="inverse"]) .xp-metric-strip{border-block:0;padding-block:0}

/* 전후 막대 — 숫자를 못 읽은 값은 같은 너비의 외곽선으로 그립니다 */
.xp-bar[data-tone="after"] .xp-bar-fill{background:var(--xp-bar-after,var(--action))}
.xp-compare[data-bars="neutral"] .xp-bar-fill{background:transparent;border:var(--border-width) dashed var(--border);border-color:color-mix(in srgb,currentColor 35%,transparent)}

/* 과정 흐름 — 번호 · 연결선을 가로로 잇고, 좁은 폭에서는 세로로 잇습니다 */
.xp-flow{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:calc(var(--element-gap) * .8)}
.xp-flow li{display:grid;align-content:start;gap:.5em}
.xp-flow-mark{display:flex;align-items:center;gap:.6em;margin-bottom:.35em}
.xp-flow-num{display:inline-grid;place-items:center;min-width:2.4em;height:2.4em;padding-inline:.3em;border-radius:var(--control-radius);background:var(--xp-num-bg,var(--action));color:var(--xp-num-text,var(--xp-action-text));font-family:var(--font-display);font-size:var(--xp-small);font-weight:var(--xp-weight);font-variant-numeric:tabular-nums}
.xp-flow-line{position:relative;flex:1;height:0;border-top:2px solid var(--border)}
.xp-flow-line::after{content:"";position:absolute;right:0;top:-1px;width:.5em;height:.5em;border-top:2px solid var(--border);border-right:2px solid var(--border);transform:translateY(-50%) rotate(45deg)}
.xp-flow li:last-child .xp-flow-line{visibility:hidden}
.xp-flow-label{font-family:var(--font-display);font-size:calc(var(--type-example-body) * 1.08);font-weight:var(--xp-weight);line-height:1.3}
.xp-flow-text{color:var(--xp-muted);font-size:var(--xp-small);line-height:1.55}
.xp-block[data-scale="lead"] .xp-flow-label{font-size:calc(var(--type-example-body) * 1.25)}
@container (max-width:720px){
  .xp-flow{grid-auto-flow:row;gap:0}
  .xp-flow li{grid-template-columns:2.4em minmax(0,1fr);column-gap:calc(var(--element-gap) * 1.1);padding-bottom:calc(var(--element-gap) * 1.2)}
  .xp-flow-mark{grid-row:1/span 2;flex-direction:column;align-self:stretch;margin:0}
  .xp-flow-num{font-size:12px}
  .xp-flow-line{width:0;height:auto;min-height:1.2em;border-top:0;border-left:2px solid var(--border)}
  .xp-flow-line::after{display:none}
  .xp-flow-label,.xp-flow-text{grid-column:2}
}

/* 이미지 전시 — 첫 이미지를 지면 폭으로, 머리와 본문을 그 아래 두 단으로 둡니다 */
.xp-showcase{gap:calc(var(--component-gap) * 1.3)}
.xp-showcase-art img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface)}
.xp-showcase-art figcaption{margin-top:8px}
.xp-showcase-text{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:calc(var(--component-gap) * 1.6);align-items:start}
.xp-inner>.xp-showcase[data-width="bleed"] .xp-showcase-art{margin-inline:calc(var(--xp-bleed) * -1)}
.xp-inner>.xp-showcase[data-width="bleed"] .xp-showcase-art img{border-inline:0;border-radius:0}
.xp-inner>.xp-showcase[data-width="bleed"] .xp-showcase-art figcaption{padding-inline:var(--xp-bleed)}
/* 넓은 여백 배치의 "머리 아닌 자식은 2열" 규칙(우선순위 0,5,0)을 이기려고 .xp-block을 함께 씁니다 */
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block.xp-showcase>*{grid-column:1/-1}
.xp-page[data-layout="wide-margin"] .xp-inner>.xp-block.xp-showcase{grid-template-columns:minmax(0,1fr)}
@container (max-width:720px){
  .xp-showcase-text{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:${COLLAPSE}px){
  .xp-block:is([data-surface="field"],[data-surface="inverse"]){padding:clamp(20px,6vw,32px)}
  .xp-inner>.xp-block[data-width="bleed"]{padding-inline:var(--xp-bleed)}
  .xp-showcase-text{grid-template-columns:minmax(0,1fr)}
}

/* 모션 — 디자인의 시간·곡선·간격. 등장 규칙은 위 REVEAL_* 주석을 봅니다 */
.xp-page{--xp-reveal-rise:var(--element-gap);--xp-reveal-step:var(--component-gap)}
@keyframes xp-rise{from{opacity:0;transform:translateY(var(--xp-reveal-rise))}to{opacity:1;transform:none}}
@keyframes xp-settle{to{opacity:1;transform:none}}
@keyframes xp-marquee{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@media (prefers-reduced-motion:no-preference){
  .xp-marquee ul{animation:xp-marquee 32s linear infinite}
  ${REVEAL_ON} .xp-hero:not(${REVEAL_OFF})>*{animation:xp-rise calc(var(--motion-duration) * 3) var(--motion-easing) both}
  ${REVEAL_ON} .xp-hero:not(${REVEAL_OFF})>:nth-child(2){animation-delay:60ms}
  ${REVEAL_ON} .xp-hero:not(${REVEAL_OFF})>:nth-child(3){animation-delay:120ms}
  ${REVEAL_ON} .xp-hero:not(${REVEAL_OFF})>:nth-child(n+4){animation-delay:180ms}
  @supports (animation-timeline:view()){
    ${revealUnits("")}{animation:xp-rise var(--motion-easing) both,xp-settle linear forwards;animation-timeline:view(),scroll(root);animation-range:cover 0% cover ${REVEAL_ZONE},${REVEAL_TAIL}}
    ${revealUnits(":nth-child(2)")}{animation-range:cover var(--xp-reveal-step) cover calc(${REVEAL_ZONE} + var(--xp-reveal-step)),${REVEAL_TAIL}}
    ${revealUnits(":nth-child(3)")}{animation-range:cover calc(var(--xp-reveal-step) * 2) cover calc(${REVEAL_ZONE} + var(--xp-reveal-step) * 2),${REVEAL_TAIL}}
    ${revealUnits(":nth-child(n+4)")}{animation-range:cover calc(var(--xp-reveal-step) * 3) cover calc(${REVEAL_ZONE} + var(--xp-reveal-step) * 3),${REVEAL_TAIL}}
  }
}
@media print{
  .xp-page *{animation:none!important;transition:none!important}
  .xp-page{min-height:0}
  .xp-page[data-layout="wide-margin"] .xp-inner>.xp-block>.xp-head{position:static}
}
`;
