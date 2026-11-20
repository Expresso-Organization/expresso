/*
 * 메타볼 — 윤이 나는 액체 방울들이 서로 붙었다 떨어지고, 커서 쪽으로 끌린다.
 * three.js의 MarchingCubes(MIT, examples/jsm/objects)와 RoomEnvironment 조명으로 짓는다. 방울 하나만 강조색이다.
 * values.count = 방울 수(3~9, 기록 수 등), values.highlight = 강조할 방울 번호(0부터, 기본은 마지막).
 */
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { stage } from "./stage.js";

window.ExpressoEffects.register("metaballs", {
  mount({ el, palette, values, reduce }) {
    const count = Math.max(3, Math.min(9, Math.round(values.count ?? 5)));
    const hot = Math.max(0, Math.min(count - 1, Math.round(values.highlight ?? count - 1)));
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 6);
    return stage(el, {
      reduce, camera,
      setup({ renderer, scene }) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.05, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
        const blob = new MarchingCubes(64, material, false, true, 90000);
        blob.scale.setScalar(1.9);
        scene.add(blob);
        const base = new THREE.Color(palette.soft), accent = new THREE.Color(palette.accent);
        const seeds = Array.from({ length: count }, (_, i) => ({ a: i * 2.4, b: i * 1.7 + 0.5, c: 0.6 + (i % 3) * 0.25 }));
        return { blob, base, accent, seeds, pull: new THREE.Vector2() };
      },
      frame({ t, pointer, state }) {
        const { blob, base, accent, seeds, pull } = state;
        const time = t * 0.00035;
        pull.lerp(new THREE.Vector2(pointer.active ? pointer.x : 0, pointer.active ? pointer.y : 0), 0.05);
        blob.reset();
        const strength = 1.2 / ((Math.sqrt(count) - 1) / 4 + 1);
        seeds.forEach((s, i) => {
          const x = 0.5 + 0.27 * Math.sin(time * s.c + s.a) + pull.x * 0.12;
          const y = 0.5 + 0.22 * Math.cos(time * s.c * 1.3 + s.b) + pull.y * 0.12;
          const z = 0.5 + 0.18 * Math.sin(time * 0.9 + s.a * 0.7);
          blob.addBall(x, y, z, strength, 12, i === hot ? accent : base);
        });
        blob.update();
        blob.rotation.y = pull.x * 0.25;
        blob.rotation.x = -pull.y * 0.15;
      },
    });
  },
});
