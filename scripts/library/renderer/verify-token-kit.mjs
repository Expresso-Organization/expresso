// 토큰 키트로 다시 그린 가상 프로필 지면을 브라우저에서 검사하고 비교 페이지를 만듭니다.
// 사용: node scripts/library/renderer/verify-token-kit.mjs <실행 ID>
// 실행 폴더 구조: runs/<실행 ID>/<디자인 코드>/<프로필>/index.html
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { validateStructuredPortfolio } from "../../../packages/contracts/dist/structured-portfolio.js";
// 브라우저는 생성 중 측정과 같은 판을 씁니다. playwright 의존성은 백엔드가 가집니다.
const { chromium } = createRequire(new URL("../../../services/backend/package.json", import.meta.url))("playwright");
// 측정과 판정은 생성 중 측정(워커)과 같은 코드입니다. 렌더러를 먼저 빌드해야 합니다.
import { RENDER_MEASURE_WIDTHS, inspectRenderedPage, renderDefects, renderedContentValues, settleRenderedPage } from "../../../packages/portfolio-renderer/dist/index.js";

const root = process.cwd(),
  runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error("실행 ID가 필요합니다.");
const folder = path.join(root, "docs/library/previews/portfolio/runs", runId);
const designs = fs
  .readdirSync(folder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const slugs = ["robotics-engineer", "editorial-designer", "climate-analyst"];
const sha = (value) => createHash("sha256").update(value).digest("hex");

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
      for (const width of RENDER_MEASURE_WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(url);
        await page.evaluate(settleRenderedPage);
        const { text: _text, ...checks } = await page.evaluate(inspectRenderedPage);
        const where = `${design}/${slug}/${width}`;
        assert.deepEqual(errors, [], where);
        // 넘침 · 줄바꿈 · 단 이탈 · 겹침 · 이미지 · 대비 · 서체 · 사례 번호 · 본문 누락은 생성 중 측정과 같은 판정으로 봅니다.
        assert.deepEqual(renderDefects([{ width, measurement: { ...checks, text: _text } }], content).map((defect) => `${defect.kind} ${defect.element ?? ""} ${defect.detail}`), [], `${where}: 측정 결함`);
        assert.equal(checks.h1, 1, `${where}: h1 개수`);
        if (checks.headlineSize !== null) assert.ok(checks.nameSize > checks.headlineSize, `${where}: 이름이 가장 크지 않음`);
        assert.equal(checks.introMotion, "none", `${where}: 모션 줄이기 무시`);
        assert.equal(checks.hiddenCases, 0, `${where}: 보이지 않는 사례`);
        if (width !== 926) {
          await page.screenshot({ path: path.join(folder, design, `${slug}-${width}.png`), fullPage: true });
          await page.screenshot({ path: path.join(folder, design, `${slug}-${width}-first.png`) });
        }
        screens.push({ width, ...checks, preservedFields: renderedContentValues(content).length });
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
