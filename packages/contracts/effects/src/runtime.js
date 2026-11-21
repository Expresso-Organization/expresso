/*
 * 지면 효과 런타임 — window.ExpressoEffects.
 *
 * 지면 스크립트는 효과를 직접 짜지 않고 이름으로 부른다:
 *   ExpressoEffects.mount("net", { el, palette: { background, ink, accent, soft }, values: { … } })
 * 효과 코드는 이 런타임 뒤에 실리는 효과 묶음이 register()로 등록한다(쓰는 효과만 실린다 — packages/contracts/src/page.ts).
 *
 * 공통으로 맡는 것:
 * - 팔레트는 #rrggbb 넷. 효과마다 자기 옵션으로 옮긴다(colors 헬퍼).
 * - prefers-reduced-motion이면 첫 장면을 그린 뒤 멈춘다.
 * - 실패하면 아무것도 하지 않는다 — 지면 CSS의 첫 모습이 그대로 남는다.
 * - 붙으면 자리(el) 안의 첫 모습(자식 요소 · el의 배경)을 감추고 data-effect를 단다. 투명 캔버스 효과 뒤로 첫 모습이 겹쳐 보이지 않게 한다.
 */
const registry = Object.create(null);
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** #rrggbb → 0xrrggbb. 잘못된 값이면 fallback. */
function hex(value, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value ?? "").trim());
  return m ? parseInt(m[1], 16) : fallback;
}
/** 두 색을 t만큼 섞는다(0이면 a, 1이면 b). */
function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}
/** 바탕의 밝기 0~1. 밝은 바탕인지 가리는 데 쓴다. */
function lightness(c) {
  return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}
function colors(palette = {}) {
  const background = hex(palette.background, 0xfaf8f4);
  const ink = hex(palette.ink, 0x222222);
  const accent = hex(palette.accent, 0x5f0080);
  const soft = hex(palette.soft, mix(background, accent, 0.35));
  return { background, ink, accent, soft, light: lightness(background) > 0.5 };
}

const api = {
  register(name, effect) { registry[name] = effect; },
  names() { return Object.keys(registry); },
  helpers: { hex, mix, lightness, colors },
  /** 효과를 붙인다. 실패하면 null — 아무것도 그리지 않는다. */
  mount(name, options = {}) {
    try {
      const effect = registry[name];
      const el = options.el;
      if (!effect || !el) return null;
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      const firstLook = [...el.children];
      const handle = effect.mount({ el, palette: colors(options.palette), values: options.values ?? {}, reduce: reduceMotion() });
      if (!handle) return null;
      for (const child of firstLook) child.style.visibility = "hidden";
      el.style.backgroundImage = "none";
      el.setAttribute("data-effect", name);
      return handle;
    } catch (error) {
      return null;
    }
  },
};
window.ExpressoEffects = api;
