// 저장된 지면을 지금 키트로 다시 그려 스크롤 등장(data-reveal)을 브라우저에서 잽니다.
// 사용: pnpm --filter @expresso/backend exec tsx ../../scripts/library/renderer/verify-reveal.ts --page <generated_pages _id> [--browser chromium|webkit] [--reduced-motion] [--no-supports] [--shots <폴더>]
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
  document_ = pageDocument({ html: rendered.html, css: rendered.css, title: portfolio.title, ...(isPageStyleGrammar(row.styleSpecSnapshot) ? { grammar: row.styleSpecSnapshot } : {}) });
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
    if (block.closest('[data-reveal="none"]')) continue;
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
  console.log(`${engine} ${browser.version()} · 움직임 줄이기 ${args["reduced-motion"] ? "켬" : "끔"} · 지원 조건 ${args["no-supports"] ? "막음" : "그대로"}`);
  for (const width of RENDER_MEASURE_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHTS[width]! }, reducedMotion: args["reduced-motion"] ? "reduce" : "no-preference" });
    const page = await context.newPage();
    await page.setContent(document_, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const first = await page.evaluate(snapshot);
    const off = args["reduced-motion"] || args["no-supports"];
    const revealed = new Set<string>();
    if (off) {
      // 등장이 꺼진 문서는 스크롤 전에도 모든 단위가 불투명하고 애니메이션이 없어야 합니다.
      const hidden = first.units.filter((unit) => unit.opacity < 1 || unit.animation !== "none");
      if (hidden.length) failures.push(`${width}px: 스크롤 전 ${hidden.length}개 단위가 투명하거나 움직입니다 — ${hidden.slice(0, 3).map((unit) => unit.name).join(", ")}`);
      console.log(`${width}px 단위 ${first.units.length}개 · 스크롤 전 모두 불투명: ${hidden.length === 0}`);
    } else {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      // 등장이 끝나는 선: 화면 아래 25vh와 차례 오프셋 3단계를 뺀 높이입니다(`REVEAL_ZONE` · `--xp-reveal-step`).
      const line = first.height * 0.75 - first.step * 3;
      for (let y = 0; y <= total; y += Math.round(first.height / 3)) {
        await page.evaluate((top) => scrollTo(0, top), y);
        await page.waitForTimeout(60);
        const now = await page.evaluate(snapshot);
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
