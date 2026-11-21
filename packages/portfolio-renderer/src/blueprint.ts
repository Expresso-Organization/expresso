/**
 * 청사진.
 *
 * 설계가 끝나면 글은 아직 없지만 지면의 구조(어떤 부품이 어느 자리에 얼마나 크게 오는지)는 정해져 있습니다.
 * 그 구조를 최종 지면과 같은 렌더러로 한 번 그려 보여 주고, 글이 오는 대로 자리를 채웁니다.
 *
 * 부품마다 슬롯 코드를 넣지 않습니다. 내용의 글 칸에 짧은 표지(`⟦3⟧`)를 넣어 평소처럼 렌더한 뒤, 표지를 글 자리
 * 요소로 바꿉니다. 그래서 새 부품도 따로 손대지 않아도 청사진에 나옵니다.
 * 청사진의 모습은 `BLUEPRINT_CSS`만으로 정합니다. 받는 쪽이 문서 루트에 `data-stage`를 걸면 적용됩니다.
 */

/** 글 자리 하나입니다. `path`는 편집 패치와 같은 내용 경로(`/sections/<id>/title`)입니다. */
export interface BlueprintSlot {
  path: string;
  /** 채워질 글의 최대 길이입니다. 자리 표시의 길이가 됩니다. */
  chars: number;
}

/** 글 칸에 넣는 표지입니다. 계약의 최소 길이를 넘고 최대 길이보다 짧도록 숫자 하나만 담습니다. */
export function blueprintToken(index: number): string {
  return `⟦${index}⟧`;
}

/**
 * headline은 저장 계약이 마침표로 끝나는 한 문장을 요구해 표지 뒤에 마침표를 붙입니다(`⟦3⟧.`).
 * 그 마침표도 글 자리에 포함되도록 표지와 함께 지웁니다.
 */
const TOKEN = /⟦(\d+)⟧\.?/g;

/**
 * 렌더한 HTML의 표지를 글 자리 요소로 바꿉니다.
 *
 * React는 글과 속성값의 `<` · `>`를 이스케이프하므로 꺾쇠로 태그와 글을 가를 수 있습니다. 속성값(`alt`,
 * `aria-label`)에 들어간 표지는 요소를 넣을 수 없어 지웁니다. 최종 지면이 오면 그 값도 함께 바뀝니다.
 */
export function blueprintHtml(html: string, slots: readonly BlueprintSlot[]): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part) =>
      part.startsWith("<")
        ? part.replace(TOKEN, "")
        : part.replace(TOKEN, (_, index: string) => {
            const slot = slots[Number(index)];
            return slot ? slotElement(slot) : "";
          }),
    )
    .join("");
}

/**
 * 자리 표시는 실제 글과 같은 서체 · 크기로 줄을 바꾸도록, 보이지 않는 한글 낱말로 채운 인라인 요소입니다.
 * 배경이 줄마다 끊겨 그려져(`box-decoration-break: clone`) 여러 줄 글의 모양이 그대로 나옵니다.
 * 낱말 길이는 한국어 어절(조사 포함 3–4자)에 맞춰 세 글자 + 띄어쓰기입니다.
 */
