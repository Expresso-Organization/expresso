#!/usr/bin/env node
/*
 * 3d-motion-web 엔진을 지면 문서가 실을 문자열로 들여온다.
 *
 *   node scripts/vendor-motionweb.mjs <3d-motion-web 스킬의 assets 폴더>
 *
 * 만드는 것: src/page-engine.generated.ts 의 PAGE_SCRIPT_ENGINE.
 * wgsl-std(WGSL 원문을 전역 문자열로) · hg-sdf.js · engine.js 를 이 순서로 잇는다 — 엔진이 앞의 둘을 전역에서 읽는다.
 * 세 파일은 고치지 않고 그대로 싣는다. 머리의 라이선스 고지도 그대로다(MIT 조건 — 지우지 않는다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const from = process.argv[2];
if (!from) {
  console.error("사용법: node scripts/vendor-motionweb.mjs <3d-motion-web/assets>");
  process.exit(1);
}
const read = (name) => readFileSync(join(resolve(from), name), "utf8");
const std = read("wgsl-std.wgsl");
const hg = read("hg-sdf.js");
const engine = read("engine.js");
if (!engine.includes("global.MotionWeb")) throw new Error("engine.js 가 MotionWeb 을 내보내지 않습니다. 경로를 확인하십시오.");
if (!hg.includes("HG_SDF_WGSL")) throw new Error("hg-sdf.js 가 WGSL 판이 아닙니다.");
/*
 * 지면용 WGSL 헬퍼 — 엔진은 고치지 않고 hg-sdf 묶음 뒤에 붙인다(엔진이 저자 블록에 함께 싣는 자리다).
 *
 * pageColor(c): 엔진은 배경까지 ACES 톤매핑(wgsl-std tonemapAces)을 거친다. 지면 바탕색(0.98 같은 밝은 색)을 그대로 돌려주면
 * 회색으로 눌려 캔버스가 지면 위에 회색 사각형으로 뜬다(2026-11-20 실제 그리기). 톤매핑의 역함수로, 돌려준 값이 톤매핑을 지나
 * 정확히 c가 되게 한다. ACES(x) = x(2.51x+0.03) / (x(2.43x+0.59)+0.14)를 x에 대해 푼 근이다.
 */
const helpers = [
  "fn pageColor(c: vec3f) -> vec3f {",
  "  let y = clamp(c, vec3f(0.0), vec3f(0.995));",
  "  let qa = 2.43 * y - vec3f(2.51);",
  "  let qb = 0.59 * y - vec3f(0.03);",
  "  let qc = 0.14 * y;",
  "  return (-qb - sqrt(qb * qb - 4.0 * qa * qc)) / (2.0 * qa);",
  "}",
].join("\n");
const bundle = `window.MOTIONWEB_WGSL_STD = ${JSON.stringify(std)};\n${hg}\nwindow.HG_SDF_WGSL = window.HG_SDF_WGSL + "\\n" + ${JSON.stringify(helpers)};\n${engine}`;
const version = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "page-engine.generated.ts");
writeFileSync(out, `// 생성물 — 손으로 고치지 않는다. scripts/vendor-motionweb.mjs 로 다시 만든다.
// 3d-motion-web 엔진(engine.js) · hg_sdf WGSL 이식본(MIT) · @vgpu/wgsl-std(MIT). 고지는 THIRD-PARTY.md 와 아래 원문 머리에 있다.

/** 들여온 엔진 묶음의 지문. 지면 문서가 어느 판을 실었는지 가린다. */
export const PAGE_SCRIPT_ENGINE_VERSION = ${JSON.stringify(version)};

/** 지면 문서가 classic \`<script>\`로 싣는 엔진 묶음. \`window.MotionWeb\`을 만든다. */
export const PAGE_SCRIPT_ENGINE = ${JSON.stringify(bundle)};
`);
console.log(`page-engine.generated.ts · ${Math.round(bundle.length / 1024)}KB · ${version}`);
