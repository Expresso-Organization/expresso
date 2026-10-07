import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { validateStructuredPortfolio } from "../../../packages/contracts/dist/structured-portfolio.js";

const root = process.cwd(),
  runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9-]+$/.test(runId))
  throw new Error("실행 ID가 필요합니다.");
const folder = path.join(root, "docs/library/previews/portfolio/runs", runId);
const base = process.env.PORTFOLIO_PREVIEW_BASE || "http://127.0.0.1:8942";
const slugs = process.env.PORTFOLIO_PROFILE
  ? [process.env.PORTFOLIO_PROFILE]
  : ["robotics-engineer", "editorial-designer", "climate-analyst"];
const normalize = (value) =>
  String(value)
    .replace(/[^\p{L}\p{N}@]/gu, "")
    .toLowerCase();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const report = [];
try {
  for (const slug of slugs) {
    const run = JSON.parse(
        fs.readFileSync(path.join(folder, slug, "run.json")),
      ),
      { content, spec } = validateStructuredPortfolio(
        run.structured.spec,
        run.structured.content,
      );
    assert.equal(run.fictional, true);
    assert.equal(run.specOrigin, "model");
    assert.equal(
      sha(fs.readFileSync(path.join(folder, slug, "index.html"))),
      run.htmlSha256,
    );
    const record = JSON.parse(
      fs.readFileSync(path.join(folder, slug, "model-record.json")),
    );
    assert.deepEqual(JSON.parse(record.at(-1).raw), spec);
    const design = spec.elements[spec.root].props.design,
      screens = [];
    for (const width of [390, 926, 1440]) {
      const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: "reduce",
        }),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        `${base}/library/previews/portfolio/runs/${runId}/${slug}/index.html`,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (const image of document.images) {
          image.loading = "eager";
          await image.decode().catch(() => {});
        }
      });
      const checks = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        brokenImages: [...document.images].filter(
          (image) => !image.naturalWidth,
        ).length,
        missingAnchors: [...document.querySelectorAll('a[href^="#"]')]
          .filter((link) => !document.getElementById(link.hash.slice(1)))
          .map((link) => link.hash),
        h1: document.querySelectorAll("h1").length,
        nameSize: parseFloat(
          getComputedStyle(document.querySelector("h1")).fontSize,
        ),
        headlineSize: parseFloat(
          getComputedStyle(document.querySelector(".sp-definition")).fontSize,
        ),
        caseTypes: [...document.querySelectorAll("[data-case-type]")].map(
          (node) => node.dataset.caseType,
        ),
        motion: getComputedStyle(document.querySelector("#intro"))
          .animationName,
      }));
      assert.deepEqual(errors, []);
      assert.equal(checks.overflow, false, `${slug}/${width}: 가로 넘침`);
      assert.equal(checks.brokenImages, 0);
      assert.deepEqual(checks.missingAnchors, []);
      assert.equal(checks.h1, 1);
      assert.ok(checks.nameSize > checks.headlineSize);
      assert.equal(checks.motion, "none");
      const text = normalize(await page.locator(".sp-page").textContent());
      const values = [
        ...Object.values(content.profile).flat(),
        ...content.sections.flatMap((section) => [
          section.title,
          section.summary,
          section.body,
          ...section.details.flatMap((item) => [item.label, item.text]),
        ]),
        ...content.career.flatMap((item) => [
          item.period,
          item.organization,
          item.role,
          item.description,
        ]),
        ...content.evidence.flatMap((item) => [
          item.title,
          item.kind,
          item.summary,
          item.body,
        ]),
      ];
      for (const value of values)
        assert.ok(
          text.includes(normalize(value)),
          `${slug}/${width}: 본문 누락 ${value}`,
        );
      if (width === 1440) {
        await page.screenshot({ path: path.join(folder, `${slug}-intro.png`) });
        await page
          .locator("[data-case-type]")
          .first()
          .screenshot({ path: path.join(folder, `${slug}-case.png`) });
      }
      screens.push({ width, ...checks, preservedFields: values.length });
      await page.close();
    }
    const noJs = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 390, height: 1000 },
      }),
      page = await noJs.newPage();
    await page.goto(
      `${base}/library/previews/portfolio/runs/${runId}/${slug}/index.html`,
    );
    assert.equal(
      await page.locator("[data-case-type]").count(),
      content.sections.length,
    );
    await noJs.close();
    report.push({
      slug,
      name: content.profile.name,
      role: content.profile.role,
      design,
      library: run.library || null,
      sourceComposition: spec.elements[spec.root].children.map(
        (key) =>
          spec.elements[key].props.sourceId ||
          spec.elements[key].props.variant ||
          spec.elements[key].type,
      ),
      htmlSha256: run.htmlSha256,
      screens,
      noJavaScript: true,
    });
    console.log(slug, "passed", design);
  }
  if (slugs.length === 3)
    assert.equal(
      new Set(
        report.map((item) =>
          item.library
            ? JSON.stringify(item.sourceComposition)
            : item.design.layout,
        ),
      ).size,
      3,
      "세 입력의 원본 컴포넌트 조합이 수렴했습니다.",
    );
  fs.writeFileSync(
    path.join(folder, "verification.json"),
    JSON.stringify(
      {
        fictional: true,
        model: JSON.parse(
          fs.readFileSync(path.join(folder, slugs[0], "run.json")),
        ).model,
        runs: report,
        distinctIntroSources: new Set(
          report.map((item) => item.sourceComposition[0]),
        ).size,
        distinctSourceCompositions: new Set(
          report.map((item) => JSON.stringify(item.sourceComposition)),
        ).size,
      },
      null,
      2,
    ) + "\n",
  );
  const css = fs.readFileSync(
    path.join(
      root,
      "scripts/library/renderer/portfolio/v1/comparison-panel.css",
    ),
    "utf8",
  );
  const cards = report
    .map(
      (item) =>
        `<li><a href="./${item.slug}/index.html" target="_blank" rel="noopener"><article class="comparison-card" style="background:white;border:1px solid var(--line);border-radius:12px;padding:16px"><img style="height:auto" src="./${item.slug}-intro.png" alt="${item.name} 첫 화면"><h2>${item.name}</h2><p>${item.role} · ${item.design.layout}</p><p>전체 페이지 열기 ↗</p></article></a></li>`,
    )
    .join("");
  const cases = report
    .map(
      (item) =>
        `<li><a href="./${item.slug}/index.html" target="_blank" rel="noopener"><img style="width:100%;height:auto;border:1px solid var(--line)" src="./${item.slug}-case.png" alt="${item.name} 사례 지면"><p>${item.name} 사례 지면 ↗</p></a></li>`,
    )
    .join("");
  const title =
    slugs.length === 3
      ? "세 가상 프로필 생성 비교"
      : "원본 자료부터 생성한 포트폴리오";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · Expresso</title><style>body{margin:0}*{box-sizing:border-box}${css}.portfolio-comparison h1{font-size:32px;margin:0;padding-top:32px}.comparison-content h2{font-size:20px}.comparison-content p{line-height:1.7}.comparison-card img{object-fit:contain}.comparison-grid{display:grid;margin-bottom:48px;grid-template-columns:repeat(3,minmax(0,1fr));overflow:visible}.comparison-grid a{color:inherit}.comparison-content>p a{color:var(--accent)}@media(max-width:800px){.comparison-grid{grid-template-columns:1fr}.comparison-card{min-width:0}}</style></head><body><main class="portfolio-comparison"><div class="comparison-content"><h1>${title}</h1><p>같은 생성기와 요청으로 모델이 선택한 지면입니다. 인물·프로젝트·이미지는 가상 시험 자료이며, 이미지는 입력 준비 단계에서 만들었습니다.</p><ul class="comparison-grid">${cards}</ul><h2>프로젝트 사례 지면</h2><ul class="comparison-grid">${cases}</ul><p><a href="./verification.json">브라우저 검증 기록 ↗</a> · ${report.map((item) => `<a href="./${item.slug}/run.json">${item.name} Spec ↗</a>`).join(" · ")}</p></div></main></body></html>`;
  fs.writeFileSync(path.join(folder, "index.html"), html);
} finally {
  await browser.close();
}
