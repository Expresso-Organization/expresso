import React from "react";
import type { DesignSystemSpecV2, StructuredBackdrop } from "@expresso/contracts";

import { backdropColors, type BackdropInk } from "./design-tokens.js";

/**
 * 첫 화면 배경입니다. 첫 화면 header의 마지막 자식으로 깔리고, 색은 `backdropColors`가 계산한 잉크 변수만 씁니다.
 *
 * 스크립트 없이 CSS · SVG로만 그립니다. 공개 지면은 스크립트가 막혀 있기 때문입니다.
 * glow는 componentry `gradient-hero-01`(MIT, `collected/LICENSE.componentry.txt`)의 아래에서 번지는 빛 구도를 옮겼습니다.
 * 원본의 `blur-3xl`은 휴대폰에서 비싸므로 `radial-gradient(closest-side, …)`의 부드러운 끝으로 대신합니다.
 * 빛 타원은 층 안에 완전히 들어가 가장자리가 투명이므로 아래쪽 마스크 없이 바탕에 이어집니다.
 */

/** 배경마다 잉크 부류입니다. 선 부류는 글자색 한 가지, 빛 부류는 두 색을 씁니다. */
export const BACKDROP_INK: Record<Exclude<StructuredBackdrop, "none">, BackdropInk> = {
  grid: "line",
  dots: "line",
  stripes: "line",
  contour: "line",
  rings: "line",
  glow: "light",
  aurora: "light",
};

/** 저장본에 배경이 없을 때의 값입니다. */
export function resolveBackdrop(backdrop: StructuredBackdrop | undefined, _variant: string | undefined): StructuredBackdrop {
  return backdrop ?? "none";
}

/** 첫 화면 header에 다는 속성입니다. 배경이 없으면 아무것도 달지 않습니다. */
export function backdropAttributes(backdrop: StructuredBackdrop): Record<string, string> {
  if (backdrop === "none") return {};
  return { "data-backdrop": backdrop, "data-backdrop-ink": BACKDROP_INK[backdrop] };
}

