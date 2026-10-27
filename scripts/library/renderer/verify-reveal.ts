// 저장된 지면을 지금 키트로 다시 그려 스크롤 등장(data-reveal)을 브라우저에서 잽니다.
// 사용: pnpm --filter @expresso/backend exec tsx ../../scripts/library/renderer/verify-reveal.ts --page <generated_pages _id> [--browser chromium|webkit] [--frame] [--reduced-motion] [--no-supports] [--stage] [--editor] [--shots <폴더>]
// --frame은 공개 사이트(`/site/[slug]`)처럼 문서를 `sandbox="allow-popups"` iframe의 `srcdoc`으로 싣고 그 안에서 스크롤합니다.
// 접속 설정은 services/backend/.env의 MONGODB_URL · MONGODB_DATABASE를 읽습니다. 값은 출력하지 않습니다.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { PageStyleGrammarSchema, pageDocument, type PageStyleGrammar } from "../../../packages/contracts/dist/index.js";
import { RENDER_MEASURE_WIDTHS, renderStructuredPortfolio } from "../../../packages/portfolio-renderer/dist/index.js";
import { findPortfolioDesign } from "../../../services/backend/src/modules/design-systems/generation-style.js";

// playwright · mongodb 의존성은 백엔드가 가집니다.
const backend = createRequire(new URL("../../../services/backend/package.json", import.meta.url));
const playwright = backend("playwright") as typeof import("playwright");
const { MongoClient } = backend("mongodb") as typeof import("mongodb");

const { values: args } = parseArgs({
  options: {
    page: { type: "string" },
    browser: { type: "string", default: "chromium" },
    "reduced-motion": { type: "boolean", default: false },
    "no-supports": { type: "boolean", default: false },
    frame: { type: "boolean", default: false },
    stage: { type: "boolean", default: false },
    editor: { type: "boolean", default: false },
    shots: { type: "string" },
  },
});
if (!args.page) throw new Error("--page <generated_pages _id>가 필요합니다.");
const engine = args.browser as "chromium" | "webkit" | "firefox";
if (!["chromium", "webkit", "firefox"].includes(engine)) throw new Error(`브라우저 이름이 아닙니다: ${engine}`);

const isPageStyleGrammar = (value: unknown): value is PageStyleGrammar => PageStyleGrammarSchema.safeParse(value).success;

