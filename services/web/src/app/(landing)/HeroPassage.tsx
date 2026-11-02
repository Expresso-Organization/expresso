"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

import poster from "./images/hero-cup.jpg";
import { CUP_SHADER } from "./motion/cup-shader";
import { WGSL_STD } from "./motion/wgsl-std";
import styles from "./landing.module.css";

interface MotionHandle {
  setUniforms(values: Record<string, unknown>): void;
  destroy(): void;
}

declare global {
  interface Window {
    MotionWeb?: { create(options: Record<string, unknown>): Promise<MotionHandle | null> };
  }
}

const mix = (from: number, to: number, t: number) => from + (to - from) * t;
/** 감속 곡선. 스크롤을 시작하자마자 잔이 움직이고, 크레마에 닿을 때 천천히 멎는다. */
const ease = (t: number) => 1 - (1 - t) * (1 - t);

/**
 * 첫 화면 구간. 화면에 붙은 무대 위에 에스프레소 잔을 그리고, 구간을 내리는 동안
 * 카메라가 크레마 속으로 내려간다. 진행도 하나(`--p`)가 카메라 · 잔 기울기 · 글
 * 사라짐을 함께 몬다 — 셋이 다른 시계를 쓰면 스크롤을 멈추거나 되돌릴 때 어긋난다.
 *
 * - 포인터를 움직이면 그 거리만큼 크레마가 저어진다.
 * - WebGPU 가 없거나 셰이더가 실패하면 같은 구도로 미리 렌더한 포스터가 남는다.
 * - 동작 줄이기 설정이면 구간이 한 화면으로 줄고 잔은 첫 구도에 머문다.
 */
export function HeroPassage({ children }: { children: ReactNode }) {
  const passage = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = { target: 0, p: 0, stir: 0, stirVel: 0, px: 0, py: 0, last: performance.now() };
    let disposed = false;
    let handle: MotionHandle | null = null;

    const read = () => {
      const element = passage.current;
      if (!element) return 0;
      const rect = element.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      return Math.min(1, Math.max(0, -rect.top / travel));
    };
    const onScroll = () => {
      state.target = reduce ? 0 : read();
      stage.current?.style.setProperty("--p", state.target.toFixed(4));
    };
    const onPointer = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      state.stirVel += Math.hypot(x - state.px, y - state.py) * 7;
      state.px = x;
      state.py = y;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const stageElement = stage.current;
    if (!reduce) stageElement?.addEventListener("pointermove", onPointer);

    const start = async () => {
      if (!("gpu" in navigator) || !canvas.current) return;
      await import("./motion/engine.js");
      if (disposed || !window.MotionWeb || !canvas.current) return;
      const created = await window.MotionWeb.create({
        canvas: canvas.current,
        fragment: CUP_SHADER,
        wgslStd: WGSL_STD,
        include: "// hg_sdf 를 쓰지 않는다",
        uniforms: { cupPos: [1.62, -0.72, 0], tilt: 0.42, spin: 2.5, stir: 0, wideScrim: 1 },
        lens: { vignette: 0.3, grain: 0.02 },
        maxFps: 60,
        // 실패는 포스터가 대신한다. 붉은 오류 상자를 방문자에게 보이지 않는다.
        onError: (message: string) => console.warn("[landing] 3D 장면 대신 포스터를 보인다:", message),
        camera: (_scroll: number, wide: number) => {
          const now = performance.now();
          const dt = Math.min(0.1, (now - state.last) / 1000);
          state.last = now;
          // 진행도에 관성을 준다. 빠르게 훑어도 잔이 순간이동하지 않는다.
          state.p += (state.target - state.p) * (1 - Math.exp(-dt * 5));
          state.stir += state.stirVel * dt;
          state.stirVel *= Math.exp(-dt * 2.2);
          const e = ease(state.p);
          const rest = 1 - e;
          handle?.setUniforms({
            cupPos: [
              mix(mix(0.3, 1.62, wide), 0, e) + state.px * 0.14 * rest,
              mix(mix(-1.6, -0.72, wide), 0, e) - state.py * 0.08 * rest,
              0,
            ],
            tilt: mix(0.42, 1.5, e),
            spin: 2.5 + e * 0.7,
            stir: state.stir,
            wideScrim: wide * rest,
          });
          return [0, 0, mix(-mix(6.2, 5.3, wide), -1.6, e)];
        },
      });
      if (disposed) {
        created?.destroy();
        return;
      }
      handle = created;
      if (created) setLive(true);
    };
    void start();

    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      stageElement?.removeEventListener("pointermove", onPointer);
      handle?.destroy();
    };
  }, []);

  return (
    <section ref={passage} id="hero" className={styles.heroPassage}>
      <div ref={stage} className={styles.heroStage} data-theme="dark">
        <Image src={poster} alt="" priority placeholder="blur" sizes="100vw" className={styles.heroPoster} />
        <canvas ref={canvas} className={styles.heroCanvas} data-live={live} aria-hidden="true" />
        <div className={styles.heroContent}>{children}</div>
      </div>
    </section>
  );
}