function slotElement(slot: BlueprintSlot): string {
  const placeholder = "가나다 ".repeat(Math.ceil(slot.chars / 4)).slice(0, Math.max(slot.chars, 1)).trimEnd();
  return `<span class="xp-slot" data-slot="${escapeAttribute(slot.path)}" data-slot-state="empty">${placeholder}</span>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * 청사진의 값입니다. 생성 미리보기의 청사진(`BLUEPRINT_CSS`)과 고치는 중인 첫 화면의 청사진(`snippetEditingCss`)이 함께 씁니다.
 * 색은 디자인의 강조색과 글자색에서 섞어 만듭니다 — 숫자는 섞는 비율(%)입니다.
 */
const RECIPE = {
  /** 선으로 그린 글과 도형의 색: 강조색을 이만큼, 나머지는 글자색. */
  ink: 70,
  /** 점선 윤곽과 테두리: 강조색을 이만큼, 나머지는 투명. */
  line: 40,
  /** 격자 선과 안쪽 요소의 윤곽. */
  grid: 10,
  /** 격자 한 칸(px). */
  cell: 24,
  /** 블록 윤곽이 블록에서 떨어진 거리(px). */
  offset: 6,
  /** 빈 글 자리의 바탕과 그 위를 지나는 띠: 글자색을 이만큼. */
  skeleton: 9,
  band: 20,
  /** 띠가 한 번 지나가는 시간(초). */
  sweep: 1.6,
  /** 고친 것이 올 때: 이 흐림에서 떠오르고, 강조색을 이만큼 섞은 면이 걷힙니다. */
  revisedFrom: 0.15,
  revisedWash: 28,
} as const;

/**
 * 청사진의 모습입니다.
 *
 * 최상위 블록(`.xp-hero`, `.xp-block`) 안에 아직 다 쓰지 않은 칸이 있으면 그 블록은 설계도로 보입니다 — 격자
 * 배경, 점선 윤곽, 한 가지 선 색, 이미지 자리는 빗금. 블록의 칸이 모두 차면 규칙이 풀리며 디자인 색 · 면 · 이미지가
 * 디자인의 전환 시간으로 돌아옵니다. 색은 모두 디자인 변수에서 섞어 만들어 어두운 디자인에서도 같은 관계입니다.
 * 검사에 걸려 쓴 에이전트가 고쳐 보낸 칸(`data-slot-revised`)은 새 글이 흐린 데서 떠오르며 잠깐 강조됩니다. 강조는 눈에 남도록
 * 디자인의 전환 시간보다 길게 둡니다.
 * 디자인 변수는 `.xp-page`에 정의되므로 청사진 색도 거기서 만듭니다(문서 루트에서는 디자인 변수가 비어 있습니다).
 */
export const BLUEPRINT_CSS = String.raw`
:root[data-stage] .xp-page{--xp-bp-ink:color-mix(in srgb,var(--accent) ${RECIPE.ink}%,var(--text));--xp-bp-line:color-mix(in srgb,var(--accent) ${RECIPE.line}%,transparent);--xp-bp-grid:color-mix(in srgb,var(--accent) ${RECIPE.grid}%,transparent);--xp-bp-skel:color-mix(in srgb,var(--text) ${RECIPE.skeleton}%,transparent);--xp-bp-skel-hi:color-mix(in srgb,var(--text) ${RECIPE.band}%,transparent)}
:root[data-stage] :is(.xp-hero,.xp-block),:root[data-stage] :is(.xp-hero,.xp-block) *{transition:color var(--motion-duration) var(--motion-easing),background-color var(--motion-duration) var(--motion-easing),border-color var(--motion-duration) var(--motion-easing),outline-color var(--motion-duration) var(--motion-easing),opacity var(--motion-duration) var(--motion-easing)}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]){outline:1px dashed var(--xp-bp-line);outline-offset:${RECIPE.offset}px;background-image:linear-gradient(var(--xp-bp-grid) 1px,transparent 1px),linear-gradient(90deg,var(--xp-bp-grid) 1px,transparent 1px);background-size:${RECIPE.cell}px ${RECIPE.cell}px}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) *{color:var(--xp-bp-ink)!important;background-color:transparent!important;border-color:var(--xp-bp-line)!important;box-shadow:none!important;text-shadow:none!important}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) :is(div,figure,li,article,section,header,nav,dl,a){outline:1px dashed var(--xp-bp-grid);outline-offset:-1px}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) :is(img,picture,video,svg){opacity:0}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) figure{background-image:repeating-linear-gradient(135deg,var(--xp-bp-line) 0 1px,transparent 1px 10px)!important}
:root[data-stage] :is(.xp-hero,.xp-block) .xp-slot[data-slot-state="empty"]{color:transparent!important;background-color:var(--xp-bp-skel)!important;background-image:linear-gradient(90deg,transparent 30%,var(--xp-bp-skel-hi) 50%,transparent 70%);background-size:300% 100%;border-radius:.3em;-webkit-box-decoration-break:clone;box-decoration-break:clone;animation:xp-bp-shimmer ${RECIPE.sweep}s linear infinite}
:root[data-stage] .xp-slot[data-slot-state="writing"]::after{content:"";display:inline-block;width:0;height:1em;margin-inline-start:.08em;border-inline-end:2px solid currentColor;vertical-align:-.12em;animation:xp-bp-caret 1s steps(1) infinite}
@keyframes xp-bp-shimmer{from{background-position:100% 0}to{background-position:0 0}}
:root[data-stage] .xp-slot[data-slot-revised]{animation:xp-bp-revised calc(var(--motion-duration) * 6) var(--motion-easing);border-radius:.2em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
@keyframes xp-bp-revised{0%{opacity:${String(RECIPE.revisedFrom).slice(1)};background-color:color-mix(in srgb,var(--accent) ${RECIPE.revisedWash}%,transparent)}25%{opacity:1}100%{background-color:transparent}}
@keyframes xp-bp-caret{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){:root[data-stage] .xp-slot,:root[data-stage] .xp-slot::after,:root[data-stage] .xp-slot[data-slot-revised]{animation:none!important}}
`;

/** 고치는 중인 첫 화면의 색. 첫 화면에는 지면의 디자인 변수가 없어 스타일의 값을 그대로 받습니다. */
export interface SnippetBlueprintColors {
  accent: string;
  text: string;
}

const SHAPES = "rect,circle,ellipse,path,polygon,polyline,line";
/**
 * 도형의 점선. SVG의 선에는 `dashed`가 없어 길이를 적어야 합니다. 블록의 윤곽(`1px dashed`)과 같은 선으로 보이도록
 * Chromium이 3px보다 가는 `dashed`를 그리는 비율(선 굵기의 3배를 긋고 2배를 띄움)을 따릅니다.
 */
const SHAPE_DASH = "3 2";
/**
 * 문서를 다시 그리면 요소의 등장 애니메이션이 처음부터 다시 돕니다. 끝난 시점으로 당겨 두어 사용자가 보던 모습에서 이어집니다.
 * 문서 루트는 뺍니다 — 청사진의 움직임이 거기서 돕니다.
 */
const SETTLED = ":root *,:root *::before,:root *::after{animation-delay:-999s !important}";

/**
 * 바뀌는 자리(CSS 선택자)에서 청사진이 걸리는 블록의 선택자를 만듭니다.
 *
 * 자리가 SVG 도형이면 그 도형이 든 svg 전체가 블록입니다. 도형 하나만 선으로 바꾸면 그 위에 얹힌 글자(막대 안의 흰 숫자)가
 * 배경 없이 남습니다. 자리마다 `:is()`로 감싸 한 선택자가 틀려도 나머지는 살아남습니다.
 */
function snippetBlock(targets: readonly string[]): string {
  const any = `:is(${targets.join(",")})`;
  return `:is(${any}:not(svg *),svg:has(${any}))`;
}

/**
 * 고치는 중인 첫 화면에 더하는 CSS입니다. 바뀌는 블록이 청사진으로 돌아가고 그 위로 띠가 지나갑니다.
 *
 * 생성 미리보기의 청사진과 같은 값입니다. 다른 점은 둘입니다.
 * - 첫 화면은 스크립트가 막힌 틀 안에 있어 문서를 건드릴 수 없습니다. 표지(`data-stage`, `data-slot`) 없이 선택자만으로 겁니다.
 * - 그림을 숨기지 않고 도형을 점선 윤곽으로 그립니다. 고치는 대상이 그 그림일 수 있습니다.
 *
 * 띠는 요소의 `animation`을 쓰지 않습니다. 요소는 저마다 등장 애니메이션을 갖고 있어 덮어쓰면 그 끝 모습이 사라집니다.
 * 문서 루트에서 등록한 값을 움직이고 블록의 배경이 그 값을 읽습니다.
 * 자리가 없으면 빈 글입니다.
 */
export function snippetEditingCss(targets: readonly string[], colors: SnippetBlueprintColors): string {
  if (targets.length === 0) return "";
  const b = snippetBlock(targets);
  const ink = `color-mix(in srgb,${colors.accent} ${RECIPE.ink}%,${colors.text})`;
  const line = `color-mix(in srgb,${colors.accent} ${RECIPE.line}%,transparent)`;
  const grid = `color-mix(in srgb,${colors.accent} ${RECIPE.grid}%,transparent)`;
  const band = `color-mix(in srgb,${colors.text} ${RECIPE.band}%,transparent)`;
  const cell = `${RECIPE.cell}px ${RECIPE.cell}px`;
  return `
${SETTLED}
@property --xp-edit-sweep{syntax:"<number>";inherits:true;initial-value:100}
@keyframes xp-edit-sweep{from{--xp-edit-sweep:100}to{--xp-edit-sweep:0}}
:root{animation:xp-edit-sweep ${RECIPE.sweep}s linear infinite}
${b},${b} *{color:${ink} !important;background-color:transparent !important;border-color:${line} !important;box-shadow:none !important;text-shadow:none !important}
${b}{outline:1px dashed ${line};outline-offset:${RECIPE.offset}px;background-image:linear-gradient(90deg,transparent 30%,${band} 50%,transparent 70%),linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px) !important;background-size:300% 100%,${cell},${cell} !important;background-position:calc(var(--xp-edit-sweep) * 1%) 0,0 0,0 0 !important;background-repeat:no-repeat,repeat,repeat !important}
${b} :is(div,figure,li,article,section,header,nav,dl,a){outline:1px dashed ${grid};outline-offset:-1px}
${b} :is(${SHAPES}){fill:transparent !important;stroke:${line} !important;stroke-width:1px !important;stroke-dasharray:${SHAPE_DASH} !important;vector-effect:non-scaling-stroke}
${b} :is(text,tspan){fill:${ink} !important;stroke:none !important}
@media (prefers-reduced-motion:reduce){:root{animation:none}}
`;
}

/**
 * 고친 첫 화면에 더하는 CSS입니다. 바뀐 블록이 흐린 데서 떠오르고 강조색 면이 걷힙니다(`xp-bp-revised`와 같은 값).
 * `seconds`는 한 번 도는 시간입니다. 지면에서는 디자인의 전환 시간의 6배인데, 첫 화면에는 그 변수가 없어 부르는 쪽이 줍니다.
 * 면은 블록의 배경을 덮어쓰지 않도록 안쪽 그림자로 칠합니다.
 */
export function snippetRevisedCss(targets: readonly string[], colors: SnippetBlueprintColors, seconds: number): string {
  if (targets.length === 0) return "";
  const b = snippetBlock(targets);
  return `
${SETTLED}
@property --xp-edit-rise{syntax:"<number>";inherits:true;initial-value:1}
@property --xp-edit-wash{syntax:"<percentage>";inherits:true;initial-value:0%}
@keyframes xp-edit-revised{0%{--xp-edit-rise:${RECIPE.revisedFrom};--xp-edit-wash:${RECIPE.revisedWash}%}25%{--xp-edit-rise:1}100%{--xp-edit-rise:1;--xp-edit-wash:0%}}
:root{animation:xp-edit-revised ${seconds}s ease both}
${b}{filter:opacity(var(--xp-edit-rise));box-shadow:inset 0 0 0 100vmax color-mix(in srgb,${colors.accent} var(--xp-edit-wash),transparent)}
@media (prefers-reduced-motion:reduce){:root{animation:none}}
`;
}
