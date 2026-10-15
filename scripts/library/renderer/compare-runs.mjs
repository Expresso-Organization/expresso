// 두 실행의 같은 프로필을 지면 단위로 캡처해 변경 전후 비교 페이지를 만듭니다.
// 사용: node scripts/library/renderer/compare-runs.mjs <이전 실행 ID> <새 실행 ID>
// 새 실행 폴더의 notes.json({"<프로필>/<지면 ID>": "설명"})이 있으면 각 지면에 설명을 붙입니다.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd(),
  [beforeId, afterId] = process.argv.slice(2);
for (const id of [beforeId, afterId])
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id))
    throw new Error("이전 실행 ID와 새 실행 ID가 필요합니다.");
const runs = path.join(root, "docs/library/previews/portfolio/runs");
const out = path.join(runs, afterId),
  shots = path.join(out, "compare");
const slugs = fs
  .readdirSync(out)
  .filter((name) => fs.existsSync(path.join(out, name, "run.json")))
  .filter((name) => fs.existsSync(path.join(runs, beforeId, name, "index.html")));
if (!slugs.length) throw new Error("두 실행에 공통 프로필이 없습니다.");
const notesPath = path.join(out, "notes.json");
const notes = fs.existsSync(notesPath)
  ? JSON.parse(fs.readFileSync(notesPath, "utf8"))
  : {};
const escape = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );

// 지면별 측정값입니다. verify-structured-profiles.mjs의 검사와 같은 기준을 씁니다.
const measure = () => {
  const residue = (scope) =>
    [...scope.querySelectorAll("[data-source-slot=section] *")].filter((node) => {
      if (node.closest("svg,[data-source-decoration]") || node.matches("img,svg"))
        return false;
      if (node.textContent.trim() || node.querySelector("img,svg")) return false;
      const box = node.getBoundingClientRect(),
        style = getComputedStyle(node);
      return (
        box.width > 2 &&
        box.height > 2 &&
        (style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
          style.backgroundImage !== "none" ||
          parseFloat(style.borderTopWidth) > 0)
      );
    }).length;
  const source = (scope) => {
    const block = scope.querySelector("[data-library-source]");
    if (!block) return null;
    const box = block.getBoundingClientRect();
    return `${Math.round(box.width)}×${Math.round(box.height)}px`;
  };
  const intro = document.querySelector("#intro");
  const plate = intro.querySelector(".sp-source-nameplate");
  return {
    intro: {
      "이름 판 블러": plate ? getComputedStyle(plate).backdropFilter : "없음",
      // 원본 색 클래스가 없어 브라우저 기본 링크색(rgb(0, 0, 238))으로 그려진 링크입니다.
      "기본 링크색 링크": (() => {
        const links = [
          ...intro.querySelectorAll("[data-library-source] a"),
        ].filter((link) => getComputedStyle(link).color === "rgb(0, 0, 238)");
        return links.length
          ? `${links.length}개 · ${links.map((link) => link.textContent.trim()).join(" · ")}`
          : "0개";
      })(),
    },
    cases: Object.fromEntries(
      [...document.querySelectorAll("[data-case-type]")].map((article) => {
        const dd = article.querySelectorAll("dd");
        return [
          article.id,
          {
            "사례 높이": `${Math.round(article.getBoundingClientRect().height)}px`,
            "원본 블록 크기": source(article),
            "서식 없는 항목(dd)": dd.length
              ? `${dd.length}개 · 들여쓰기 ${getComputedStyle(dd[0]).marginInlineStart}`
              : "0개",
            "샘플 잔여 요소": `${residue(article)}개`,
            "관련 자료 링크": [...article.querySelectorAll(".sp-sources a")]
              .map((link) => link.textContent.trim())
              .join(" · "),
          },
        ];
      }),
    ),
  };
};

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const sections = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  for (const slug of slugs) {
    const captured = {};
    for (const [side, id] of [
      ["before", beforeId],
      ["after", afterId],
    ]) {
      await page.goto(
        "file://" + path.join(runs, id, slug, "index.html"),
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (const image of document.images) {
          image.loading = "eager";
          await image.decode().catch(() => {});
        }
      });
      const metrics = await page.evaluate(measure);
      const file = (key) => `compare/${slug}-${key}-${side}.jpg`;
      // 첫 화면은 뷰포트 한 장, 사례는 지면 전체를 캡처합니다.
      await page.screenshot({
        path: path.join(out, file("intro")),
        type: "jpeg",
        quality: 80,
      });
      const cases = await page.locator("[data-case-type]").all();
      const ids = [];
      for (const article of cases) {
        const key = await article.getAttribute("id");
        ids.push(key);
        await article.screenshot({
          path: path.join(out, file(key)),
          type: "jpeg",
          quality: 80,
        });
      }
      captured[side] = { metrics, ids, file };
    }
    const name = JSON.parse(
      fs.readFileSync(path.join(out, slug, "run.json"), "utf8"),
    ).structured.content.profile.name;
    const rows = [
      {
        key: "intro",
        title: "첫 화면",
        before: captured.before.metrics.intro,
        after: captured.after.metrics.intro,
      },
      ...captured.after.ids.map((key) => ({
        key,
        title: key.replace(/^section-/, "사례 "),
        before: captured.before.metrics.cases[key] || {},
        after: captured.after.metrics.cases[key] || {},
      })),
    ];
    sections.push(
      `<section id="${escape(slug)}"><h2>${escape(name)} · ${escape(slug)}</h2>` +
        rows
          .map((row) => {
            const changed = Object.keys(row.after).filter(
              (label) => row.before[label] !== row.after[label],
            );
            const note = notes[`${slug}/${row.key}`];
            return `<article class="pair"><h3>${escape(row.title)}</h3>${note ? `<p class="note">${escape(note)}</p>` : ""}${
              changed.length
                ? `<table><thead><tr><th>측정값</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>${changed
                    .map(
                      (label) =>
                        `<tr><th>${escape(label)}</th><td>${escape(row.before[label] ?? "없음")}</td><td>${escape(row.after[label])}</td></tr>`,
                    )
                    .join("")}</tbody></table>`
                : `<p class="note">측정값 변화 없음</p>`
            }<div class="shots"><figure><figcaption>변경 전 · ${escape(beforeId)}</figcaption><img loading="lazy" src="./${captured.before.file(row.key)}" alt="${escape(name)} ${escape(row.title)} 변경 전"></figure><figure><figcaption>변경 후 · ${escape(afterId)}</figcaption><img loading="lazy" src="./${captured.after.file(row.key)}" alt="${escape(name)} ${escape(row.title)} 변경 후"></figure></div></article>`;
          })
          .join("") +
        `</section>`,
    );
  }
} finally {
  await browser.close();
}
const css = fs.readFileSync(
  path.join(root, "scripts/library/renderer/portfolio/v1/comparison-panel.css"),
  "utf8",
);
const summary = notes.summary
  ? `<ul class="summary">${notes.summary.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`
  : "";
