// 측정을 마친 실험 지면을 인물 × 조건 격자로 늘어놓은 비교 화면을 만듭니다.
// 사용: node scripts/library/renderer/free-lab/sheet.mjs <실행 ID>
import fs from "node:fs";
import path from "node:path";

const run = process.argv[2];
if (!run || !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error("실행 ID가 필요합니다.");
const root = path.join(process.cwd(), "docs/library/previews/portfolio/runs", run);
const report = JSON.parse(fs.readFileSync(path.join(root, "measure.json"), "utf8"));

const ARMS = [
  ["structured", "구조화 생성", "설계 → 채우기 · 키트 렌더링"],
  ["base", "자유 생성(지금)", "키트 부품으로 조판"],
  ["plain", "키트 없이 자유", "모델이 CSS 전체 작성"],
  ["refine", "+ 정리본", "원문 대신 자료 정리본"],
  ["skill", "+ 디자인 지침", "frontend-design 본문"],
  ["both", "+ 정리본 + 지침", "둘 다"],
];
const INPUTS = [...new Set(report.map((item) => item.input))];
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const names = { yun: "윤하린 · 프론트엔드", moon: "문가령 · 데이터 분석", bae: "배준호 · ML 리서치" };

function cell(item) {
  const wide = item.measure.screens["1440"], narrow = item.measure.screens["390"], expected = item.measure.expected;
  const flags = [
    wide.overflow ? "1440 넘침" : "", narrow.overflow ? "390 넘침" : "",
    wide.name === false ? "이름 없음" : "",
    wide.brokenImages ? `깨진 이미지 ${wide.brokenImages}` : "",
    wide.hiddenChars > 40 ? `가려진 글 ${wide.hiddenChars}자` : "",
    item.blockedTags ? `스크립트 ${item.blockedTags}` : "",
    item.ungrounded.length ? `출처 밖 숫자 ${item.ungrounded.length}` : "",
  ].filter(Boolean);
  const dir = `./cells/${item.label}`;
  return `<figure>
<a href="${dir}/page.html"><img src="${dir}/shots/1440-first.jpg" alt="${escape(item.label)} 첫 화면" loading="lazy"></a>
<figcaption>
<p class="links"><a href="${dir}/shots/1440-full.jpg">1440 전체</a><a href="${dir}/shots/390-full.jpg">390 전체</a>${item.rep > 1 ? `<span>반복 ${item.rep}</span>` : ""}</p>
<p>섹션 ${wide.sections}/${expected.sections} · 경력 ${wide.career}/${expected.career} · 근거 ${wide.evidence}/${expected.evidence}</p>
<p>첫 화면 최대 ${wide.firstMaxFont}px · ${wide.firstChars}자 · 높이 ${wide.height.toLocaleString()}px</p>
<p>${Math.round(item.wallMs / 1000)}초 · $${item.costUsd.toFixed(2)} · 호출 ${item.calls}회</p>
${flags.length ? `<p class="flags">${flags.map(escape).join(" · ")}</p>` : ""}
${item.plan?.signature ? `<p class="plan">${escape(item.plan.signature)}</p>` : ""}
</figcaption></figure>`;
}

const rows = INPUTS.map((input) => {
  const items = report.filter((item) => item.input === input);
  const [persona, ...design] = input.split("-");
  return `<section><h2>${escape(names[persona] ?? persona)} <small>${escape(design.join("-"))}</small></h2><div class="row">${ARMS.map(([arm, title, note]) => {
    const found = items.filter((item) => item.arm === arm).sort((a, b) => a.rep - b.rep);
    return `<div class="col"><h3>${title}<small>${note}</small></h3>${found.length ? found.map(cell).join("") : '<p class="none">만들지 않음</p>'}</div>`;
  }).join("")}</div></section>`;
}).join("\n");

fs.writeFileSync(path.join(root, "index.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>자유 생성 실험 비교 · Expresso</title><style>
body{margin:0;font-family:system-ui,sans-serif;color:#17202a;background:#f7f8fa;word-break:keep-all}
main{padding:32px 24px 80px}
h1{font-size:28px;margin:0 0 8px}
.lede{max-width:880px;line-height:1.7;color:#475467;margin:0 0 32px}
section{margin:0 0 48px}
h2{font-size:20px;margin:0 0 12px}
h2 small{font-weight:400;color:#667085;margin-left:8px;font-size:14px}
.row{display:grid;grid-template-columns:repeat(${ARMS.length},minmax(240px,1fr));gap:16px;overflow-x:auto;padding-bottom:8px}
h3{font-size:14px;margin:0 0 8px}
h3 small{display:block;font-weight:400;color:#667085;font-size:12px;margin-top:2px}
figure{margin:0 0 16px;background:#fff;border:1px solid #e4e7ec;border-radius:8px;overflow:hidden}
figure img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-bottom:1px solid #e4e7ec}
figcaption{padding:10px 12px;font-size:12px;line-height:1.6;color:#475467}
figcaption p{margin:0}
.links{display:flex;gap:10px;margin-bottom:4px}
.links a{color:#175cd3}
.links span{color:#b54708}
.flags{color:#b42318}
.plan{margin-top:6px;padding-top:6px;border-top:1px solid #f2f4f7;color:#17202a}
.none{font-size:12px;color:#98a2b3;border:1px dashed #d0d5dd;border-radius:8px;padding:24px 12px;text-align:center;margin:0}
</style></head><body><main>
<h1>자유 생성 실험 비교</h1>
<p class="lede">같은 가상 인물 · 같은 디자인 시스템으로 조건만 바꿔 만든 지면입니다. 썸네일은 1440px 첫 화면이고 누르면 지면이 열립니다. 인물과 기록은 모두 시연용 가상 자료입니다. 방법과 판정은 <a href="../../../../../architecture/portfolio-free-generation-lab.md">결과 문서</a>에 있습니다.</p>
${rows}
</main></body></html>
`);
console.log(`비교 화면: ${path.relative(process.cwd(), path.join(root, "index.html"))} · 지면 ${report.length}건`);
