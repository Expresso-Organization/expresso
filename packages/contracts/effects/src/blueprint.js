/*
 * 블루프린트 선화 — 화면이나 구조를 층으로 분해한 등각 도면. 실선 · 점선 층이 천천히 벌어지고, 커서로 기운다.
 * 2026-11-21 사용자가 시안 셋 중 이것만 괜찮다고 했다. 선은 강조색 한 색, 바닥에 옅은 모눈.
 * values.layers = [{ w, d, x, z, dashed }] 층마다 크기 · 자리(바닥 단위, 대략 -3~3)와 점선 여부. 위에서부터 차례로 쌓인다.
 * 주지 않으면 상품 상세처럼 머리 · 사진 · 옵션 · 담기 · 아래 목록 다섯 층이다.
 */
import * as THREE from "three";
import { stage } from "./stage.js";

const DEFAULT_LAYERS = [
  { w: 4.4, d: 0.5, x: 0, z: -2.1, dashed: false },
  { w: 2.6, d: 2.6, x: -0.9, z: -0.4, dashed: false },
  { w: 1.6, d: 1.3, x: 1.4, z: -0.9, dashed: true },
  { w: 1.6, d: 0.5, x: 1.4, z: 0.3, dashed: true },
  { w: 4.4, d: 1.2, x: 0, z: 1.8, dashed: false },
];
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

window.ExpressoEffects.register("blueprint", {
  mount({ el, palette, values, reduce }) {
    const layers = (Array.isArray(values.layers) && values.layers.length ? values.layers : DEFAULT_LAYERS).slice(0, 8).map((l) => ({
      w: num(l.w, 0.4, 6, 2), d: num(l.d, 0.3, 6, 1), x: num(l.x, -3, 3, 0), z: num(l.z, -3, 3, 0), dashed: Boolean(l.dashed),
    }));
    const camera = new THREE.OrthographicCamera(-4.5, 4.5, 4.5, -4.5, 0.1, 100);
    camera.userData.half = 4.5;
    camera.position.set(0, 0, 20);
    return stage(el, {
      reduce, camera, tone: false,
      setup({ scene }) {
        const ink = new THREE.LineBasicMaterial({ color: palette.accent });
        const dash = new THREE.LineDashedMaterial({ color: palette.accent, dashSize: 0.12, gapSize: 0.08 });
        const faint = new THREE.LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.18 });
        const rig = new THREE.Group();
        scene.add(rig);
        const parts = [];
        layers.forEach((l, i) => {
          const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(l.w, 0.12, l.d)), l.dashed ? dash : ink);
          if (l.dashed) line.computeLineDistances();
          line.position.set(l.x, 0, l.z); line.userData.i = i; rig.add(line); parts.push(line);
          const lead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(l.x - l.w / 2, 0, l.z - l.d / 2), new THREE.Vector3(l.x - l.w / 2, -3, l.z - l.d / 2)]), faint);
          lead.userData.i = i; rig.add(lead); parts.push(lead);
        });
        const grid = new THREE.GridHelper(7, 14, palette.accent, palette.accent);
        grid.material.transparent = true; grid.material.opacity = 0.09; grid.position.y = -3.2; rig.add(grid);
        return { rig, parts, tilt: new THREE.Vector2() };
      },
      frame({ t, pointer, state }) {
        const { rig, parts, tilt } = state;
        tilt.lerp(new THREE.Vector2(pointer.active ? pointer.x : 0, pointer.active ? pointer.y : 0), 0.05);
        const open = 0.5 + 0.5 * Math.sin(t * 0.0006);
        for (const p of parts) p.position.y = p.userData.i * 1.05 * (0.55 + 0.45 * open) - 2.0;
        rig.rotation.set(Math.atan(1 / Math.sqrt(2)) - tilt.y * 0.1, -Math.PI / 4 + tilt.x * 0.25, 0);
      },
    });
  },
});
