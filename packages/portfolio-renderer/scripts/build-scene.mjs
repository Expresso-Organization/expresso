// 공개 지면의 장면 런타임을 묶습니다. 웹의 dev · build가 불러 `public/scene-runtime/v1`에 둡니다.
// 진입 파일(main.js)은 작게 두고, three.js 장면은 쓰는 지면에서만 받도록 조각으로 나눕니다.
// 쓰는 법: node build-scene.mjs <출력 폴더>
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const outdir = resolve(process.cwd(), process.argv[2] ?? "dist/scene-runtime/v1");
// 조각 이름에 해시가 붙으므로 지난 빌드의 조각을 지웁니다.
rmSync(outdir, { recursive: true, force: true });
await build({
  entryPoints: { main: fileURLToPath(new URL("../src/scene-runtime/main.ts", import.meta.url)) },
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  target: ["es2022"],
  chunkNames: "[name]-[hash]",
  // three.js의 MIT 라이선스 주석을 파일 끝에 남깁니다.
  legalComments: "eof",
  logLevel: "warning",
});
console.log(`장면 런타임: ${outdir}`);