/** 등고선입니다. 한 중심을 도는 닫힌 곡선 열 개를 고정 식으로 만들어 렌더마다 같은 경로가 나옵니다. */
const CONTOUR_PATHS = Array.from({ length: 10 }, (_, ring) => {
  const points = Array.from({ length: 72 }, (_, step) => {
    const angle = (step / 72) * Math.PI * 2;
    const radius = (46 + ring * 44) * (1 + 0.13 * Math.sin(3 * angle + ring * 0.42) + 0.07 * Math.sin(5 * angle - ring * 0.31));
    return `${(720 + radius * 1.25 * Math.cos(angle)).toFixed(1)} ${(210 + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join("L")}Z`;
});

/** 동심원 궤도입니다. 반지름 · 점 위치는 고정값입니다. */
const RING_RADII = [70, 122, 174, 226, 278];
const RING_DOTS = [
  { ring: 1, angle: 0.6 },
  { ring: 2, angle: 2.4 },
  { ring: 3, angle: 4.1 },
  { ring: 4, angle: 1.3 },
];

function BackdropShape({ backdrop }: { backdrop: Exclude<StructuredBackdrop, "none"> }) {
  if (backdrop === "contour")
    return (
      <svg className="xp-bd-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMaxYMin slice">
        {CONTOUR_PATHS.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </svg>
    );
  if (backdrop === "rings")
    return (
      <svg className="xp-bd-svg xp-bd-rings" viewBox="0 0 600 600">
        <g className="xp-bd-orbit">
          {RING_RADII.map((r, index) => (
            <circle key={r} cx="300" cy="300" r={r} className={index === 2 ? "xp-bd-dash" : undefined} />
          ))}
          {RING_DOTS.map(({ ring, angle }) => (
            <circle
              key={ring}
              className="xp-bd-dot"
              cx={(300 + RING_RADII[ring]! * Math.cos(angle)).toFixed(1)}
              cy={(300 + RING_RADII[ring]! * Math.sin(angle)).toFixed(1)}
              r="5"
            />
          ))}
        </g>
      </svg>
    );
  if (backdrop === "glow")
    return (
      <>
        <span className="xp-bd-blob xp-bd-glow-1" />
        <span className="xp-bd-blob xp-bd-glow-2" />
      </>
    );
  if (backdrop === "aurora")
    return (
      <>
        <span className="xp-bd-blob xp-bd-aurora-1" />
        <span className="xp-bd-blob xp-bd-aurora-2" />
      </>
    );
  // grid · dots · stripes는 층 자체의 배경 그림입니다.
  return null;
}

/** 첫 화면 header의 마지막 자식으로 두는 배경 층입니다. 마지막에 두어 등장 애니메이션의 순번이 바뀌지 않습니다. */
export function Backdrop({ backdrop }: { backdrop: StructuredBackdrop }) {
  if (backdrop === "none") return null;
  return (
    // data-bleed: 창 폭으로 넓힌 층이라 측정의 열 이탈 검사가 건너뜁니다.
    <div className="xp-backdrop" data-shape={backdrop} aria-hidden="true" data-bleed="">
      <BackdropShape backdrop={backdrop} />
    </div>
  );
}

/**
 * 디자인마다 다른 배경 변수입니다. 바탕(지면 바탕 · 포스터 행동색 면) × 부류마다 잉크와 그 위 글자색을 답니다.
 * `--xp-muted` · `--xp-accent-text`를 첫 화면 안에서만 덮어, 배경이 가장 짙은 자리에서도 글자 대비가 4.5:1을 넘습니다.
 */
export function backdropCss(spec: DesignSystemSpecV2): string {
  const colors = backdropColors(spec);
  const rule = (selector: string, palette: (typeof colors)["canvas"]["line"]) =>
    `${selector}{--xp-bd-1:${palette.inks[0]};--xp-bd-2:${palette.inks[1]};color:${palette.primary};--xp-muted:${palette.muted};--xp-muted-surface:${palette.muted};--xp-accent-text:${palette.accent}}`;
  return [
    rule('.xp-hero[data-backdrop-ink="line"]', colors.canvas.line),
    rule('.xp-hero[data-backdrop-ink="light"]', colors.canvas.light),
    rule('.xp-hero[data-variant="poster"][data-backdrop-ink="line"]', colors.field.line),
    rule('.xp-hero[data-variant="poster"][data-backdrop-ink="light"]', colors.field.light),
  ].join("\n");
}

/**
 * 배경 층의 모양입니다. 색은 `--xp-bd-1` · `--xp-bd-2`(바탕에 세기만큼 섞은 불투명 잉크)와 투명 사이만 씁니다.
 * 투명 쪽으로 번지는 그림은 바탕과 잉크를 섞은 색이 되므로 `backdropColors`가 잰 표본 안에 있습니다.
 * 빛 두 개는 표본과 같은 순서(1 위에 2)로 겹칩니다. `mask-image`는 알파만 읽으므로 불투명한 잉크 변수를 씁니다.
 */
export const BACKDROP_CSS = `
.xp-hero[data-backdrop]{position:relative;isolation:isolate}
.xp-backdrop{position:absolute;z-index:-1;inset:calc(var(--xp-section) * -.7) calc(var(--xp-bleed) * -1) calc(var(--xp-section) * -.25);overflow:hidden;pointer-events:none;-webkit-mask-image:linear-gradient(to bottom,var(--xp-bd-1) 60%,transparent);mask-image:linear-gradient(to bottom,var(--xp-bd-1) 60%,transparent)}
.xp-hero[data-variant="poster"]>.xp-backdrop{inset:0;-webkit-mask-image:none;mask-image:none}
.xp-backdrop[data-shape="grid"],.xp-backdrop[data-shape="dots"]{--xp-bd-cell:clamp(28px,3.4vw,48px)}
.xp-backdrop[data-shape="grid"]::before,.xp-backdrop[data-shape="dots"]::before,.xp-backdrop[data-shape="stripes"]::before{content:"";position:absolute;inset:0;-webkit-mask-image:radial-gradient(ellipse 75% 85% at 72% 30%,var(--xp-bd-1),transparent);mask-image:radial-gradient(ellipse 75% 85% at 72% 30%,var(--xp-bd-1),transparent)}
.xp-backdrop[data-shape="grid"]::before{background-image:linear-gradient(var(--xp-bd-1) 1px,transparent 1px),linear-gradient(90deg,var(--xp-bd-1) 1px,transparent 1px);background-size:var(--xp-bd-cell) var(--xp-bd-cell);background-position:-1px -1px}
.xp-backdrop[data-shape="dots"]::before{background-image:radial-gradient(circle,var(--xp-bd-1) 1.5px,transparent 2px);background-size:calc(var(--xp-bd-cell) * .5) calc(var(--xp-bd-cell) * .5)}
.xp-backdrop[data-shape="stripes"]::before{background-image:repeating-linear-gradient(-45deg,var(--xp-bd-1) 0 1px,transparent 1px 18px)}
.xp-hero[data-variant="poster"]>.xp-backdrop[data-shape="stripes"]::before{-webkit-mask-image:none;mask-image:none}
.xp-bd-svg{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:var(--xp-bd-1);stroke-width:1.25}
.xp-bd-rings{inset:auto;top:-18%;right:-14%;width:min(78vw,820px);height:auto;aspect-ratio:1;stroke-width:1.5}
.xp-bd-rings .xp-bd-dash{stroke-dasharray:2 12}
.xp-bd-rings .xp-bd-dot{fill:var(--xp-bd-1);stroke:none}
.xp-bd-orbit{transform-box:view-box;transform-origin:center}
.xp-bd-blob{position:absolute;border-radius:50%}
.xp-backdrop[data-shape="glow"]{bottom:calc(var(--xp-section) * -.9);-webkit-mask-image:none;mask-image:none}
.xp-bd-glow-1{left:4%;right:4%;bottom:4%;height:70%;transform-origin:50% 100%;background:radial-gradient(closest-side,var(--xp-bd-1),transparent)}
.xp-bd-glow-2{left:24%;right:24%;bottom:12%;height:42%;transform-origin:50% 100%;background:radial-gradient(closest-side,var(--xp-bd-2),transparent)}
.xp-bd-aurora-1{top:-30%;left:30%;width:min(90vw,980px);aspect-ratio:1.6;background:radial-gradient(closest-side,var(--xp-bd-1),transparent)}
.xp-bd-aurora-2{top:-10%;left:-12%;width:min(80vw,820px);aspect-ratio:1.4;background:radial-gradient(closest-side,var(--xp-bd-2),transparent)}
.xp-page:not([data-motion="none"]) .xp-hero>.xp-backdrop{animation:none}
@keyframes xp-bd-spin{to{transform:rotate(360deg)}}
@keyframes xp-bd-breathe{from{transform:scale(1)}to{transform:scale(1.08) translateY(-3%)}}
@keyframes xp-bd-drift-1{from{transform:translate(0,0) rotate(0deg)}to{transform:translate(-12%,8%) rotate(14deg)}}
@keyframes xp-bd-drift-2{from{transform:translate(0,0) rotate(0deg)}to{transform:translate(14%,6%) rotate(-12deg)}}
@media (prefers-reduced-motion:no-preference){
  .xp-page:not([data-motion="none"]) .xp-bd-orbit{animation:xp-bd-spin 140s linear infinite}
  .xp-page:not([data-motion="none"]) .xp-bd-glow-1{animation:xp-bd-breathe 14s ease-in-out infinite alternate}
  .xp-page:not([data-motion="none"]) .xp-bd-glow-2{animation:xp-bd-breathe 11s ease-in-out -4s infinite alternate}
  .xp-page:not([data-motion="none"]) .xp-bd-aurora-1{animation:xp-bd-drift-1 26s ease-in-out infinite alternate}
  .xp-page:not([data-motion="none"]) .xp-bd-aurora-2{animation:xp-bd-drift-2 32s ease-in-out infinite alternate}
}
`.trim();

/** 설계 · 다듬기 프롬프트가 싣는 배경 설명입니다. 고를 수 있는 값 자체는 출력 스키마가 정합니다. */
export function describeBackdrops(): string {
  return [
    "첫 화면 배경(intro의 backdrop): 디자인 색으로 옅게 깔리고 글자 대비는 키트가 맞춥니다. 지면의 인상과 직무에 맞는 하나를 고릅니다.",
    "none=배경 없음, grid=가는 선 격자(설계 · 엔지니어링), dots=점 격자(글 중심의 차분한 지면), stripes=사선 줄무늬(포스터 · 강한 인상),",
    "contour=등고선(연구 · 분석 · 데이터), rings=천천히 도는 동심원 궤도(시스템 · 인프라 · 과학), glow=아래에서 번지는 빛(제품 · 서비스 · 브랜드),",
    "aurora=두 색 빛이 천천히 흐르는 면(디자인 · 크리에이티브). 첫 화면이 이미지 중심(media)이면 선 배경이나 none이 어울립니다.",
  ].join("\n");
}
