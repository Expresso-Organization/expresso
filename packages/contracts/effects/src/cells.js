import "./three-global.js";
import "../vendor/vanta/vanta.cells.js";
import { vantaEffect } from "./vanta-effect.js";
// 세포 무늬가 천천히 갈라지고 이어진다. 어두운 바탕용. values.size = 세포 크기(1~3).
window.ExpressoEffects.register("cells", vantaEffect((o) => window.VANTA.CELLS(o), (c, v) => ({
  color1: c.background, color2: c.accent, size: Math.max(1, Math.min(3, v.size ?? 1.8)), speed: 0.6,
})));
