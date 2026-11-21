import "./three-global.js";
import "../vendor/vanta/vanta.net.js";
import { vantaEffect } from "./vanta-effect.js";
// 점과 그 사이를 잇는 선의 그물. 커서 쪽으로 그물이 기운다. values.points = 한 줄의 점 수(5~14).
window.ExpressoEffects.register("net", vantaEffect((o) => window.VANTA.NET(o), (c, v) => ({
  color: c.accent, backgroundColor: c.background, backgroundAlpha: 0, points: Math.max(5, Math.min(14, v.points ?? 9)), maxDistance: 22, spacing: 17, showDots: true,
})));
