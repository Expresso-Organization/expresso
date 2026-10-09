// 보관된 원본 코드만 사용합니다. 네트워크와 외부 저장소 체크아웃에 의존하지 않습니다.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import * as esbuild from "esbuild";
import { applyAcquisitions } from "../../../docs/library/acquisition-core.mjs";
import { applyCuration } from "../../../docs/library/curation-core.mjs";
import { applyExamples } from "../../../docs/library/examples-core.mjs";
import { applyComponentry } from "../../../docs/library/componentry-core.mjs";
const root = process.cwd(),
  out = path.join(root, "packages/portfolio-renderer/src/collected");
const read = (p) =>
  JSON.parse(fs.readFileSync(path.join(root, "docs/library", p), "utf8"));
const catalog = applyComponentry(
  applyExamples(
    applyCuration(
      applyAcquisitions(read("catalog.json"), read("acquisitions.json")),
      read("curation.json"),
    ),
    read("examples.json"),
  ),
  read("componentry.json"),
);
const tmp = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "expresso-collected-")),
);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const files = new Map();
for (const f of fs.readdirSync(
  path.join(root, "docs/library/materials/watermelon/registry"),
)) {
  const m = read(`materials/watermelon/registry/${f}`);
  for (const e of m.files || []) if (e.content) files.set(e.path, e.content);
}
for (const f of fs.readdirSync(
  path.join(root, "docs/library/materials/componentry/registry"),
)) {
  const m = read(`materials/componentry/registry/${f}`);
  for (const e of m.files || []) if (e.content) files.set(e.path, e.content);
}
for (const [p, c] of files) {
  const target = path.join(tmp, p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, c);
}
fs.mkdirSync(path.join(tmp, "src/lib"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, "src/lib/utils.ts"),
  'import {clsx} from "clsx";import {twMerge} from "tailwind-merge";export const cn=(...x)=>twMerge(clsx(...x));',
);
// 원본 로고는 개인의 로고 입력이 없으므로 노출하지 않습니다.
fs.mkdirSync(path.join(tmp, "src/assets"), { recursive: true });
fs.writeFileSync(
  path.join(tmp, "src/assets/logo-icon.tsx"),
  "export default function Logo(){return null} export const LogoIcon=Logo;",
);
const modules = [],
  metadata = [];
let compilerOptions;
const family = (n) =>
  /^hero-/.test(n)
    ? "intro"
    : /^(book|card|text-gradient|feature-1|feature-4|annotated-text)$/.test(n)
      ? "section"
      : null;
