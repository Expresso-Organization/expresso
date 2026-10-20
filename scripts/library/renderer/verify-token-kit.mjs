// 토큰 키트로 다시 그린 가상 프로필 지면을 브라우저에서 검사하고 비교 페이지를 만듭니다.
// 사용: node scripts/library/renderer/verify-token-kit.mjs <실행 ID>
// 실행 폴더 구조: runs/<실행 ID>/<디자인 코드>/<프로필>/index.html
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { validateStructuredPortfolio } from "../../../packages/contracts/dist/structured-portfolio.js";

const root = process.cwd(),
  runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error("실행 ID가 필요합니다.");
const folder = path.join(root, "docs/library/previews/portfolio/runs", runId);
const designs = fs
  .readdirSync(folder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const slugs = ["robotics-engineer", "editorial-designer", "climate-analyst"];
const WIDTHS = [390, 926, 1440];
// 웹폰트를 불러오지 않는 시스템 서체입니다. 이 서체는 적재 여부를 검사하지 않습니다.
const SYSTEM_FAMILIES = new Set(["system-ui", "-apple-system", "ui-monospace", "monospace", "sans-serif", "serif", "georgia", "helvetica", "arial"]);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) => String(value).replace(/[^\p{L}\p{N}@]/gu, "").toLowerCase();

