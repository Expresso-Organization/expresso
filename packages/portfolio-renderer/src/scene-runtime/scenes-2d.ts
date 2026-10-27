import { cssColor, inkMix, type Rgb } from "./ink.js";
import type { Scene, SceneColors, SceneFactory, SceneFrame } from "./host.js";

/**
 * 캔버스 2D 장면 셋입니다. 첫 번째 잉크 하나만 쓰고, 그리는 색은 모두 바탕과 그 잉크 사이입니다.
 * 바탕을 먼저 칠하고 불투명한 색으로 그리므로 겹친 선과 가장자리도 그 사이에 머뭅니다.
 */

/** 같은 화면이 매번 같은 배치로 시작하도록 고정 씨앗의 난수를 씁니다. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 잉크 비율을 64단계로 나눈 색 문자열입니다. 프레임마다 문자열을 만들지 않습니다. */
function palette(colors: SceneColors): string[] {
  return Array.from({ length: 65 }, (_, step) => cssColor(inkMix(colors.background, colors.inks[0], step / 64)));
}
const shade = (colors: string[], amount: number) => colors[Math.round(Math.min(1, Math.max(0, amount)) * 64)]!;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("캔버스 2D를 쓸 수 없습니다.");
  return context;
}

function fit(canvas: HTMLCanvasElement, frame: SceneFrame): boolean {
  if (canvas.width === frame.width && canvas.height === frame.height) return false;
  canvas.width = frame.width;
  canvas.height = frame.height;
  return true;
}

const pointerPixel = (frame: SceneFrame) => ({ x: ((frame.pointer.x + 1) / 2) * frame.width, y: ((1 - frame.pointer.y) / 2) * frame.height });

/** 떠다니는 점이 가까운 점과 선으로 이어지고, 포인터 가까이의 점은 포인터와도 이어집니다. */
export const constellation: SceneFactory = (canvas, colors) => {
  const context = context2d(canvas);
  const inks = palette(colors);
  const background = shade(inks, 0);
  const next = random(7);
  let points: { x: number; y: number; vx: number; vy: number }[] = [];
  let last = 0;
  const scene: Scene = {
    frame(frame) {
      const { width, height, pixelRatio: ratio } = frame;
      if (fit(canvas, frame) || !points.length) {
        // 화면 넓이에 비례해 점을 두되 휴대폰 · 큰 화면 모두 그릴 만한 수로 자릅니다.
        const count = Math.round(Math.min(140, Math.max(36, (width * height) / (ratio * ratio * 9000))));
        points = Array.from({ length: count }, () => ({ x: next() * width, y: next() * height, vx: (next() - 0.5) * 0.25 * ratio, vy: (next() - 0.5) * 0.25 * ratio }));
      }
      const step = Math.min(3, Math.max(0, (frame.time - last) * 60));
      last = frame.time;
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      const reach = 130 * ratio;
      const hand = pointerPixel(frame);
      for (const point of points) {
        point.x = (point.x + point.vx * step + width) % width;
        point.y = (point.y + point.vy * step + height) % height;
      }
      context.lineWidth = ratio;
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j]!;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > reach) continue;
          context.strokeStyle = shade(inks, (1 - distance / reach) * 0.85);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
        const toHand = Math.hypot(a.x - hand.x, a.y - hand.y);
        if (frame.pointer.strength > 0.05 && toHand < reach * 1.4) {
          context.strokeStyle = shade(inks, (1 - toHand / (reach * 1.4)) * frame.pointer.strength);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(hand.x, hand.y);
          context.stroke();
        }
      }
      context.fillStyle = shade(inks, 1);
      for (const point of points) {
        context.beginPath();
        context.arc(point.x, point.y, 1.8 * ratio, 0, Math.PI * 2);
        context.fill();
      }
    },
    dispose() {},
  };
  return scene;
};