for (const item of catalog.items) {
  const detail = item.detailPath
    ? read(item.detailPath.replace(/^\.\/library\//, ""))
    : {};
  const materials = (detail.materials || []).map((m) => ({
    path: m.path,
    sha256: m.sha256,
  }));
  let status = "adapter_needed",
    reason = "입력 계약과 실행 어댑터가 필요합니다.",
    runtime = null;
  if (item.rightsStatus !== "allowed") {
    status = "guidance";
    reason = "출처 참고용 또는 이용 조건 확인 대상입니다.";
  } else if (item.artifactKind === "icon") {
    status = "asset";
    reason = "보관된 SVG 자산으로 사용할 수 있습니다.";
  } else if (
    item.artifactKind === "reference" ||
    item.artifactKind === "prompt" ||
    item.artifactKind === "motion" ||
    item.artifactKind === "diagram"
  ) {
    status = "guidance";
    reason =
      "구도·제작·모션 참고 자료입니다. 실행 컴포넌트로 대체하지 않습니다.";
  } else if (item.acquisitionStatus !== "source_ready") {
    status = "unavailable";
    reason = "실행 원본 코드가 확보되지 않았습니다.";
  } else if (
    ["watermelon", "componentry"].includes(item.sourceSite) &&
    family(item.sourceItemId)
  ) {
    const material = materials.find((m) =>
      m.path.endsWith(`/registry/${item.sourceItemId}.json`),
    );
    if (material) {
      const raw = fs.readFileSync(
        path.join(root, "docs", material.path.replace(/^\.\//, "")),
        "utf8",
      );
      if (sha(raw) !== material.sha256)
        throw new Error(`보관 원본 해시 불일치: ${item.id}`);
      const m = JSON.parse(raw),
        entry =
          m.files.find((e) => e.path.endsWith(`/${item.sourceItemId}.tsx`)) ||
          m.files[0];
      const sf = ts.createSourceFile(
        entry.path,
        entry.content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      let headingClasses="";
      const readHeading=node=>{if(ts.isJsxOpeningElement(node)&&node.tagName.getText(sf)==="h1")headingClasses=node.attributes.properties.find(a=>a.name?.getText(sf)==="className")?.initializer?.getText(sf)||"";ts.forEachChild(node,readHeading);};readHeading(sf);
      const iface = sf.statements.find(
        (x) => ts.isInterfaceDeclaration(x) && /Props$/.test(x.name.text),
      );
      const props =
        iface?.members.map((x) => ({
          name: x.name?.getText(sf),
          type: x.type?.getText(sf) || "",
          required: !x.questionToken,
        })) || [];
      let member = entry.content.match(/export default function (\w+)/)?.[1];
      const hasDefault = /export default/.test(entry.content);
      if (!hasDefault)
        member =
          entry.content.match(/export (?:function|const) (\w+)/)?.[1] ||
          (item.sourceItemId === "card" ? "Card" : null);
      if (
        /\bCanvas\b|\bWebGLRenderingContext\b|\buseFrame\b|@react-three/.test(
          entry.content,
        )
      ) {
        reason =
          "WebGL Canvas runtime and supplied visual inputs are required.";
      } else if (!member && !hasDefault) {
        reason = "공개 진입점이 없어 어댑터 지정이 필요합니다.";
      } else if (
        !iface &&
        !["card", "feature-1", "feature-4"].includes(item.sourceItemId)
      ) {
        reason = "샘플 내용이 고정되어 있어 명시적인 데이터 슬롯이 필요합니다.";
      } else if (
        props.some((p) => p.required && !["children", "title"].includes(p.name))
      ) {
        reason = "필수 입력을 현재 포트폴리오 계약으로 연결할 수 없습니다.";
      } else {
        runtime = {
          slot: family(item.sourceItemId),
            key: `${item.sourceSite}-${item.sourceItemId}`,
          props,
          export: hasDefault ? "default" : member,
          material: material.path,
          sha256: material.sha256,
          revision: detail.sourceRevision || null,
          license: detail.sourceLicense || item.sourceLicense || null,
          adaptation:
            "원본 React 코드 + 입력 속성 연결 + 샘플/외부 자산 제거 + CSS 모션",
        };
        const index = modules.length,
          alias = `Source${index}`;
        const modulePath = path.join(tmp, `component-${index}.mjs`);
        try {
          const options = {
            stdin: {
              contents: `export {${hasDefault ? "default" : member} as Component} from ${JSON.stringify(path.join(tmp, entry.path))};`,
              loader: "tsx",
              resolveDir: tmp,
            },
            outfile: modulePath,
            bundle: true,
            platform: "node",
            format: "esm",
            minify: true,
            mainFields: ["module", "main"],
            define: { "process.env.NODE_ENV": '"production"' },
            banner: {
              js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
            },
            jsx: "automatic",
            nodePaths: [
              path.join(root, "scripts/library/renderer/node_modules"),
            ],
            external: ["react-dom"],
            alias: {
              "@": path.join(tmp, "src"),
              "motion/react": path.join(
                root,
                "packages/portfolio-renderer/src/source-motion.tsx",
              ),
              "framer-motion": path.join(
                root,
                "packages/portfolio-renderer/src/source-motion.tsx",
              ),
            },
            plugins: [
              {
                name: "bound-jsx",
                setup(build) {
                  build.onLoad({ filter: /feature-(1|4)\.tsx$/ }, (args) => {
                    const original = fs.readFileSync(args.path, "utf8");
                    let detail = -1,
                      paragraph = 0;
                    const parsed = ts.createSourceFile(
                      args.path,
                      original,
                      99,
                      true,
                      4,
                    );
                    const transformed = ts.transform(parsed, [
                      (context) => (node) => {
                        const visit = (n) => {
                          if (ts.isJsxOpeningElement(n)) {
                            const tag = n.tagName.getText(parsed);
                            let field = null;
                            if (tag === "h1") field = "title";
                            else if (tag === "h3") {
                              detail++;
                              field = detail + ".label";
                            } else if (tag === "p") {
                              field =
                                detail >= 0 ? detail + ".text" : "summary";
                              paragraph++;
                            }
                            if (field)
                              return ts.factory.updateJsxOpeningElement(
                                n,
                                n.tagName,
                                n.typeArguments,
                                ts.factory.updateJsxAttributes(n.attributes, [
                                  ...n.attributes.properties,
                                  ts.factory.createJsxAttribute(
                                    ts.factory.createIdentifier(
                                      "data-portfolio-field",
                                    ),
                                    ts.factory.createStringLiteral(field),
                                  ),
                                ]),
                              );
                          }
                          return ts.visitEachChild(n, visit, context);
                        };
                        return ts.visitNode(node, visit);
                      },
                    ]);
                    const contents = ts
                      .createPrinter()
                      .printFile(transformed.transformed[0]);
                    transformed.dispose();
                    return {
                      contents,
                      loader: "tsx",
                      resolveDir: path.dirname(args.path),
                    };
                  });
                  build.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
                    path:
                      args.path === "react/jsx-runtime" &&
                      args.importer.startsWith(tmp)
                        ? "../source-jsx.js"
                        : args.path,
                    external: true,
                  }));
                  build.onResolve({ filter: /^\.\/source-jsx\.js$/ }, (args) =>
                    args.importer.endsWith("source-motion.tsx")
                      ? { path: "../source-jsx.js", external: true }
                      : undefined,
                  );
                  build.onResolve(
                    { filter: /^@\/components\/ui\// },
                    (args) => {
                      const name = args.path.split("/").at(-1),
                        p = path.join(
                          tmp,
                          "src/components/watermelon-ui",
                          `${name}.tsx`,
                        );
                      return fs.existsSync(p) ? { path: p } : undefined;
                    },
                  );
                },
              },
            ],
            logLevel: "silent",
            legalComments: "eof",
          };
          await esbuild.build(options);
          compilerOptions = options;
          modules.push({
            id: item.id,
            alias,
            path: modulePath,
            entry: path.join(tmp, entry.path),
            member: hasDefault ? "default" : member,
            cssSource: entry.content,
          });
          status = "renderable";
          reason =
            "원본 컴포넌트: " +
            (/text-center/.test(entry.content)
              ? "중앙 정렬 · "
              : "측면 정렬 · ") +
            (/bg-\[#(?:0|1)/.test(entry.content) ||
            /text-white/.test(entry.content)
              ? "어두운 지면 · "
              : "밝은 지면 · ") +
            (/backgroundImage/.test(entry.content)
              ? "입력 이미지 배경"
              : "타이포그래피/기하 장식") + ". 제목 CSS: "+headingClasses.slice(0,180)+". 원본 색: "+[...new Set(entry.content.match(/#[0-9a-fA-F]{6}\b/g)||[])].slice(0,3).join(",");
        } catch (e) {
          runtime = null;
          reason =
            "실행 의존성 확인 필요: " +
            (e.errors?.map((x) => x.text).join("; ") || e.message).slice(
              0,
              240,
            );
        }
      }
    }
  }
  metadata.push({
    id: item.id,
    name: item.displayName || item.sourceItemId,
    source: item.sourceSite,
    sourceItemId: item.sourceItemId,
    kind: item.artifactKind,
    roles: item.roles || [],
    categories: item.categories || [],
    sourceUrl: detail.sourceUrl || item.canonicalUrl || item.sourceUrl || null,
    rights: item.rightsStatus,
    status,
    reason,
    materials,
    runtime,
  });
}
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out))
  if (f.endsWith(".mjs")) fs.unlinkSync(path.join(out, f));
await esbuild.build({
  ...compilerOptions,
  stdin: {
    contents:
      modules
        .map(
          (m) =>
            `import {${m.member} as ${m.alias}} from ${JSON.stringify(m.entry)};`,
        )
        .join("\n") +
      "\nexport const components={" +
      modules.map((m) => `${JSON.stringify(m.id)}:${m.alias}`).join(",") +
      "};",
    loader: "tsx",
    resolveDir: tmp,
  },
  outfile: path.join(out, "components.mjs"),
});
// 모든 컴포넌트의 클래스만 모아 CSS를 생성합니다. 다른 미리보기 스타일은 포함하지 않습니다.
const scan = path.join(tmp, "classes.txt");
fs.writeFileSync(scan, modules.map((m) => m.cssSource).join("\n"));
const cssInput = path.join(
  root,
  "scripts/library/renderer/.collected-input.css",
);
fs.writeFileSync(
  cssInput,
  `@import "tailwindcss" source(none);\n@source ${JSON.stringify(scan)};\n@theme inline {--color-background:var(--sp-bg);--color-foreground:var(--sp-ink);--color-card:var(--sp-panel);--color-card-foreground:var(--sp-ink);--color-border:var(--sp-line);--color-muted-foreground:var(--sp-muted);--color-primary:var(--sp-accent);--color-primary-foreground:var(--sp-bg);--radius-lg:12px;--radius-md:8px;--radius-sm:4px;}\n`,
);
const cssPath = path.join(tmp, "compiled.css");
const built = spawnSync(
  process.execPath,
  [
    path.join(
      root,
      "scripts/library/renderer/node_modules/@tailwindcss/cli/dist/index.mjs",
    ),
    "-i",
    cssInput,
    "-o",
    cssPath,
    "--minify",
  ],
  { encoding: "utf8" },
);
fs.unlinkSync(cssInput);
if (built.status !== 0) throw new Error(built.stderr);
// Tailwind 기본 리셋은 호스트 문서에 영향을 주지 않도록 제외합니다.
let css = fs.readFileSync(cssPath, "utf8");
const start = css.indexOf("@layer base{");
if (start >= 0) {
  let level = 1,
    end = start + "@layer base{".length;
  while (level && end < css.length) {
    if (css[end] === "{") level++;
    if (css[end] === "}") level--;
    end++;
  }
  css = css.slice(0, start) + css.slice(end);
}
fs.writeFileSync(
  path.join(out, "styles.mjs"),
  `export const sourceCss=${JSON.stringify("/*\n" + fs.readFileSync(path.join(out, "LICENSE.watermelon.txt"), "utf8") + "\n" + fs.readFileSync(path.join(root, "docs/library/materials/componentry/LICENSE.txt"), "utf8") + "\n*/\n" + css)};\n`,
);
const snapshot = {
  version: 1,
  inventoryHash: sha(JSON.stringify(metadata)),
  total: metadata.length,
  items: metadata,
};
fs.writeFileSync(
  path.join(out, "inventory.json"),
  JSON.stringify(snapshot) + "\n",
);
fs.writeFileSync(
  path.join(root, "docs/library/generation-index.json"),
  JSON.stringify({
    version: 1,
    inventoryHash: snapshot.inventoryHash,
    total: snapshot.total,
    counts: metadata.reduce(
      (a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a),
      {},
    ),
    items: metadata.map(({ id, status, reason, runtime }) => ({
      id,
      status,
      reason,
      slot: runtime?.slot || null,
    })),
  }) + "\n",
);
fs.writeFileSync(
  path.join(out, "summary.json"),
  JSON.stringify({
    inventoryHash: snapshot.inventoryHash,
    total: snapshot.total,
    counts: metadata.reduce(
      (a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a),
      {},
    ),
  }) + "\n",
);
fs.copyFileSync(
  path.join(root, "docs/library/materials/componentry/LICENSE.txt"),
  path.join(out, "LICENSE.componentry.txt"),
);
fs.rmSync(tmp, { recursive: true });
console.log(
  JSON.stringify({
    total: snapshot.total,
    renderable: modules.length,
    cssBytes: css.length,
    slots: metadata
      .filter((x) => x.runtime)
      .reduce(
        (a, x) => ((a[x.runtime.slot] = (a[x.runtime.slot] || 0) + 1), a),
        {},
      ),
  }),
);
