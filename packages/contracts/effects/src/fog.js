import "./three-global.js";
import "../vendor/vanta/vanta.fog.js";
import { vantaEffect } from "./vanta-effect.js";
// 팔레트 색의 부드러운 안개가 흐른다. 커서를 따라 결이 밀린다. values.speed = 흐름 빠르기(0.4~1.6).
window.ExpressoEffects.register("fog", vantaEffect((o) => window.VANTA.FOG(o), (c, v) => {
  const { mix } = window.ExpressoEffects.helpers;
  return c.light ? {
    highlightColor: mix(c.background, 0xffffff, 0.6),
    midtoneColor: mix(c.background, c.soft, 0.55),
    lowlightColor: mix(c.soft, c.accent, 0.45),
    baseColor: c.background, blurFactor: 0.6, zoom: 0.8, speed: Math.max(0.4, Math.min(1.6, v.speed ?? 0.8)),
  } : {
    highlightColor: mix(c.soft, c.accent, 0.65),
    midtoneColor: mix(c.background, c.soft, 0.85),
    lowlightColor: mix(c.background, c.accent, 0.3),
    baseColor: c.background, blurFactor: 0.6, zoom: 0.8, speed: Math.max(0.4, Math.min(1.6, v.speed ?? 0.8)),
  };
}));