/** 흐름장을 따라 흐르는 선입니다. 포인터 둘레에서는 흐름이 소용돌이로 휩니다. */
export const flow: SceneFactory = (canvas, colors) => {
  const context = context2d(canvas);
  const inks = palette(colors);
  const background = shade(inks, 0);
  const next = random(11);
  let particles: { x: number; y: number; life: number }[] = [];
  let last = 0;
  const angle = (x: number, y: number, t: number) =>
    Math.sin(x * 0.0021 + t * 0.15) * 1.6 + Math.cos(y * 0.0027 - t * 0.11) * 1.4 + Math.sin((x + y) * 0.0011) * 0.8;
  return {
    frame(frame) {
      const { width, height, pixelRatio: ratio } = frame;
      if (fit(canvas, frame) || !particles.length) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
        const count = Math.round(Math.min(900, Math.max(220, (width * height) / (ratio * ratio * 1600))));
        particles = Array.from({ length: count }, () => ({ x: next() * width, y: next() * height, life: next() * 200 }));
        // 움직임 줄이기에서는 한 프레임이라 흐름이 보이도록 미리 여러 걸음 그려 둡니다.
        for (let warm = 0; warm < 60; warm++) this.frame({ ...frame, time: frame.time - (60 - warm) / 60 });
      }
      const step = Math.min(3, Math.max(0.5, (frame.time - last) * 60));
      last = frame.time;
      // 바탕색을 옅게 덮어 오래된 자취가 바탕으로 사라집니다. 바탕과 잉크 사이의 색만 남습니다.
      context.globalAlpha = 0.06;
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
      context.lineWidth = 1.1 * ratio;
      context.strokeStyle = shade(inks, 0.9);
      const hand = pointerPixel(frame);
      const swirl = 220 * ratio;
      context.beginPath();
      for (const particle of particles) {
        let direction = angle(particle.x / ratio, particle.y / ratio, frame.time);
        const dx = particle.x - hand.x;
        const dy = particle.y - hand.y;
        const distance = Math.hypot(dx, dy);
        if (frame.pointer.strength > 0.05 && distance < swirl) {
          const weight = (1 - distance / swirl) * frame.pointer.strength;
          direction = direction * (1 - weight) + (Math.atan2(dy, dx) + Math.PI / 2) * weight;
        }
        const x = particle.x + Math.cos(direction) * 1.4 * ratio * step;
        const y = particle.y + Math.sin(direction) * 1.4 * ratio * step;
        context.moveTo(particle.x, particle.y);
        context.lineTo(x, y);
        particle.x = x;
        particle.y = y;
        particle.life -= step;
        if (particle.life < 0 || x < 0 || y < 0 || x > width || y > height) {
          particle.x = next() * width;
          particle.y = next() * height;
          particle.life = 120 + next() * 160;
        }
      }
      context.stroke();
    },
    dispose() {},
  };
};

/** 점 격자에 물결이 퍼집니다. 포인터가 지나간 자리에서 물결이 생기고, 포인터가 없으면 가끔 저절로 생깁니다. */
export const ripple: SceneFactory = (canvas, colors) => {
  const context = context2d(canvas);
  const inks = palette(colors);
  const background = shade(inks, 0);
  const next = random(5);
  const waves: { x: number; y: number; born: number }[] = [];
  let lastSpawn = -10;
  return {
    frame(frame) {
      const { width, height, pixelRatio: ratio, time } = frame;
      fit(canvas, frame);
      const hand = pointerPixel(frame);
      if (frame.pointer.strength > 0.5 && time - lastSpawn > 0.35) {
        waves.push({ x: hand.x, y: hand.y, born: time });
        lastSpawn = time;
      } else if (time - lastSpawn > 2.6) {
        waves.push({ x: (0.35 + next() * 0.6) * width, y: next() * height * 0.8, born: time - (time < 3 ? 1.2 : 0) });
        lastSpawn = time;
      }
      while (waves.length && time - waves[0]!.born > 6) waves.shift();
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      const gap = 22 * ratio;
      const speed = 160 * ratio;
      for (let y = gap / 2; y < height; y += gap)
        for (let x = gap / 2; x < width; x += gap) {
          let lift = 0;
          for (const wave of waves) {
            const age = time - wave.born;
            const distance = Math.hypot(x - wave.x, y - wave.y);
            const front = distance - age * speed;
            // 물결 앞머리 근처에서만 솟고, 나이가 들수록 잦아듭니다.
            lift += Math.exp(-(front * front) / (2 * (18 * ratio) ** 2)) * Math.max(0, 1 - age / 6);
          }
          const amount = Math.min(1, 0.32 + lift * 0.68);
          context.fillStyle = shade(inks, amount);
          context.beginPath();
          context.arc(x, y, (1.2 + Math.min(1, lift) * 1.6) * ratio, 0, Math.PI * 2);
          context.fill();
        }
    },
    dispose() {},
  };
};

export type { Rgb };
