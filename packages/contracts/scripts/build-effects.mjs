#!/usr/bin/env node
/*
 * 지면 효과 라이브러리를 지면 문서가 실을 문자열로 묶는다.
 *
 *   node scripts/build-effects.mjs
 *
 * effects/src의 런타임과 효과마다 ESM 묶음을 만든다. three는 바깥에 두고(지면의 import map이 r170 한 주소로 푼다),
 * Vanta 원본(effects/vendor/vanta, MIT)은 묶음 안에 든다.
 * 만드는 것: src/page-effects.generated.ts — PAGE_EFFECT_RUNTIME · PAGE_EFFECTS · PAGE_EFFECT_CATALOG. 손으로 고치지 않는다.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "effects", "catalog.json"), "utf8"));
const bundle = async (entry) => {
  const result = await build({
    entryPoints: [join(root, "effects", "src", entry)], bundle: true, format: "esm", write: false,
    // 정확히 "three"만 바깥에 둔다. esbuild의 external은 하위 경로(three/addons/…)까지 뺀다 — 부가 모듈을 쓰는 효과가 생겨도 묶음에 들게.
    plugins: [{ name: "three-only", setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: "three", external: true })); } }],
    legalComments: "inline", logLevel: "warning", target: "es2020",
  });
  return result.outputFiles[0].text;
};
const runtime = await bundle("runtime.js");
const effects = {};
for (const item of catalog) effects[item.name] = await bundle(`${item.name}.js`);
// Vanta 원본에는 파일마다 고지가 없다(MIT 고지는 저장소의 LICENSE.md). 묶음 머리에 고지를 붙인다 — MIT 조건.
const vantaNotice = `/*! Vanta.js 0.5.24 · Copyright 2020 Teng Bao · MIT License · https://github.com/tengbao/vanta */\n`;
for (const item of catalog) if (item.source.name.startsWith("Vanta")) effects[item.name] = vantaNotice + effects[item.name];
const version = createHash("sha256").update(runtime + JSON.stringify(effects)).digest("hex").slice(0, 12);
writeFileSync(join(root, "src", "page-effects.generated.ts"), `// 생성물 — 손으로 고치지 않는다. scripts/build-effects.mjs 로 다시 만든다.
// 출처 · 라이선스는 effects/catalog.json 과 THIRD-PARTY.md 에 있다.

/** 묶음의 지문. */
export const PAGE_EFFECTS_VERSION = ${JSON.stringify(version)};

/** window.ExpressoEffects 를 만드는 런타임. 효과 묶음보다 먼저 싣는다. */
export const PAGE_EFFECT_RUNTIME = ${JSON.stringify(runtime)};

/** 효과마다 ESM 묶음. 지면이 부르는 효과만 싣는다. */
export const PAGE_EFFECTS: Record<string, string> = ${JSON.stringify(effects)};

/** 효과 목록 — 그리는 호출이 읽고 고른다. */
export const PAGE_EFFECT_CATALOG: { name: string; title: string; dimension: "2d" | "3d"; background: ("light" | "dark")[]; look: string; use: string; values: string; place: string; source: { name: string; url: string; version: string; license: string } }[] = ${JSON.stringify(catalog, null, 2)};
`);
console.log(`page-effects.generated.ts · runtime ${Math.round(runtime.length / 1024)}KB · ${Object.entries(effects).map(([n, c]) => `${n} ${Math.round(c.length / 1024)}KB`).join(" · ")} · ${version}`);
