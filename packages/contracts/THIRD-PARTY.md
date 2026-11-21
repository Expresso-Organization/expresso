# 가져다 쓰는 것

## 효과 라이브러리 (`src/page-effects.generated.ts`)

`scripts/build-effects.mjs`가 `effects/`에서 묶는다. 묶음마다 머리에 출처 고지를 붙인다. 고지는 지우지 않습니다 — 라이선스 조건입니다.
지면 문서에 실릴 때도 주석을 걷어내지 않습니다. 효과별 출처는 `effects/catalog.json`.

| 무엇 | 출처 | 판본 | 라이선스 |
| --- | --- | --- | --- |
| Vanta.js — NET · DOTS · FOG와 기반(`effects/vendor/vanta`) | Teng Bao · <https://github.com/tengbao/vanta> | 0.5.24 | MIT (`effects/vendor/vanta/LICENSE.md`) |
| three.js (지면이 import map으로 받는다 · 묶음에 들지 않는다) | three.js authors · <https://github.com/mrdoob/three.js> | r170 | MIT |

Vanta 원본에서 고친 자리: NET의 `vertexColors: THREE.VertexColors`(three r125에서 없어짐)를 `true`로. 파일 머리에 적었다.
