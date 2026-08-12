// **타입만** 가져온다. page.ts가 이 파일을 값으로 쓰므로, 여기서 page.ts의 값을
// 로드 시점에 읽으면 순환 참조로 한쪽이 undefined가 된다.
import type { PageStyleGrammar } from "./page.js";

/**
 * 지면 키트.
 *
 * **매 생성마다 다시 만들 이유가 없는 것들**을 한 벌로 묶어 둔 것이다. 실측하니
 * 세 장이 똑같은 부품 일곱 종(내비 · 푸터 · 섹션 머리 · 카드 · 칩 · 스펙 행 ·
 * 그래프)을 각자 처음부터 만들고 있었다. 장당 CSS 선언 170–220개인데 그 중
 * 이 사람 것이어야 하는 부분은 얼마 되지 않는다.
 *
 * 가르는 기준은 하나다 — **모델이 못하거나 비싸게 하는 것은 여기로, 잘하는 것은
 * 모델에게.** 모션 · 접근성 · 반응형 · 대비는 매번 발명할 값이 없고, 무엇을
 * 강조할지와 어떻게 쓸지는 모델이 훨씬 낫다.
 *
 * 이건 옛 클래스 어휘와 다르다. 어휘는 모델이 **고를 수만** 있는 유틸리티 목록에
 * 고정 DOM이었고, 키트는 **가져다 쓸 수 있는 부품**이다. 모델은 여전히 제 마크업을
 * 짜고 제 CSS를 얹는다.
 */

/** 키트를 고치면 올린다. 낡은 지면이 어느 판으로 그려졌는지 가려낸다. */
export const PAGE_KIT_VERSION = 1;

/** 문법이 정한 값을 CSS 변수로 편다. 키트 전체가 이 변수만 보고 돈다. */
export function pageKitVariables(style: PageStyleGrammar): string {
  const scale = { compact: 0.94, comfortable: 1, spacious: 1.08 }[style.density];
  const rhythm = { compact: 0.72, comfortable: 1, spacious: 1.45 }[style.density];
  const body = { compact: 15, comfortable: 16, spacious: 17 }[style.density];
  const leading = { compact: 1.5, comfortable: 1.7, spacious: 1.9 }[style.density];
  const serif = style.font === "serif";
  return `:root{
  --k-bg:${style.background};
  --k-text:${style.text};
  --k-accent:${style.accent};
  /* 본문에서 한 단 낮춘 글자색. 대비를 잃지 않도록 투명도가 아니라 혼합으로 만든다. */
  --k-muted:color-mix(in oklab, var(--k-text) 62%, var(--k-bg));
  --k-hair:color-mix(in oklab, var(--k-text) 16%, var(--k-bg));
  --k-veil:color-mix(in oklab, var(--k-text) 5%, var(--k-bg));
  --k-body:${body}px;
  --k-lead:${leading};
  --k-step1:${(1.25 * scale).toFixed(3)}rem;
  --k-step2:${(1.6 * scale).toFixed(3)}rem;
  --k-step3:${(2.1 * scale).toFixed(3)}rem;
  --k-step4:clamp(2.2rem, ${(3.4 * scale).toFixed(2)}vw + 1rem, ${(3.6 * scale).toFixed(3)}rem);
  --k-gap:${(1.5 * rhythm).toFixed(3)}rem;
  --k-section:${(5 * rhythm).toFixed(3)}rem;
  --k-measure:${serif ? 38 : 42}rem;
  --k-wide:74rem;
  --k-font:${serif ? "var(--page-serif)" : "var(--page-sans)"};
  --k-font-body:${serif ? "var(--page-serif)" : "var(--page-sans)"};
  --k-font-mono:var(--page-mono);
}`;
}

/**
 * 부품과 모션.
 *
 * **스크립트가 하나도 없다.** 등장 · 순차 지연 · 진행 막대 · 카운트업이 전부
 * 스크롤 구동 애니메이션과 `@property`로 돈다. 우리가 스크립트를 막고 있어서
 * 고른 길이 아니라, 이쪽이 더 가볍고 더 안전해서 고른 길이다.
 */
