import "./three-global.js";
import "../vendor/vanta/vanta.globe.js";
import { vantaEffect } from "./vanta-effect.js";
// 선으로 그린 지구본과 둘레의 점 · 호. 커서를 따라 돈다. values.size = 크기(0.7~1.4).
window.ExpressoEffects.register("globe", vantaEffect((o) => window.VANTA.GLOBE(o), (c, v) => ({
  color: c.accent, color2: c.soft, backgroundColor: c.background, backgroundAlpha: 0, size: Math.max(0.7, Math.min(1.4, v.size ?? 1)),
})));
