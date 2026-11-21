// 직접 짓는 three 효과의 공통 무대 — 컨테이너를 채우는 캔버스 · 크기 맞춤 · 화면 밖이면 멈춤 · 동작 줄이기면 한 장면.
import * as THREE from "three";

export function stage(el, { reduce, camera, setup, frame, tone = true }) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  el.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (tone) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const state = setup({ THREE, renderer, scene, camera, canvas }) ?? {};
  const pointer = { x: 0, y: 0, active: false };
  const onMove = (event) => {
    const r = el.getBoundingClientRect();
    pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -(((event.clientY - r.top) / r.height) * 2 - 1);
    pointer.active = true;
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  const resize = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) camera.aspect = w / h;
    else { const a = w / h; camera.left = -camera.userData.half * a; camera.right = camera.userData.half * a; }
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(el); resize();
  let visible = true, raf = 0, alive = true;
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible && !reduce && !raf) loop(performance.now()); });
  io.observe(el);
  const draw = (t) => { frame({ t, pointer, state }); renderer.render(scene, camera); };
  function loop(t) {
    raf = 0;
    if (!alive) return;
    draw(t);
    if (!reduce && visible) raf = requestAnimationFrame(loop);
  }
  draw(reduce ? 6000 : 0);
  if (!reduce) raf = requestAnimationFrame(loop);
  return { destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener("pointermove", onMove); renderer.dispose(); canvas.remove(); } };
}
