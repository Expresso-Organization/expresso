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

export const KIT_CSS = String.raw`
.xp-page{--xp-pad:clamp(20px,5vw,56px);--xp-section:var(--section-gap);--xp-rule:var(--border-width) solid var(--border);--xp-small:max(13px,calc(var(--type-example-body) * .86));--xp-name:clamp(2.6rem,5.2vw + 1rem,calc(var(--type-example-display) * 1.3));--xp-h2:clamp(1.55rem,1.6vw + 1rem,var(--type-example-heading));
  min-height:100vh;margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);font-size:var(--type-example-body);line-height:var(--line-example-body);word-break:keep-all;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
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
.xp-page[data-chrome="sticker"] .xp-panel{transform:rotate(-.6deg)}
.xp-page[data-chrome="sticker"] .xp-panel:nth-of-type(2n){transform:rotate(.5deg)}
.xp-page[data-chrome="panel"] .xp-panel::before{content:"";position:absolute;inset:0 0 auto;height:1px;border-radius:var(--card-radius) var(--card-radius) 0 0;background:color-mix(in srgb,var(--canvas) 55%,white);pointer-events:none}
.xp-page[data-chrome="frame"] .xp-panel::before{content:"";position:absolute;inset:8px;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);border-radius:max(0px,calc(var(--card-radius) - 6px));pointer-events:none}
.xp-page[data-chrome="blob"] .xp-panel{border-radius:calc(var(--card-radius) * 2.1) calc(var(--card-radius) * .8) calc(var(--card-radius) * 2.1) calc(var(--card-radius) * .8)}

/* 행동 */
.xp-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--element-gap) calc(var(--element-gap) * 1.6)}
.xp-page .xp-act{display:inline-flex;align-items:center;gap:.5em;padding:.78em 1.25em;border-radius:var(--control-radius);background:var(--action);color:var(--xp-action-text);font-size:var(--xp-small);font-weight:var(--xp-weight);line-height:1;text-decoration:none;transition:transform var(--motion-duration) var(--motion-easing),background var(--motion-duration) var(--motion-easing)}
.xp-page .xp-act:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--action) 88%,var(--text))}
.xp-quiet{font-size:var(--xp-small);font-weight:var(--xp-weight-mid)}
.xp-tags{display:flex;flex-wrap:wrap;gap:calc(var(--element-gap) * .6)}
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
.xp-steps{display:grid;gap:0;border-top:var(--xp-rule)}
.xp-steps li{display:grid;grid-template-columns:3.2em minmax(0,1fr);gap:calc(var(--element-gap) * 1.2);padding-block:calc(var(--element-gap) * 1.2);border-bottom:var(--xp-rule)}
.xp-steps li>div{display:grid;gap:.4em;max-width:var(--measure)}
.xp-gallery{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--element-gap)}
.xp-gallery figure:first-child{grid-row:span 2}
.xp-gallery figure:only-child{grid-column:1/-1}
.xp-figure img{width:100%;height:100%;min-height:180px;object-fit:cover;border:var(--border-width) solid var(--border);border-radius:var(--card-radius);background:var(--surface)}
.xp-figure figcaption{margin-top:8px}
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

/* 모션 — 디자인의 시간·곡선. JavaScript 없이 보이고, 모션 감소·인쇄에서 꺼집니다 */
@keyframes xp-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:no-preference){
  .xp-page:not([data-motion="none"]) .xp-hero>*{animation:xp-rise calc(var(--motion-duration) * 3) var(--motion-easing) both}
  .xp-page:not([data-motion="none"]) .xp-hero>:nth-child(2){animation-delay:60ms}
  .xp-page:not([data-motion="none"]) .xp-hero>:nth-child(3){animation-delay:120ms}
  .xp-page:not([data-motion="none"]) .xp-hero>:nth-child(n+4){animation-delay:180ms}
  @supports (animation-timeline:view()){
    .xp-page[data-motion="showcase"] .xp-inner>.xp-block{animation:xp-rise linear both;animation-timeline:view();animation-range:entry 0% entry 28%}
  }
}
@media print{
  .xp-page *{animation:none!important;transition:none!important}
  .xp-page{min-height:0}
  .xp-page[data-layout="wide-margin"] .xp-inner>.xp-block>.xp-head{position:static}
}
`;
