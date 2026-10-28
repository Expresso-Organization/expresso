import { mountScene, type SceneFactory } from "./host.js";

/**
 * 공개 지면의 장면 런타임 진입점입니다(`/scene-runtime/v1/main.js`).
 *
 * 키트가 그린 배경 층 가운데 `data-scene`이 있는 것에 장면을 붙입니다. three.js 장면은 쓰는 지면에서만 받도록
 * 따로 묶은 조각을 동적으로 가져옵니다. 2D 장면은 three.js를 받지 않습니다.
 */
const SCENES: Record<string, () => Promise<SceneFactory>> = {
  orb: () => import("./scenes-3d.js").then((module) => module.orb),
  terrain: () => import("./scenes-3d.js").then((module) => module.terrain),
  knot: () => import("./scenes-3d.js").then((module) => module.knot),
  constellation: () => import("./scenes-2d.js").then((module) => module.constellation),
  flow: () => import("./scenes-2d.js").then((module) => module.flow),
  ripple: () => import("./scenes-2d.js").then((module) => module.ripple),
};

for (const host of document.querySelectorAll<HTMLElement>(".xp-backdrop[data-scene]")) {
  const load = SCENES[host.dataset.scene ?? ""];
  // 조각을 받지 못하면 대체 그림이 그대로 남습니다.
  if (load) load().then((factory) => mountScene(host, factory), () => undefined);
}
