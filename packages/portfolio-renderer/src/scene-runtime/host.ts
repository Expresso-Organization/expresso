import { parseHex, type Rgb } from "./ink.js";

/** 장면이 한 프레임을 그릴 때 받는 값입니다. 크기는 캔버스 픽셀 단위입니다. */
export interface SceneFrame {
  width: number;
  height: number;
  pixelRatio: number;
  /** 초 단위 경과 시간입니다. 움직임 줄이기에서는 고정값입니다. */
  time: number;
  /** 포인터 위치(-1–1, 위가 +1)와 반응 세기(0–1)입니다. 부드럽게 따라갑니다. */
  pointer: { x: number; y: number; strength: number };
}

export interface SceneColors {
  background: Rgb;
  inks: [Rgb, Rgb];
}

export interface Scene {
  frame(frame: SceneFrame): void;
  dispose(): void;
}

/** 캔버스와 색을 받아 장면을 만듭니다. 이 기기에서 그릴 수 없으면 예외를 던집니다. */
export type SceneFactory = (canvas: HTMLCanvasElement, colors: SceneColors) => Scene;

/** 휴대폰 폭에서는 픽셀 배율을 더 낮춥니다. 장면은 장식이라 선명도보다 배터리와 스크롤이 먼저입니다. */
export function pixelRatioFor(width: number, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, width < 600 ? 1.5 : 2);
}

function readColors(host: HTMLElement): SceneColors | null {
  const style = getComputedStyle(host);
  const background = parseHex(style.getPropertyValue("--xp-bd-base"));
  const first = parseHex(style.getPropertyValue("--xp-bd-1"));
  const second = parseHex(style.getPropertyValue("--xp-bd-2"));
  if (!background || !first || !second) return null;
  return { background, inks: [first, second] };
}

/**
 * 배경 층 하나에 장면을 붙입니다.
 *
 * 캔버스를 층 안에 만들고 첫 프레임을 그린 뒤에야 대체 그림을 가립니다(`data-scene-live`). 장면을 만들지 못하거나
 * WebGL 문맥을 잃으면 캔버스를 지우고 대체 그림이 그대로 남습니다. 화면 밖이거나 탭이 숨겨지면 프레임을 멈춥니다.
 * 움직임 줄이기에서는 한 프레임만 그리고 포인터를 읽지 않습니다.
 */
export function mountScene(host: HTMLElement, factory: SceneFactory): void {
  const colors = readColors(host);
  if (!colors) return;
  const hero = host.closest<HTMLElement>(".xp-hero") ?? host;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || !!host.closest('[data-motion="none"]');
  const canvas = document.createElement("canvas");
  canvas.className = "xp-scene-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);

  let scene: Scene;
  try {
    scene = factory(canvas, colors);
  } catch {
    canvas.remove();
    return;
  }

  const pointer = { x: 0, y: 0, strength: 0 };
  const target = { x: 0, y: 0, strength: 0 };
  let visible = true;
  let handle = 0;
  let disposed = false;
  const started = performance.now();

  const size = () => {
    const rect = host.getBoundingClientRect();
    const ratio = pixelRatioFor(rect.width, devicePixelRatio);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    return { width, height, ratio };
  };

  const draw = (now: number) => {
    const { width, height, ratio } = size();
    // 포인터는 매 프레임 목표 쪽으로 12%씩 다가가 손떨림 없이 따라갑니다.
    pointer.x += (target.x - pointer.x) * 0.12;
    pointer.y += (target.y - pointer.y) * 0.12;
    pointer.strength += (target.strength - pointer.strength) * 0.08;
    scene.frame({ width, height, pixelRatio: ratio, time: reduced ? 6 : (now - started) / 1000, pointer });
  };

  const stop = () => {
    if (handle) cancelAnimationFrame(handle);
    handle = 0;
  };
  const tick = (now: number) => {
    handle = 0;
    if (disposed) return;
    draw(now);
    if (!reduced && visible && !document.hidden) handle = requestAnimationFrame(tick);
  };
  const start = () => {
    if (!handle && !disposed && !reduced && visible && !document.hidden) handle = requestAnimationFrame(tick);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
    scene.dispose();
    canvas.remove();
    delete host.dataset.sceneLive;
  };
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    dispose();
  });

  try {
    draw(performance.now());
  } catch {
    dispose();
    return;
  }
  host.dataset.sceneLive = "";
  if (reduced) {
    // 크기가 바뀌면 멈춘 한 장면을 다시 그립니다.
    new ResizeObserver(() => !disposed && draw(performance.now())).observe(host);
    return;
  }

  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) start();
    else stop();
  }).observe(host);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  hero.addEventListener("pointermove", (event) => {
    const rect = host.getBoundingClientRect();
    target.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    target.y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    target.strength = 1;
  });
  hero.addEventListener("pointerleave", () => {
    target.strength = 0;
  });
  start();
}
