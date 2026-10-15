import fs from "node:fs";
try {
  const { renderStructuredPortfolio, searchPageLibrary } =
    await import("../../../packages/portfolio-renderer/dist/index.js");
  const content = {
    version: 1,
    profile: {
      name: "가상 서연",
      role: "설계자",
      headline: "사용자 인터페이스를 설계합니다.",
      intro: "입력 설명",
      focus: ["접근성"],
    },
    sections: [
      {
        id: "a",
        title: "첫번째 프로젝트",
        summary: "프로젝트 설명",
        body: "입력 원문",
        pattern: "project",
        details: Array.from({ length: 5 }, (_, i) => ({
          label: `항목 ${i}`,
          text: `설명 ${i}`,
        })),
        media: [],
        sourceIds: [],
      },
    ],
    career: [],
    evidence: [],
    contact: null,
  };
  const spec = {
    root: "page",
    elements: {
      page: {
        type: "PortfolioPage",
        props: {
          profile: { $state: "/profile" },
          design: { layout: "library", palette: "ivory", font: "sans" },
          motion: "showcase",
          rationale: "원본 선택",
        },
        children: ["intro", "case"],
      },
      intro: {
        type: "NameIntro",
        props: {
          profile: { $state: "/profile" },
          sections: { $state: "/sections" },
        },
        children: [],
      },
      case: {
        type: "CaseTechnical",
        props: { section: { $state: "/sectionById/a" } },
        children: [],
      },
    },
  };
  const items = searchPageLibrary({
    q: "",
    status: "renderable",
    page: 1,
    limit: 100,
  }).items;
  const results = [];
  const browser = process.argv.includes('--browser') ? await (await import('playwright')).chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}) : null;
  const page = browser ? await browser.newPage({reducedMotion:'reduce',javaScriptEnabled:false}) : null;
  for (const item of items) {
    let s = structuredClone(spec);
    s.elements[item.slot === "intro" ? "intro" : "case"].props.sourceId =
      item.id;
    try {
      let r = renderStructuredPortfolio(s, content);
      const screens=[];
      if(page)for(const width of [390,926,1440]){
        await page.setViewportSize({width,height:1000});
        await page.setContent(`<html lang="ko"><meta charset="utf-8"><style>html,body{margin:0}${r.css}</style><body>${r.html}</body></html>`);
        screens.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,h1:document.querySelectorAll('h1').length,name:document.querySelector('h1').textContent,opacity:getComputedStyle(document.querySelector('h1')).opacity,
          // 서식 없는 항목표와 원본 샘플 글자를 지운 뒤 남은 빈 상자를 셉니다.
          unstyledDetails:document.querySelectorAll('.sp-case dl,.sp-case dd').length,
          sampleResidue:[...document.querySelectorAll('[data-source-slot=section] *')].filter(node=>{if(node.closest('svg,[data-source-decoration]')||node.matches('img,svg'))return false;if(node.textContent.trim()||node.querySelector('img,svg'))return false;const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>2&&box.height>2&&(style.backgroundColor!=='rgba(0, 0, 0, 0)'||style.backgroundImage!=='none'||parseFloat(style.borderTopWidth)>0);}).length})));
      }
      results.push({
        id: item.id,
        name: item.sourceItemId,
        ok: true,
        h1: (r.html.match(/<h1\b/g) || []).length,
        htmlBytes: r.html.length,
        stock: /assets.watermelon|unsplash|Sign in|Watermelon|[0-9]+\+/.test(
          r.html,
        ),
        screens,
      });
    } catch (e) {
      results.push({
        id: item.id,
        name: item.sourceItemId,
        ok: false,
        error: e.message,
      });
    }
  }
  // 사례 원본을 좁은 열에 넣은 컨테이너 변형입니다. 세 열 Grid와 두 열 Columns에서 넘침을 잽니다.
  const grouped = {
    ...content,
    sections: ["a", "b", "c"].map((key, index) => ({
      ...content.sections[0],
      id: key,
      title: `${["첫번째", "두번째", "세번째"][index]} 프로젝트`,
    })),
  };
  const groupedSpec = (sourceId, group) => {
    const s = structuredClone(spec);
    for (const key of ["a", "b", "c"])
      s.elements[`case-${key}`] = {
        type: "CaseTechnical",
        props: { section: { $state: `/sectionById/${key}` }, sourceId },
        children: [],
      };
    delete s.elements.case;
    s.elements["group-1"] = group;
    s.elements.page.children = [
      "intro",
      "group-1",
      ...["a", "b", "c"]
        .map((key) => `case-${key}`)
        .filter((key) => !group.children.includes(key)),
    ];
    return s;
  };
  for (const item of items.filter((entry) => entry.slot === "section"))
    for (const group of [
      { type: "Grid", props: { variant: "even" }, children: ["case-a", "case-b", "case-c"] },
      { type: "Columns", props: { variant: "even" }, children: ["case-a", "case-b"] },
      { type: "Columns", props: { variant: "wide-start" }, children: ["case-a", "case-b"] },
    ]) {
      const name = `${item.sourceItemId} in ${group.type}(${group.props.variant})`;
      try {
        const r = renderStructuredPortfolio(groupedSpec(item.id, group), grouped);
        const screens = [];
        if (page)
          for (const width of [390, 926, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.setContent(`<html lang="ko"><meta charset="utf-8"><style>html,body{margin:0}${r.css}</style><body>${r.html}</body></html>`);
            screens.push(await page.evaluate(() => ({
              width: innerWidth,
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              // 열 밖으로 나간 원본 요소의 수입니다.
              escaped: [...document.querySelectorAll(".sp-group > *")].reduce((sum, column) => {
                const box = column.getBoundingClientRect();
                return sum + [...column.querySelectorAll("[data-library-source] *")].filter((node) => {
                  const inner = node.getBoundingClientRect();
                  return inner.width > 0 && (inner.left < box.left - 1 || inner.right > box.right + 1);
                }).length;
              }, 0),
              h1: document.querySelectorAll("h1").length,
            })));
          }
        results.push({ id: item.id, name, ok: true, h1: 1, stock: false, screens });
      } catch (e) {
        results.push({ id: item.id, name, ok: false, error: e.message });
      }
    }
  await browser?.close();
  console.log(JSON.stringify(results));
  fs.writeFileSync(
    "/tmp/expresso-collected-render-check.json",
    JSON.stringify(results),
  );
  if (results.some((r) => !r.ok || r.h1 !== 1 || r.stock || r.screens?.some(s=>s.overflow||s.escaped||s.h1!==1||(s.name!==undefined&&s.name!==content.profile.name)||s.opacity==='0'||s.unstyledDetails||s.sampleResidue))) process.exitCode = 1;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
