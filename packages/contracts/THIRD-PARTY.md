# 가져다 쓰는 것

`src/page-engine.generated.ts`(지면 그림 엔진 묶음)에 남의 저작물이 들어갑니다. 고지는 지우지 않습니다 — 라이선스 조건입니다.
묶음은 `scripts/vendor-motionweb.mjs`가 3d-motion-web 스킬의 `assets`에서 만들고, 각 파일 머리의 원문 고지를 그대로 싣습니다.
지면 문서에 실릴 때도 주석을 걷어내지 않습니다.

| 무엇 | 출처 | 판본 | 라이선스 |
| --- | --- | --- | --- |
| 3d-motion-web 엔진 (`engine.js`) | 박민재 · 사용자 스킬 | 묶음 지문 `PAGE_SCRIPT_ENGINE_VERSION` | 이 저장소의 것 |
| hg_sdf WGSL 이식본 (`hg-sdf.js`) | Mercury Demogroup · <https://mercury.sexy/hg_sdf/> | 2021-07-28 | `MIT OR CC-BY-NC-4.0` 중 **MIT** |
| @vgpu/wgsl-std (`wgsl-std.wgsl`) | Vercel Labs · <https://github.com/vercel-labs/vgpu> | 0.3.1 | MIT |

hg_sdf는 2016년판(CC BY-NC 단독)을 받아 오지 않습니다. MIT는 2021년판부터입니다.

## 효과 라이브러리 (`src/page-effects.generated.ts`)

`scripts/build-effects.mjs`가 `effects/`에서 묶는다. 묶음마다 머리에 출처 고지를 붙인다. 효과별 출처는 `effects/catalog.json`.

| 무엇 | 출처 | 판본 | 라이선스 |
| --- | --- | --- | --- |
| Vanta.js — NET · DOTS · FOG · GLOBE · CELLS와 기반(`effects/vendor/vanta`) | Teng Bao · <https://github.com/tengbao/vanta> | 0.5.24 | MIT (`effects/vendor/vanta/LICENSE.md`) |
| three.js 예제 부가 모듈 — MarchingCubes · RoomEnvironment | three.js authors · <https://github.com/mrdoob/three.js> | r170 | MIT |

Vanta 원본에서 고친 자리: NET · GLOBE의 `vertexColors: THREE.VertexColors`(three r125에서 없어짐)를 `true`로. 각 파일 머리에 적었다.
