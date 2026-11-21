/**
 * 차트 부품의 CSS입니다. `kitCss`가 키트 CSS 뒤에 붙입니다.
 *
 * 글자는 모두 HTML이라 좁은 폭에서도 본문 크기 그대로입니다. 막대 길이와 위치만 CSS 변수(`--w` · `--l`)로 받습니다.
 * 바탕 막대는 글자색(`currentColor`)을 옅게 섞어 기본 바탕 · 색면(field) · 반전(inverse) 어디서나 보이게 합니다.
 * 추이 차트의 값 글자는 면의 바탕색(`--xp-trend-halo`)으로 테두리를 둘러, 가파른 선이 글자를 지나가도 읽히게 합니다.
 * 값 글자 상자는 이웃 칸으로 .5em씩 넓혀 "1,200명"이 숫자와 단위 사이에서 줄바꿈되지 않게 합니다. 처음 · 끝 점은 바깥쪽으로 넓히지 않아
 * 그림 밖(지면 열 밖)으로 나가지 않습니다.
 */
export const VIZ_CSS = String.raw`
.xp-barlist{display:grid;gap:calc(var(--element-gap) * 1.2);align-content:start}
.xp-barlist li{display:grid;grid-template-columns:minmax(6em,11em) minmax(0,1fr) minmax(4.5em,auto);align-items:center;gap:.3em .8em}
.xp-barlist-label{font-weight:var(--xp-weight-mid);line-height:1.4}
.xp-barlist-track{display:block;height:1.4em;border-radius:var(--control-radius);overflow:hidden}
.xp-barlist[data-bars="percent"] .xp-barlist-track{background:color-mix(in srgb,currentColor 12%,transparent)}
.xp-barlist-fill{display:block;height:100%;width:var(--w,0);border-radius:var(--control-radius);background:var(--xp-bar-after,var(--action))}
.xp-barlist-value{font-family:var(--font-display);font-weight:var(--xp-weight);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--xp-accent-text)}
.xp-barlist-note{grid-column:2 / -1}
.xp-barlist[data-bars="neutral"] li{grid-template-columns:minmax(0,1fr) auto}
.xp-barlist[data-bars="neutral"] .xp-barlist-track{display:none}
.xp-barlist[data-bars="neutral"] .xp-barlist-note{grid-column:1 / -1}

.xp-period{display:grid;gap:calc(var(--element-gap) * .6)}
.xp-period-rows{display:grid;border-top:var(--xp-rule)}
.xp-period-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:var(--element-gap) calc(var(--component-gap) * 1.2);align-items:start;padding-block:calc(var(--element-gap) * 1.1);border-bottom:var(--xp-rule);color:inherit;text-decoration:none;transition:background var(--motion-duration) var(--motion-easing)}
.xp-page a.xp-period-row{color:inherit;text-decoration:none}
.xp-page a.xp-period-row:hover{background:color-mix(in srgb,var(--surface) 70%,transparent)}
.xp-period-text{display:grid;gap:.25em;min-width:0}
.xp-period-text strong{font-family:var(--font-display);font-weight:var(--xp-weight);line-height:1.35;letter-spacing:var(--xp-tracking)}
.xp-index .xp-period-text strong{font-size:calc(var(--type-example-body) * 1.2)}
.xp-period-track{position:relative;display:block;height:.8em;margin-top:.45em;border-radius:var(--control-radius);background:color-mix(in srgb,currentColor 10%,transparent)}
.xp-period-bar{position:absolute;inset-block:0;left:var(--l,0);width:var(--w,0);min-width:6px;border-radius:var(--control-radius);background:var(--xp-bar-after,var(--action))}
.xp-period-bar[data-open]{border-start-end-radius:0;border-end-end-radius:0;-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 2.5em),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 2.5em),transparent)}
.xp-period-axis{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);column-gap:calc(var(--component-gap) * 1.2);color:var(--xp-muted)}
.xp-period-axis span{grid-column:2;grid-row:1;justify-self:start}
.xp-period-axis span+span{justify-self:end}

.xp-trend{--xp-trend-halo:var(--canvas);display:grid;gap:calc(var(--element-gap) * .8);margin:0;min-width:0}
[data-surface="field"] .xp-trend{--xp-trend-halo:var(--action)}
[data-surface="inverse"] .xp-trend{--xp-trend-halo:var(--text)}
.xp-trend-label{font-weight:var(--xp-weight-mid);line-height:1.4}
.xp-trend-plot{position:relative;height:clamp(9em,24cqi,13em);margin-top:2.8em;border-bottom:var(--xp-rule)}
.xp-trend[data-named] .xp-trend-plot{margin-bottom:2.4em}
.xp-trend-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.xp-trend-area{fill:color-mix(in srgb,var(--xp-bar-after,var(--action)) 14%,transparent)}
.xp-trend-line{fill:none;stroke:var(--xp-bar-after,var(--action));stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.xp-trend-points{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));margin:0;padding:0;list-style:none}
.xp-trend-points li{position:relative}
.xp-trend-dot{position:absolute;left:50%;bottom:var(--h);width:.7em;height:.7em;border-radius:50%;background:var(--xp-bar-after,var(--action));box-shadow:0 0 0 .2em var(--xp-trend-halo);transform:translate(-50%,50%)}
.xp-trend-value{position:absolute;inset-inline:-.5em;bottom:calc(var(--h) + .75em);padding-inline:.15em;text-align:center;line-height:1.25;word-break:keep-all;font-family:var(--font-display);font-weight:var(--xp-weight);font-variant-numeric:tabular-nums;color:var(--xp-accent-text);text-shadow:0 0 .25em var(--xp-trend-halo),0 0 .25em var(--xp-trend-halo),0 0 .5em var(--xp-trend-halo)}
.xp-trend-points li:first-child .xp-trend-value{inset-inline-start:0}
.xp-trend-points li:last-child .xp-trend-value{inset-inline-end:0}
.xp-trend-at{position:absolute;inset-inline:0;top:calc(100% + .5em);padding-inline:.15em;text-align:center;line-height:1.3;word-break:keep-all}

@container (max-width:520px){
  .xp-barlist li{grid-template-columns:minmax(0,1fr) auto}
  .xp-barlist-track{grid-column:1 / -1;grid-row:2}
  .xp-barlist-note{grid-column:1 / -1}
  .xp-period-row,.xp-period-axis{grid-template-columns:minmax(0,1fr)}
  .xp-period-track{margin-top:.1em}
  .xp-period-axis span{grid-column:1}
}
`;