/** 페이지 안에서 도는 검사입니다. 결과만 직렬화해 돌려받습니다. */
function inspect() {
  const firstFamily = (value) => value.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (color) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const luminance = (p) =>
    p.slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  // 글자 뒤의 실제 바탕색: 불투명한 배경을 가진 가장 가까운 조상입니다. 배경 이미지가 있으면 판단하지 않습니다.
  const backdrop = (node) => {
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.backgroundImage !== "none") return null;
      const color = rgba(style.backgroundColor);
      if (color[3] >= 250) return color;
    }
    return rgba(getComputedStyle(document.body).backgroundColor);
  };
  const textNodes = [];
  const walker = document.createTreeWalker(document.querySelector(".xp-page"), NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (node.textContent.trim() && node.parentElement.getClientRects().length) textNodes.push(node);
  const contrast = [];
  for (const parent of new Set(textNodes.map((node) => node.parentElement))) {
    if (parent.closest("figure,svg,summary ~ *")) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const bg = backdrop(parent);
    if (!bg) continue;
    const fg = rgba(style.color);
    const a = luminance(fg), b = luminance(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
    const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < min) contrast.push({ text: parent.textContent.trim().slice(0, 40), ratio: Number(ratio.toFixed(2)), min });
  }
  // 한 글자만 다음 줄로 넘어간 줄바꿈입니다. 글자마다 줄 위치를 재서 마지막 줄의 글자 수를 셉니다.
  const orphans = [];
  for (const element of document.querySelectorAll(".xp-page :is(h1,h2,h3,.xp-headline,.xp-lead,p,strong,dt,dd,li>a,summary>strong)")) {
    const text = element.textContent.trim();
    if ([...text].length < 4 || element.querySelector("p,div,li,ul,ol")) continue;
    const lines = new Map();
    const tw = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      for (let i = 0; i < node.length; i++) {
        if (!node.textContent[i].trim()) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        const top = Math.round(rect.top);
        const key = [...lines.keys()].find((value) => Math.abs(value - top) < rect.height / 2) ?? top;
        lines.set(key, (lines.get(key) || 0) + 1);
      }
    }
    const counts = [...lines.entries()].sort((x, y) => x[0] - y[0]).map(([, count]) => count);
    if (counts.length > 1 && counts.at(-1) === 1) orphans.push(text.slice(0, 40));
  }
  // 열 이탈: 지면 안쪽 폭을 넘어 그려진 요소입니다.
  const inner = document.querySelector(".xp-inner").getBoundingClientRect();
  const escaped = [...document.querySelectorAll(".xp-inner *")]
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width && (rect.right > inner.right + 1 || rect.left < inner.left - 1) && !node.closest("[hidden],details:not([open]) > :not(summary)");
    })
    .map((node) => node.className || node.tagName)
    .slice(0, 5);
  const h1 = document.querySelector("h1"), bodyText = document.querySelector(".xp-body p, .xp-lead");
  const loaded = [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replace(/^["']|["']$/g, ""));
  return {
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    brokenImages: [...document.images].filter((image) => !image.naturalWidth).length,
    missingAnchors: [...document.querySelectorAll('a[href^="#"]')].filter((link) => !document.getElementById(link.hash.slice(1))).map((link) => link.hash),
    h1: document.querySelectorAll("h1").length,
    nameSize: parseFloat(getComputedStyle(h1).fontSize),
    headlineSize: parseFloat(getComputedStyle(document.querySelector(".xp-headline")).fontSize),
    introMotion: getComputedStyle(document.querySelector("#intro")).animationName,
    hiddenCases: [...document.querySelectorAll("[data-case-type]")].filter((node) => Number(getComputedStyle(node).opacity) < 1).length,
    caseNumbers: [...document.querySelectorAll(".xp-case .xp-head .xp-num")].map((node) => node.textContent),
    displayFamily: firstFamily(getComputedStyle(h1).fontFamily),
    bodyFamily: firstFamily(getComputedStyle(bodyText).fontFamily),
    loadedFamilies: [...new Set(loaded)],
    contrast,
    orphans,
    escaped,
  };
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const report = [];
try {
  for (const design of designs) {
    for (const slug of slugs) {
      const dir = path.join(folder, design, slug);
      if (!fs.existsSync(path.join(dir, "run.json"))) continue;
      const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
      const { content, spec } = validateStructuredPortfolio(run.structured.spec, run.structured.content);
      assert.equal(run.fictional, true);
      // 재렌더 기록은 kitRerender에, 모델 생성 기록은 design에 디자인 코드가 있습니다.
      assert.equal(run.kitRerender?.designCode ?? run.design?.code, design);
      assert.equal(sha(fs.readFileSync(path.join(dir, "index.html"))), run.htmlSha256);
      assert.ok(Object.values(spec.elements).every((node) => !("sourceId" in node.props)), `${design}/${slug}: 수집 원본이 남아 있음`);
      const url = pathToFileURL(path.join(dir, "index.html")).href;
      const screens = [];
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(url);
        await page.evaluate(async () => {
          for (const image of document.images) {
            image.loading = "eager";
            await image.decode().catch(() => {});
          }
          await document.fonts.ready;
        });
        const checks = await page.evaluate(inspect);
        const where = `${design}/${slug}/${width}`;
        assert.deepEqual(errors, [], where);
        assert.equal(checks.overflow, false, `${where}: 가로 넘침`);
        assert.equal(checks.brokenImages, 0, `${where}: 깨진 이미지`);
        assert.deepEqual(checks.missingAnchors, [], `${where}: 대상 없는 링크`);
        assert.equal(checks.h1, 1, `${where}: h1 개수`);
        assert.ok(checks.nameSize > checks.headlineSize, `${where}: 이름이 가장 크지 않음`);
        assert.equal(checks.introMotion, "none", `${where}: 모션 줄이기 무시`);
        assert.equal(checks.hiddenCases, 0, `${where}: 보이지 않는 사례`);
        assert.deepEqual(checks.caseNumbers, checks.caseNumbers.map((_, index) => String(index + 1).padStart(2, "0")), `${where}: 사례 번호`);
        assert.deepEqual(checks.contrast, [], `${where}: 글자 대비`);
        assert.deepEqual(checks.orphans, [], `${where}: 한 글자 줄바꿈`);
        assert.deepEqual(checks.escaped, [], `${where}: 열 이탈`);
        for (const family of [checks.displayFamily, checks.bodyFamily])
          assert.ok(SYSTEM_FAMILIES.has(family.toLowerCase()) || checks.loadedFamilies.includes(family), `${where}: 서체 미적용 ${family}`);
        const text = normalize(await page.locator(".xp-page").textContent());
        const values = [
          ...Object.values(content.profile).flat(),
          ...content.sections.flatMap((section) => [section.title, section.summary, section.body, ...section.details.flatMap((item) => [item.label, item.text])]),
          ...content.career.flatMap((item) => [item.period, item.organization, item.role, item.description]),
          ...content.evidence.flatMap((item) => [item.title, item.kind, item.summary, item.body]),
        ].filter((value) => String(value).trim());
        for (const value of values) assert.ok(text.includes(normalize(value)), `${where}: 본문 누락 ${value}`);
        if (width !== 926) {
          await page.screenshot({ path: path.join(folder, design, `${slug}-${width}.png`), fullPage: true });
          await page.screenshot({ path: path.join(folder, design, `${slug}-${width}-first.png`) });
        }
        screens.push({ width, ...checks, preservedFields: values.length });
        await page.close();
      }
      // JavaScript 없이도 모든 사례가 보여야 합니다.
      const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 1000 } });
      const page = await noJs.newPage();
      await page.goto(url);
      assert.equal(await page.locator("[data-case-type]").count(), content.sections.length);
      await noJs.close();
      report.push({
        design,
        slug,
        name: content.profile.name,
        role: content.profile.role,
        introVariant: run.kitRerender?.introVariant ?? spec.elements.intro?.props.variant ?? null,
        groups: Object.values(spec.elements).filter((node) => ["Columns", "Grid", "Band"].includes(node.type)).length,
        specOrigin: run.specOrigin ?? "rerender",
        layout: spec.elements[spec.root].children.map((key) => spec.elements[key].type).join(" · "),
        htmlSha256: run.htmlSha256,
        screens,
        noJavaScript: true,
      });
      console.log(design, slug, "passed");
    }
  }
  fs.writeFileSync(
    path.join(folder, "verification.json"),
    JSON.stringify({ fictional: true, rerenderOf: JSON.parse(fs.readFileSync(path.join(folder, report[0].design, report[0].slug, "run.json"), "utf8")).rerenderOf, runs: report }, null, 2) + "\n",
  );
  const rows = designs
    .map(
      (design) =>
        `<section><h2>${design}</h2><ul>${report
          .filter((item) => item.design === design)
          .map(
            (item) =>
              `<li><a href="./${design}/${item.slug}/index.html"><img src="./${design}/${item.slug}-1440-first.png" alt="${item.name} ${design} 첫 화면" loading="lazy"></a><p><strong>${item.name}</strong> · ${item.role} · 첫 화면 ${item.introVariant} · 컨테이너 ${item.groups}개</p><p><a href="./${design}/${item.slug}-1440.png">1440 전체</a> · <a href="./${design}/${item.slug}-390.png">390 전체</a> · <a href="./${design}/${item.slug}/index.html">페이지 열기</a></p></li>`,
          )
          .join("")}</ul></section>`,
    )
    .join("");
  // 재렌더 실행은 원본 실행을, 모델 생성 실행은 모델이 구성을 골랐다는 사실을 적습니다.
  const rerenderOf = JSON.parse(fs.readFileSync(path.join(folder, report[0].design, report[0].slug, "run.json"), "utf8")).rerenderOf;
  const title = rerenderOf ? "토큰 키트 재렌더 비교" : "디자인별 모델 생성 비교";
  const intro = rerenderOf
    ? `모델을 다시 부르지 않고 <a href="../${rerenderOf.runId}/index.html">저장된 모델 Spec</a>에서 수집 원본 선택을 지우고 디자인 시스템 토큰 키트로 다시 그렸습니다. 첫 화면 구도는 재렌더 스크립트가 프로필마다 하나씩 배정했습니다.`
    : "같은 가상 프로필 내용으로 디자인마다 모델이 Spec을 새로 골랐습니다. 첫 화면 구도, 사례 유형, 컨테이너 배치는 모두 모델의 선택입니다.";
  fs.writeFileSync(
    path.join(folder, "index.html"),
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · Expresso</title><style>body{margin:0;font-family:system-ui,sans-serif;color:#17202a;background:#f7f8fa}main{max-width:1280px;margin:auto;padding:32px 20px}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;padding:0;list-style:none}img{width:100%;height:auto;border:1px solid #d6dde6;border-radius:8px}p{margin:8px 0;font-size:14px;line-height:1.6}a{color:#1d4ed8}</style></head><body><main><h1>${title}</h1><p>${intro} 인물·프로젝트·이미지는 가상 시험 자료입니다. <a href="./verification.json">브라우저 검증 기록</a></p>${rows}</main></body></html>`,
  );
} finally {
  await browser.close();
}