const envFile = new URL("../../../services/backend/.env", import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const client = await MongoClient.connect(env.MONGODB_URL!);
let document_: string;
try {
  const db = client.db(env.MONGODB_DATABASE);
  const row = await db.collection<{ _id: string; portfolioId: string; styleSpecSnapshot: unknown; generationManifest?: { structured?: { spec: unknown; content: unknown } } }>("generated_pages").findOne({ _id: args.page });
  if (!row?.generationManifest?.structured) throw new Error("구조화 지면이 아닙니다.");
  const portfolio = await db.collection<{ _id: string; title: string }>("portfolios").findOne({ _id: row.portfolioId });
  if (!portfolio) throw new Error("포트폴리오가 없습니다.");
  // 편집 저장(`PageService.editComposition`)과 같은 디자인 · 색으로 다시 그립니다.
  const rendered = renderStructuredPortfolio(row.generationManifest.structured.spec, row.generationManifest.structured.content, {
    design: findPortfolioDesign(portfolio),
    theme: isPageStyleGrammar(row.styleSpecSnapshot) ? row.styleSpecSnapshot : undefined,
  });
  // --editor는 편집 화면 가운데 지면(`PagePreview reveal={false}`)과 같은 문서입니다.
  document_ = pageDocument({ html: rendered.html, css: rendered.css, title: portfolio.title, ...(isPageStyleGrammar(row.styleSpecSnapshot) ? { grammar: row.styleSpecSnapshot } : {}), ...(args.editor ? { reveal: false } : {}) });
} finally {
  await client.close();
}
// 미지원 브라우저 재현: 지원 조건을 어떤 브라우저도 만족하지 않는 값으로 바꿉니다.
if (args["no-supports"]) document_ = document_.replaceAll("@supports (animation-timeline:view())", "@supports (animation-timeline:xp-unsupported())");

/** 너비마다 쓰는 화면 높이입니다. 폰 세로 · 태블릿 가로 · 데스크톱입니다. */
const HEIGHTS: Record<number, number> = { 390: 844, 926: 428, 1440: 900 };

/** 페이지 안에서 등장 단위를 모아 현재 상태를 돌려줍니다. 단위 판정은 `kit-styles.ts`의 `revealUnits`와 같습니다. */
function snapshot() {
  const units: Element[] = [];
  for (const block of document.querySelectorAll(".xp-block")) {
    // 루트의 끄기 속성은 문서 전체를 재는 조건이므로 단위에서 빼지 않습니다.
    const excluded = block.closest('[data-reveal="none"]');
    if (excluded && excluded !== document.documentElement) continue;
    for (const child of block.children) {
      if (child.matches('ul,ol,[data-reveal="stagger"]')) units.push(...[...child.children].filter((item) => !item.matches('[data-reveal="none"]')));
      else if (!child.matches("[data-reveal]")) units.push(child);
    }
  }
  const page = document.querySelector(".xp-page")!;
  const step = parseFloat(getComputedStyle(page).getPropertyValue("--component-gap")) || 0;
  return {
    step,
    height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    units: units.map((unit) => {
      const rect = unit.getBoundingClientRect(), style = getComputedStyle(unit);
      return {
        name: `${unit.closest("[id]")?.id ?? unit.closest(".xp-block")!.className.split(" ").at(-1)} > ${unit.tagName.toLowerCase()}.${unit.className.split(" ")[0] ?? ""}`,
        grouped: Boolean(unit.closest(".xp-group")),
        top: rect.top,
        bottom: rect.bottom,
        opacity: Number(style.opacity),
        animation: style.animationName,
      };
    }),
  };
}

const browser = await playwright[engine].launch({ headless: true });
const failures: string[] = [];
try {
  console.log(`${engine} ${browser.version()}${args.frame ? " · 공개 사이트 iframe" : ""} · 움직임 줄이기 ${args["reduced-motion"] ? "켬" : "끔"} · 지원 조건 ${args["no-supports"] ? "막음" : "그대로"}${args.stage ? " · 청사진 단계" : ""}${args.editor ? " · 편집 화면" : ""}`);
  for (const width of RENDER_MEASURE_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHTS[width]! }, reducedMotion: args["reduced-motion"] ? "reduce" : "no-preference" });
    const page = await context.newPage();
    let target: import("playwright").Page | import("playwright").Frame = page;
    if (args.frame) {
      // 공개 사이트 페이지(`services/web/src/app/site/[slug]`)의 iframe과 같은 속성 · 크기입니다.
      await page.setContent(`<!doctype html><style>body{margin:0}iframe{display:block;width:100%;min-height:100dvh;border:0}</style><iframe title="site" sandbox="${args.editor ? "" : "allow-popups"}"></iframe>`);
      await page.evaluate((html) => { document.querySelector("iframe")!.srcdoc = html; }, document_);
      await page.waitForTimeout(300);
      target = page.frames().find((frame) => frame !== page.mainFrame())!;
      await target.waitForLoadState("load");
      await target.waitForSelector(".xp-page");
    } else {
      await page.setContent(document_, { waitUntil: "load" });
    }
    // 생성 화면(`LivePreview`)이 청사진 단계에서 거는 루트 속성입니다.
    if (args.stage) await target.evaluate(() => { document.documentElement.dataset.stage = "blueprint"; });
    await target.evaluate(() => document.fonts.ready);
    const first = await target.evaluate(snapshot);
    const off = args["reduced-motion"] || args["no-supports"] || args.stage || args.editor;
    const revealed = new Set<string>();
    if (off) {
      // 등장이 꺼진 문서는 스크롤 전에도 모든 단위가 불투명하고 애니메이션이 없어야 합니다.
      const hidden = first.units.filter((unit) => unit.opacity < 1 || unit.animation !== "none");
      if (hidden.length) failures.push(`${width}px: 스크롤 전 ${hidden.length}개 단위가 투명하거나 움직입니다 — ${hidden.slice(0, 3).map((unit) => unit.name).join(", ")}`);
      console.log(`${width}px 단위 ${first.units.length}개 · 스크롤 전 모두 불투명: ${hidden.length === 0}`);
    } else {
      const total = await target.evaluate(() => document.documentElement.scrollHeight);
      // 등장이 끝나는 선: 화면 아래 25vh와 차례 오프셋 3단계를 뺀 높이입니다(`REVEAL_ZONE` · `--xp-reveal-step`).
      const line = first.height * 0.75 - first.step * 3;
      for (let y = 0; y <= total; y += Math.round(first.height / 3)) {
        await target.evaluate((top) => scrollTo(0, top), y);
        // 스크롤 타임라인은 렌더링 갱신 때 진행합니다. 프레임 두 번이 지난 뒤에 읽어 이전 프레임 값을 읽지 않게 합니다.
        // 스크립트를 막은 sandbox iframe 안에서는 프레임 콜백이 돌지 않아 바깥 문서의 프레임을 기다립니다.
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const now = await target.evaluate(snapshot);
        if (now.overflow) failures.push(`${width}px y=${y}: 가로 넘침`);
        for (const unit of now.units) {
          if (unit.bottom < 0 || unit.top > now.height) continue;
          if (unit.opacity < 0.99) revealed.add(unit.name);
          if (unit.top <= line && unit.opacity < 0.99) failures.push(`${width}px y=${y}: ${unit.name}의 위쪽이 ${Math.round(unit.top)}px(선 ${Math.round(line)}px)인데 불투명도 ${unit.opacity.toFixed(2)}`);
        }
        if (args.shots && width === 1440 && now.units.some((unit) => unit.top < now.height && unit.bottom > 0 && unit.opacity > 0.05 && unit.opacity < 0.95)) {
          fs.mkdirSync(args.shots, { recursive: true });
          await page.screenshot({ path: path.join(args.shots, `${engine}-${width}-${y}.png`) });
        }
      }
      const animated = first.units.filter((unit) => unit.animation === "xp-rise");
      const grouped = first.units.filter((unit) => unit.grouped);
      if (grouped.length && !grouped.every((unit) => unit.animation === "xp-rise")) failures.push(`${width}px: 그룹 안 단위에 등장이 걸리지 않았습니다`);
      console.log(`${width}px 단위 ${first.units.length}개 · 등장 선언 ${animated.length}개 · 그룹 안 ${grouped.length}개 · 스크롤 중 나타나는 모습을 본 단위 ${revealed.size}개`);
      if (!revealed.size) failures.push(`${width}px: 나타나는 중인 단위를 한 번도 보지 못했습니다`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.slice(0, 20).join("\n"));
  process.exit(1);
}
console.log("통과");
