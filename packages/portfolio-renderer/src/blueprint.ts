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
 * 청사진의 모습입니다.
 *
 * 최상위 블록(`.xp-hero`, `.xp-block`) 안에 아직 다 쓰지 않은 칸이 있으면 그 블록은 설계도로 보입니다 — 격자
 * 배경, 점선 윤곽, 한 가지 선 색, 이미지 자리는 빗금. 블록의 칸이 모두 차면 규칙이 풀리며 디자인 색 · 면 · 이미지가
 * 디자인의 전환 시간으로 돌아옵니다. 색은 모두 디자인 변수에서 섞어 만들어 어두운 디자인에서도 같은 관계입니다.
 * 디자인 변수는 `.xp-page`에 정의되므로 청사진 색도 거기서 만듭니다(문서 루트에서는 디자인 변수가 비어 있습니다).
 */
export const BLUEPRINT_CSS = String.raw`
:root[data-stage] .xp-page{--xp-bp-ink:color-mix(in srgb,var(--accent) 70%,var(--text));--xp-bp-line:color-mix(in srgb,var(--accent) 40%,transparent);--xp-bp-grid:color-mix(in srgb,var(--accent) 10%,transparent);--xp-bp-skel:color-mix(in srgb,var(--text) 9%,transparent);--xp-bp-skel-hi:color-mix(in srgb,var(--text) 20%,transparent)}
:root[data-stage] :is(.xp-hero,.xp-block),:root[data-stage] :is(.xp-hero,.xp-block) *{transition:color var(--motion-duration) var(--motion-easing),background-color var(--motion-duration) var(--motion-easing),border-color var(--motion-duration) var(--motion-easing),outline-color var(--motion-duration) var(--motion-easing),opacity var(--motion-duration) var(--motion-easing)}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]){outline:1px dashed var(--xp-bp-line);outline-offset:6px;background-image:linear-gradient(var(--xp-bp-grid) 1px,transparent 1px),linear-gradient(90deg,var(--xp-bp-grid) 1px,transparent 1px);background-size:24px 24px}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) *{color:var(--xp-bp-ink)!important;background-color:transparent!important;border-color:var(--xp-bp-line)!important;box-shadow:none!important;text-shadow:none!important}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) :is(div,figure,li,article,section,header,nav,dl,a){outline:1px dashed var(--xp-bp-grid);outline-offset:-1px}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) :is(img,picture,video,svg){opacity:0}
:root[data-stage] :is(.xp-hero,.xp-block):has([data-slot-state="empty"],[data-slot-state="writing"]) figure{background-image:repeating-linear-gradient(135deg,var(--xp-bp-line) 0 1px,transparent 1px 10px)!important}
:root[data-stage] :is(.xp-hero,.xp-block) .xp-slot[data-slot-state="empty"]{color:transparent!important;background-color:var(--xp-bp-skel)!important;background-image:linear-gradient(90deg,transparent 30%,var(--xp-bp-skel-hi) 50%,transparent 70%);background-size:300% 100%;border-radius:.3em;-webkit-box-decoration-break:clone;box-decoration-break:clone;animation:xp-bp-shimmer 1.6s linear infinite}
:root[data-stage] .xp-slot[data-slot-state="writing"]::after{content:"";display:inline-block;width:0;height:1em;margin-inline-start:.08em;border-inline-end:2px solid currentColor;vertical-align:-.12em;animation:xp-bp-caret 1s steps(1) infinite}
@keyframes xp-bp-shimmer{from{background-position:100% 0}to{background-position:0 0}}
@keyframes xp-bp-caret{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){:root[data-stage] .xp-slot,:root[data-stage] .xp-slot::after{animation:none!important}}
`;