export const PAGE_KIT_CSS = String.raw`
/* ── 지면 ─────────────────────────────────────────────── */
.k-page{background:var(--k-bg);color:var(--k-text);font-family:var(--k-font-body);
  font-size:var(--k-body);line-height:var(--k-lead)}
.k-wrap{width:min(100% - 2.5rem, var(--k-wide));margin-inline:auto}
.k-narrow{max-width:var(--k-measure)}

/* ── 크롬 ─────────────────────────────────────────────── */
.k-nav{position:sticky;top:0;z-index:10;display:flex;align-items:center;
  justify-content:space-between;gap:1rem;padding:.85rem 0;
  background:color-mix(in oklab, var(--k-bg) 88%, transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--k-hair)}
.k-nav__mark{font-family:var(--k-font);font-weight:600;letter-spacing:-.01em}
.k-nav__links{display:flex;gap:1.25rem;flex-wrap:wrap;font-size:.86em;color:var(--k-muted)}
.k-nav__links a{color:inherit;text-decoration:none;position:relative;padding-bottom:2px}
.k-nav__links a::after{content:"";position:absolute;inset:auto 0 0;height:1px;
  background:var(--k-accent);scale:0 1;transform-origin:0 50%;transition:scale .18s ease}
.k-nav__links a:hover::after,.k-nav__links a:focus-visible::after{scale:1 1}
/* 스크롤한 만큼 차오르는 막대. 스크립트 없이 스크롤 타임라인으로 돈다. */
.k-progress{display:none}
@supports (animation-timeline: scroll(root)){
  .k-progress{display:block;position:fixed;inset:0 0 auto;height:2px;
    background:var(--k-accent);z-index:20;transform-origin:0 50%;
    animation:k-grow linear both;animation-timeline:scroll(root)}
}
@keyframes k-grow{from{scale:0 1}to{scale:1 1}}
.k-foot{margin-top:var(--k-section);padding:2rem 0 3rem;border-top:1px solid var(--k-hair);
  display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));
  font-size:.86em;color:var(--k-muted)}
.k-foot dt{font-family:var(--k-font-mono);font-size:.8em;letter-spacing:.08em;
  text-transform:uppercase;margin-bottom:.35rem}
.k-foot dd{margin:0;color:var(--k-text)}

/* ── 섹션 ─────────────────────────────────────────────── */
.k-section{padding-block:var(--k-section);border-top:1px solid var(--k-hair)}
.k-section:first-of-type{border-top:0}
.k-eyebrow{font-family:var(--k-font-mono);font-size:.74em;letter-spacing:.16em;
  text-transform:uppercase;color:var(--k-accent);margin-bottom:.6rem}
.k-num{font-family:var(--k-font-mono);font-size:.74em;color:var(--k-muted);margin-right:.6rem}
.k-title{font-family:var(--k-font);font-size:var(--k-step2);line-height:1.25;
  letter-spacing:-.015em;font-weight:600;margin:0}
.k-lede{font-family:var(--k-font);font-size:var(--k-step1);line-height:1.45;
  letter-spacing:-.01em;margin:.5rem 0 0}
.k-meta{font-size:.82em;color:var(--k-muted);margin-top:.5rem}
.k-prose{max-width:var(--k-measure)}
.k-prose p{margin:0 0 .9em}
.k-prose p:last-child{margin-bottom:0}
.k-prose strong{font-weight:600;color:var(--k-text)}

/* ── 첫 화면 ──────────────────────────────────────────── */
.k-hero{padding-block:calc(var(--k-section) * 1.1) var(--k-section)}
.k-hero__title{font-family:var(--k-font);font-size:var(--k-step4);line-height:1.12;
  letter-spacing:-.03em;font-weight:700;margin:0}
.k-hero__lede{max-width:var(--k-measure);margin:1.2rem 0 0;color:var(--k-muted);
  font-size:1.05em}

/* ── 격자와 칸 ────────────────────────────────────────── */
.k-grid{display:grid;gap:var(--k-gap);grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))}
.k-card{border:1px solid var(--k-hair);border-radius:.9rem;padding:1.35rem;
  transition:border-color .18s ease, transform .18s ease}
.k-card:hover{border-color:color-mix(in oklab, var(--k-accent) 45%, var(--k-hair));
  transform:translateY(-2px)}
.k-metric{display:flex;flex-direction:column;gap:.3rem;min-width:0}
.k-metric__v{font-family:var(--k-font-mono);font-size:var(--k-step3);line-height:1;
  font-weight:600;letter-spacing:-.02em}
.k-metric__u{font-size:.5em;margin-left:.15em;color:var(--k-muted)}
.k-metric__l{font-size:.82em;color:var(--k-muted)}

/* ── 칩 ───────────────────────────────────────────────── */
.k-chips{display:flex;flex-wrap:wrap;gap:.45rem;list-style:none;padding:0;margin:0}
.k-chip{display:inline-flex;align-items:center;font-family:var(--k-font-mono);
  font-size:.8em;padding:.32em .7em;border:1px solid var(--k-hair);border-radius:999px;
  transition:border-color .18s ease, color .18s ease}
.k-chip:hover{border-color:var(--k-accent);color:var(--k-accent)}

/* ── 스펙 행 ──────────────────────────────────────────── */
.k-specs{margin:0;display:grid;gap:0}
.k-spec{display:grid;grid-template-columns:minmax(5rem,10rem) 1fr;gap:1.25rem;
  align-items:baseline;padding:.85rem 0;border-bottom:1px solid var(--k-hair)}
.k-spec__k{font-family:var(--k-font-mono);font-size:.78em;letter-spacing:.06em;
  color:var(--k-muted);margin:0}
.k-spec__v{margin:0;min-width:0}

/* ── 막대 그래프 ──────────────────────────────────────── */
.k-bars{display:grid;gap:.55rem;margin:0}
.k-bar{display:grid;grid-template-columns:minmax(4rem,7rem) 1fr auto;gap:.85rem;
  align-items:center}
.k-bar__k{font-size:.82em;color:var(--k-muted);min-width:0}
.k-bar__track{display:block;height:.85rem;border-radius:999px;background:var(--k-veil);
  overflow:hidden}
/* display:block이 여기 있어야 한다. inline이면 폭도 높이도 먹지 않는다. */
.k-bar__fill{display:block;height:100%;border-radius:999px;background:var(--k-accent);
  width:var(--k-pct,0%);transform-origin:0 50%}
@supports (animation-timeline: view()){
  .k-bar__fill{animation:k-fill linear both;animation-timeline:view();
    animation-range:entry 10% cover 32%}
}
@keyframes k-fill{from{scale:0 1}to{scale:1 1}}
.k-bar__v{font-family:var(--k-font-mono);font-weight:600;white-space:nowrap}
.k-bar__u{font-size:.72em;color:var(--k-muted);margin-left:.1em}

/* ── 강조 상자 ────────────────────────────────────────── */
.k-callout{border-left:3px solid var(--k-accent);background:var(--k-veil);
  padding:1rem 1.2rem;border-radius:0 .6rem .6rem 0}

/* ── 등장 ─────────────────────────────────────────────── */
/*
 * **반드시 @supports 안에 있어야 한다.**
 *
 * 이 애니메이션은 opacity:0에서 시작한다. 스크롤 타임라인을 모르는 브라우저에서
 * animation-timeline은 조용히 무시되고 both만 남아, 첫 프레임에 멈춘 채
 * **본문이 통째로 안 보인다.** 지면이 못생겨지는 정도가 아니라 없어진다.
 * 실제로 이 가드를 빼먹고 만들었다가 스크린샷에서 섹션 다섯이 사라진 걸 봤다.
 */
@supports (animation-timeline: view()){
  .k-reveal{animation:k-rise linear both;animation-timeline:view();
    animation-range:entry 0% cover 26%}
  /* 자식이 하나씩 올라온다. 마크업은 --i만 주면 된다. */
  .k-stagger > *{animation:k-rise linear both;animation-timeline:view();
    animation-range:entry 0% cover 22%;animation-delay:calc(var(--i,0) * 55ms)}
}
@keyframes k-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* ── 골격 ─────────────────────────────────────────────── */
/* 단일 칼럼 — 읽는 흐름이 하나다. */
.k-page--single-column .k-section > .k-wrap > *{max-width:var(--k-measure)}
.k-page--single-column .k-bars,
.k-page--single-column .k-grid,
.k-page--single-column .k-specs{max-width:none}

/* 밀도 격자 — 왼쪽 메타, 오른쪽 내용. 정보 축이 둘이다. */
.k-page--dense-grid .k-section > .k-wrap{display:grid;gap:var(--k-gap);
  grid-template-columns:minmax(0,15rem) minmax(0,1fr)}
.k-page--dense-grid .k-section__meta{position:sticky;top:4.5rem;align-self:start}
.k-page--dense-grid .k-section__body{display:grid;gap:var(--k-gap);min-width:0}
.k-page--dense-grid .k-hero .k-wrap{grid-template-columns:1fr}

/* 넓은 여백 — 문단을 좁게 세우고 둘레를 비운다. 테두리 대신 여백으로 가른다. */
.k-page--wide-margin{--k-wide:64rem}
.k-page--wide-margin .k-section{border-top:0;padding-block:calc(var(--k-section) * 1.3)}
.k-page--wide-margin .k-card{border:0;padding:0}
.k-page--wide-margin .k-title{font-size:var(--k-step3)}

/* ── 변형 ─────────────────────────────────────────────
 *
 * 부품을 늘리는 대신 **같은 부품의 다른 모습**을 둔다. 실려 나가는 CSS는 한 번
 * 늘지만 지면이 낼 수 있는 모습은 곱으로 늘어난다. 키트가 있으면 모든 지면이
 * 같아 보인다는 걱정의 답이 여기다 — 모델은 섹션마다 다른 변형을 고를 수 있다.
 */
/* 첫 화면 */
.k-hero--split .k-wrap{display:grid;gap:var(--k-gap);
  grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:end}
.k-hero--centered{text-align:center}
.k-hero--centered .k-hero__lede{margin-inline:auto}
.k-hero--oversized .k-hero__title{font-size:calc(var(--k-step4) * 1.28);letter-spacing:-.04em}
.k-hero--rule{border-bottom:1px solid var(--k-hair)}

/* 섹션 — dense-grid에서 메타를 오른쪽으로 넘기거나, 위로 올리거나 */
.k-page--dense-grid .k-section--reverse > .k-wrap{grid-template-columns:minmax(0,1fr) minmax(0,15rem)}
.k-page--dense-grid .k-section--reverse .k-section__meta{order:2}
.k-page--dense-grid .k-section--stacked > .k-wrap{grid-template-columns:1fr}
.k-section--flush{border-top:0}
.k-section--tint{background:var(--k-veil)}
.k-section--tint > .k-wrap{padding-block:var(--k-gap)}

/* 수치 */
.k-metric--boxed{border:1px solid var(--k-hair);border-radius:.7rem;padding:1rem 1.1rem}
.k-metric--rule{border-left:2px solid var(--k-accent);padding-left:.9rem}
.k-metric--huge .k-metric__v{font-size:calc(var(--k-step3) * 1.5)}
.k-metric--accent .k-metric__v{color:var(--k-accent)}
.k-metric--flip{flex-direction:column-reverse}

/* 칩 */
.k-chips--solid .k-chip{border-color:transparent;background:var(--k-veil)}
.k-chips--bare .k-chip{border:0;padding-inline:0;
  border-bottom:1px solid var(--k-hair);border-radius:0}
.k-chips--accent .k-chip{border-color:color-mix(in oklab, var(--k-accent) 40%, var(--k-hair));
  color:var(--k-accent)}

/* 스펙 행 */
.k-specs--boxed{border:1px solid var(--k-hair);border-radius:.9rem;padding-inline:1.2rem}
.k-specs--boxed .k-spec:last-child{border-bottom:0}
.k-specs--wide .k-spec{grid-template-columns:minmax(8rem,16rem) 1fr}
.k-specs--airy .k-spec{border-bottom:0;padding-block:.4rem}

/* 막대 */
.k-bars--thick .k-bar__track{height:1.5rem;border-radius:.4rem}
.k-bars--thick .k-bar__fill{border-radius:.4rem}
.k-bars--thin .k-bar__track{height:.35rem}
.k-bars--stepped .k-bar__fill{background:linear-gradient(90deg,
  color-mix(in oklab, var(--k-accent) 55%, var(--k-bg)), var(--k-accent))}

/* 카드 */
.k-card--flat{border:0;background:var(--k-veil)}
.k-card--edge{border:0;border-left:2px solid var(--k-accent);border-radius:0;padding-left:1.1rem}
.k-card--lift:hover{transform:translateY(-4px)}

/* 강조 상자 */
.k-callout--plain{background:none;border-left-color:var(--k-hair)}
.k-callout--fill{border-left:0;background:var(--k-veil);border-radius:.7rem}

/* ── 좁은 화면 ────────────────────────────────────────── */
@media (max-width:768px){
  .k-page--dense-grid .k-section > .k-wrap{grid-template-columns:1fr}
  .k-page--dense-grid .k-section__meta{position:static}
  .k-spec{grid-template-columns:1fr;gap:.2rem}
  .k-bar{grid-template-columns:1fr auto;gap:.4rem}
  .k-bar__track{grid-column:1 / -1}
}

/* ── 움직임을 줄여 달라고 한 사람 ─────────────────────── */
@media (prefers-reduced-motion:reduce){
  .k-reveal,.k-stagger > *,.k-bar__fill,.k-progress{animation:none !important}
  .k-card,.k-chip,.k-nav__links a::after{transition:none !important}
}
`.trim();

