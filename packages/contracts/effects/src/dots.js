import "./three-global.js";
import "../vendor/vanta/vanta.dots.js";
import { vantaEffect } from "./vanta-effect.js";
// 바닥에 깔린 점 격자가 물결치고, 커서를 따라 시점이 움직인다. values.spacing = 점 간격(20~45).
window.ExpressoEffects.register("dots", vantaEffect((o) => window.VANTA.DOTS(o), (c, v) => ({
  color: c.accent, color2: c.soft, backgroundColor: c.background, backgroundAlpha: 0, size: 3, spacing: Math.max(20, Math.min(45, v.spacing ?? 30)), showLines: false,
})));
