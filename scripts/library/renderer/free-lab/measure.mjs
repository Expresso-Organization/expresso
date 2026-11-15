// 실험 지면을 브라우저에서 열어 스크린샷을 찍고 잽니다.
// 사용: node scripts/library/renderer/free-lab/measure.mjs <실행 ID>
//
// 자유 지면은 클래스 이름을 모델이 지으므로 키트 측정(`inspectRenderedPage`)을 쓸 수 없습니다. 어느 지면에나 통하는 것만 잽니다:
// 가로 넘침, 깨진 이미지, 보이지 않는 글, 이름 · 섹션 · 경력 · 근거의 유무, 그리고 첫 화면의 모양(가장 큰 글자 · 글자 수 · 바탕 밝기 · 서체).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
// playwright 의존성은 백엔드가 가집니다(`verify-token-kit.mjs`와 같은 방식).
const { chromium } = createRequire(new URL("../../../../services/backend/package.json", import.meta.url))("playwright");

const run = process.argv[2];
if (!run || !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error("실행 ID가 필요합니다.");
const root = path.join(process.cwd(), "docs/library/previews/portfolio/runs", run);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const WIDTHS = [1440, 390];

/** 페이지 안에서 돕니다. 바깥 변수를 참조하지 않습니다. */
async function settle() {
  for (const image of document.images) { image.loading = "eager"; await image.decode().catch(() => undefined); }
  await document.fonts.ready;
}

function inspect(expected) {
  const visible = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue.trim();
    const parent = node.parentElement;
    if (!value || !parent || ["STYLE", "SCRIPT", "TITLE"].includes(parent.tagName)) continue;
    // 접어 둔 `<details>`의 내용은 읽는 사람이 펼쳐 보는 글이라 가려진 글로 세지 않습니다.
    const closed = parent.closest("details:not([open])");
    if (closed && !parent.closest("summary")) continue;
    texts.push({ value, parent });
  }
  const opacityOf = (node) => { let value = 1; for (let at = node; at; at = at.parentElement) value *= Number(getComputedStyle(at).opacity); return value; };
  const fold = innerHeight;
  let firstMax = 0, firstChars = 0, hiddenChars = 0;
  const families = new Map();
  for (const { value, parent } of texts) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    const top = rect.top + scrollY;
    if (!visible(parent) || style.visibility === "hidden") { hiddenChars += value.length; continue; }
    if (opacityOf(parent) < 0.2) hiddenChars += value.length;
    if (top < fold) { firstChars += value.length; firstMax = Math.max(firstMax, parseFloat(style.fontSize)); }
    const family = style.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    families.set(family, (families.get(family) ?? 0) + value.length);
  }
  const luminance = (color) => {
    const match = color.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255, 1];
    const [r, g, b] = match.map((channel) => { const v = channel / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return { value: 0.2126 * r + 0.7152 * g + 0.0722 * b, alpha: match[3] ?? 1 };
  };
  // 첫 화면 한가운데의 바탕을 봅니다. 투명하면 조상으로 올라갑니다.
  let background = 1;
  for (let node = document.elementFromPoint(innerWidth / 2, Math.min(fold, document.documentElement.scrollHeight) / 3); node; node = node.parentElement) {
    const { value, alpha } = luminance(getComputedStyle(node).backgroundColor);
    if (alpha > 0.5) { background = value; break; }
  }
  const text = document.body.innerText.replace(/\s+/g, " ");
  const compact = text.replace(/\s+/g, "");
  const has = (value) => compact.includes(value.replace(/\s+/g, ""));
  return {
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
    images: document.images.length,
    svgs: document.querySelectorAll("svg").length,
    details: document.querySelectorAll("details").length,
    h1: document.querySelectorAll("h1").length,
    chars: compact.length,
    hiddenChars,
    firstMaxFont: Math.round(firstMax),
    firstChars,
    backgroundLuminance: Number(background.toFixed(3)),
    families: [...families.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([family]) => family),
    name: expected.name ? has(expected.name) : null,
    sections: expected.sections.filter(has).length,
    evidence: expected.evidence.filter(has).length,
    // 조직 이름은 본문에도 나오므로 경력이 따로 실렸는지는 제목으로 봅니다.
    careerHeading: [...document.querySelectorAll("h1,h2,h3,h4")].some((node) => /경력|이력|Career|Experience/i.test(node.textContent ?? "")),
    evidenceHeading: [...document.querySelectorAll("h1,h2,h3,h4")].some((node) => /근거|자료|Evidence|Reference/i.test(node.textContent ?? "")),
    notes: (text.match(/\[[^\]]{0,12}(보완|확인|TODO|필요)[^\]]{0,12}\]/g) ?? []).length,
  };
}

const cells = fs.readdirSync(path.join(root, "cells")).filter((label) => fs.existsSync(path.join(root, "cells", label, "result.json"))).sort();
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const report = [];
try {
  for (const label of cells) {
    const dir = path.join(root, "cells", label);
    const result = read(path.join(dir, "result.json"));
    const { context } = read(path.join(root, "inputs", `${result.input}.json`));
    // 조건마다 같은 기준으로 봅니다. 섹션은 설계의 섹션 제목을, 근거는 출처 자료의 제목을 씁니다.
    const expected = {
      name: context.author?.name ?? null,
      sections: context.sections.map((section) => section.title),
      evidence: context.evidence.map((item) => item.label),
    };
    const url = pathToFileURL(path.join(dir, "page.html")).href;
    fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
    const screens = {};
    for (const width of WIDTHS) {
      // 모션을 켠 채로 끝까지 내렸다 올라와서 잽니다. 스크롤로 등장하는 글이 끝내 보이지 않으면 `hiddenChars`에 잡힙니다.
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      await page.evaluate(settle);
      // 첫 화면은 불러오기 애니메이션이 끝난 뒤에 찍습니다. 되풀이하는 애니메이션은 기다리지 않습니다.
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, 6000)),
      ]));
      await page.waitForTimeout(300);
      if (width === 1440) await page.screenshot({ path: path.join(dir, "shots", "1440-first.jpg"), type: "jpeg", quality: 72 });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(60); }
      await page.waitForTimeout(400);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(300);
      screens[width] = { ...(await page.evaluate(inspect, expected)), errors };
      await page.close();
      // 전체 화면은 모션을 줄여 찍습니다. 한 장에 담으려면 스크롤 등장 애니메이션이 끝난 상태여야 합니다.
      const still = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await still.goto(url);
      await still.evaluate(settle);
      await still.waitForTimeout(300);
      await still.screenshot({ path: path.join(dir, "shots", `${width}-full.jpg`), type: "jpeg", quality: 60, fullPage: true });
      await still.close();
    }
    const measure = { label, expected: { name: expected.name, sections: expected.sections.length, evidence: expected.evidence.length }, screens };
    fs.writeFileSync(path.join(dir, "measure.json"), `${JSON.stringify(measure, null, 2)}\n`);
    report.push({ ...result, measure });
    const wide = screens[1440], narrow = screens[390];
    const overflow = [wide.overflow ? "1440" : "", narrow.overflow ? "390" : ""].filter(Boolean).join(" · ");
    console.log(label, overflow ? `넘침 ${overflow}` : "넘침 없음", `이름 ${wide.name}`, `섹션 ${wide.sections}/${expected.sections.length}`, `경력 제목 ${wide.careerHeading}`, `근거 ${wide.evidence}/${expected.evidence.length}`, `가려진 글 ${wide.hiddenChars}`, wide.notes ? `작업 메모 ${wide.notes}` : "");
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(root, "measure.json"), `${JSON.stringify(report, null, 2)}\n`);