/** 프롬프트에 붙일 부품 목록. 모델이 무엇을 가져다 쓸 수 있는지. */
export function pageKitPrompt(): string {
  return [
    "## 지면 키트 — 이미 만들어져 있다. 가져다 써라",
    "아래 클래스는 **문법의 색 · 서체 · 밀도를 이미 먹고** 등장 애니메이션 · 호버 ·",
    "폰 대응 · 대비까지 들어 있다. 다시 만들지 마라. 리셋 · 타입 계단 · 간격도 이미 있다.",
    "",
    "```",
    "지면    .k-page (+ .k-page--<골격>)  .k-wrap 가운데 칸  .k-narrow 읽는 폭",
    "크롬    .k-nav > .k-nav__mark .k-nav__links   .k-progress 상단 진행 막대",
    "        .k-foot > <dl><dt>이름</dt><dd>값</dd>",
    "첫화면  .k-hero > .k-hero__title .k-hero__lede",
    "섹션    .k-section > .k-wrap",
    "        dense-grid 골격에서는 .k-section__meta(왼쪽·스크롤에 붙음) + .k-section__body",
    "        .k-eyebrow 작은 라벨  .k-num 번호  .k-title 제목  .k-lede 여는 문장",
    "        .k-meta 한 줄 요약  .k-prose 본문 문단들",
    "칸      .k-grid 자동 격자  .k-card 테두리 상자(호버 뜸)",
    "        .k-metric > .k-metric__v(값) .k-metric__u(단위) .k-metric__l(라벨)",
    "칩      <ul class=k-chips><li class=k-chip>Kotlin</li>",
    "스펙    <dl class=k-specs><div class=k-spec><dt class=k-spec__k>기간</dt>",
    "          <dd class=k-spec__v>2022.03–2026.02</dd></div></dl>",
    "막대    <div class=k-bars><div class=k-bar>",
    "          <span class=k-bar__k>재설계 전</span>",
    "          <span class=k-bar__track><span class=k-bar__fill style=\"--k-pct:100%\"></span></span>",
    "          <span class=k-bar__v>220<span class=k-bar__u>분</span></span></div></div>",
    "        --k-pct는 **가장 큰 값 대비 비율**이다. 차오르는 애니메이션이 붙어 있다.",
    "강조    .k-callout 왼쪽에 선 그은 상자",
    "등장    .k-reveal 올라오며 나타남   .k-stagger 자식이 하나씩(자식에 style=\"--i:0,1,2…\")",
    "```",
    "",
    "### 같은 부품의 다른 모습 — **섹션마다 다르게 골라라**",
    "전부 같은 모습으로 쌓으면 키트를 쓴 티가 난다. 아래를 섞어 쓴다.",
    "```",
    "첫화면  .k-hero--split(좌우 2단) .k-hero--centered .k-hero--oversized .k-hero--rule",
    "섹션    .k-section--reverse(메타 오른쪽) .k-section--stacked(메타 위)",
    "        .k-section--flush(위 선 없음) .k-section--tint(옅은 면)",
    "수치    .k-metric--boxed .k-metric--rule .k-metric--huge .k-metric--accent .k-metric--flip",
    "칩      .k-chips--solid .k-chips--bare .k-chips--accent",
    "스펙    .k-specs--boxed .k-specs--wide .k-specs--airy",
    "막대    .k-bars--thick .k-bars--thin .k-bars--stepped",
    "카드    .k-card--flat .k-card--edge .k-card--lift",
    "강조    .k-callout--plain .k-callout--fill",
    "```",
    "",
    "**색은 변수로 쓴다** — `var(--k-text)` · `var(--k-muted)` · `var(--k-accent)` ·",
    "`var(--k-hair)`(가는 선) · `var(--k-veil)`(옅은 면). 직접 hex를 적지 마라.",
    "",
    "## 네가 쓰는 CSS",
    "키트로 안 되는 **이 지면만의 한 장면**에만 쓴다 — 특별한 첫 화면, 이 내용에만",
    "맞는 도형, 한 곳의 파격. 부품을 다시 만드는 데 쓰지 마라.",
    "클래스 이름은 `x-`로 시작한다(키트의 `k-`와 섞이지 않게).",
  ].join("\n");
}