fs.writeFileSync(
  path.join(out, "compare.html"),
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>변경 전후 비교 · Expresso</title><style>body{margin:0}*{box-sizing:border-box}${css}.portfolio-comparison h1{font-size:32px;margin:0;padding-top:32px}.comparison-content h2{font-size:22px;margin-top:48px;border-top:1px solid var(--line);padding-top:24px}.comparison-content h3{font-size:17px;margin:32px 0 8px}.comparison-content p,.summary li{line-height:1.7}.note{color:var(--muted);max-width:80ch}.pair table{border-collapse:collapse;font-size:14px;margin:12px 0}.pair th,.pair td{text-align:left;padding:6px 16px 6px 0;border-bottom:1px solid var(--line);vertical-align:top}.pair td{font-variant-numeric:tabular-nums}.shots{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.shots figure{margin:0;min-width:0}.shots figcaption{font-size:13px;color:var(--muted);margin-bottom:6px}.shots img{width:100%;height:auto;border:1px solid var(--line);background:white}.comparison-content>p a{color:var(--accent)}@media(max-width:800px){.shots{grid-template-columns:1fr}}</style></head><body><main class="portfolio-comparison"><div class="comparison-content"><h1>변경 전후 비교</h1><p><a href="../${escape(beforeId)}/index.html">${escape(beforeId)}</a>와 <a href="./index.html">${escape(afterId)}</a>의 같은 프로필을 1440px·모션 감소 설정에서 캡처했습니다. 표에는 값이 달라진 측정값만 적습니다.</p>${summary}<p>${slugs.map((slug) => `<a href="#${escape(slug)}">${escape(slug)}</a>`).join(" · ")}</p>${sections.join("")}</div></main></body></html>`,
);
console.log("compare.html", slugs.length, "profiles");
