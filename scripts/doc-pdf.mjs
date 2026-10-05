#!/usr/bin/env node
/**
 * 문서를 제출용 PDF로 내보낸다.
 *
 * 브라우저의 「인쇄 → PDF로 저장」과 다른 점은 **쪽 번호와 머리말**이다. Chrome은
 * CSS의 `@page` 여백 상자를 지원하지 않아 인쇄 대화상자로는 양식이 요구하는
 * 「워드마크 · 프로젝트명 · version」 머리말과 「가천대학교, 설계서  N」 꼬리말을
 * 넣을 수 없다. 그래서 DevTools 프로토콜의 `Page.printToPDF`를 직접 부른다 —
 * 이쪽은 머리말·꼬리말 서식과 쪽 번호를 받는다.
 *
 * 설치할 것은 없다. Chrome은 이미 있고, WebSocket은 Node에 들어 있다.
 *
 *   node scripts/doc-pdf.mjs docs/졸업작품-설계서.html [나갈-경로.pdf]
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = resolve(ROOT, process.argv[2] ?? "docs/졸업작품-설계서.html");
const sourceHtml = readFileSync(sourceFile, "utf8");
const documentVersion = sourceHtml.match(/<div class="k">VERSION<\/div><div class="v">(v[^<]+)<\/div>/)?.[1] ?? "v0.1";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** 양식 머리말 — 표지 오른쪽 위의 그 칸이다. 팀번호 칸에는 Expresso 워드마크를 둔다. */
const META = {
  project: "Expresso — 채용 공고·커리어 기록 추천 모델 기반 맞춤형 포트폴리오 생성 및 배포 플랫폼 개발",
  version: documentVersion,
  footer: "2026 가천대학교, 설계서",
};

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/* Chrome은 머리말·꼬리말을 본문과 다른 문서로 그린다. 상속되는 스타일도, 본문이 받은 웹
   글꼴도 없으므로 글꼴과 색을 여기서 다시 정한다. 폭은 인쇄 여백 안쪽이라 100%로 둔다.

   브랜드 — 색은 services/web/src/styles/tokens.css의 값이다(CSS 변수를 읽지 못해 값으로 둔다):
   espresso #9a4030 · crema #e0b486 · ink-900 #16223a · slate-500 #5a6b87 · line-200 #e2e9f4.
   로고 마크는 services/web/src/components/brand/Logo.tsx의 좌표와 light 짝이다.
   라틴 글자는 Outfit(OFL, docs/assets/fonts/)을 data URI로 넣고, 한글은 시스템 고딕을 쓴다. */
const FONT_DIR = resolve(ROOT, "docs/assets/fonts");
const outfit = (weight) =>
  `@font-face{font-family:"Outfit";font-weight:${weight};src:url(data:font/woff2;base64,${
    readFileSync(resolve(FONT_DIR, `outfit-latin-${weight}.woff2`)).toString("base64")}) format("woff2");}`;
const BRAND = { espresso: "#9a4030", crema: "#e0b486", ink: "#16223a", slate: "#5a6b87", line: "#e2e9f4" };
// style 속성 안에 들어가므로 작은따옴표만 쓴다
const FONT_STACK = `'Outfit',-apple-system,'Apple SD Gothic Neo',sans-serif`;
const LOGO = `<svg width="13" height="13" viewBox="0 0 108 108" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2.5px">
<defs><clipPath id="hc"><circle cx="44" cy="54" r="36"/></clipPath><mask id="hm"><rect width="108" height="108" fill="#fff"/><circle cx="44" cy="54" r="46.5" fill="#000"/></mask></defs>
<circle cx="78.2" cy="54" r="19.8" stroke="${BRAND.crema}" stroke-width="8.5" mask="url(#hm)"/>
<rect y="58.96" width="108" height="49.04" fill="${BRAND.espresso}" clip-path="url(#hc)"/>
<circle cx="44" cy="54" r="36" stroke="${BRAND.espresso}" stroke-width="10"/></svg>`;

// 워드마크 — 표지 · Logo.tsx와 같이 가운데 「ss」만 espresso
const WORDMARK = `<span style="margin-left:4px;font-size:8.5pt;font-weight:500;letter-spacing:-0.025em;vertical-align:-0.5px;">Expre<span style="color:${BRAND.espresso};">ss</span>o</span>`;

const HEADER = `<style>${outfit(400)}${outfit(500)}</style>
<div style="width:100%;font-family:${FONT_STACK};font-size:7pt;
            color:${BRAND.ink};padding:0 14mm;box-sizing:border-box;">
  <table style="width:100%;border-collapse:collapse;border-bottom:0.8pt solid ${BRAND.espresso};">
    <tr>
      <td style="padding:0 0 2mm 0;white-space:nowrap;">${LOGO}${WORDMARK}</td>
      <td style="padding:0 0 2mm 0;text-align:center;color:${BRAND.slate};">${esc(META.project)}</td>
      <td style="padding:0 0 2mm 0;text-align:right;color:${BRAND.espresso};font-weight:500;white-space:nowrap;width:14mm;">${esc(META.version)}</td>
    </tr>
  </table>
</div>`;

const FOOTER = `<style>${outfit(400)}${outfit(500)}</style>
<div style="width:100%;font-family:${FONT_STACK};font-size:7.5pt;
            color:${BRAND.slate};padding:0 14mm;box-sizing:border-box;">
  <table style="width:100%;border-collapse:collapse;border-top:0.8pt solid ${BRAND.line};">
    <tr>
      <td style="padding:2mm 0 0 0;">${esc(META.footer)}</td>
      <td style="padding:2mm 0 0 0;text-align:right;color:${BRAND.ink};font-weight:500;font-size:8pt;"><span class="pageNumber"></span></td>
    </tr>
  </table>
</div>`;


/* ── PDF에서 쪽 번호를 읽는다 ────────────────────────────────────────
   Chrome이 내는 PDF는 1.4 평문 객체라 정규식으로 읽힌다. 책갈피(/Outlines)의
   각 항목이 어느 쪽 객체를 가리키는지 보고, 쪽 객체의 순서로 쪽 번호를 얻는다.
   레이아웃을 우리가 다시 계산하지 않는다 — 나눈 것은 Chrome이고, 그 결과를
   그대로 읽는 편이 맞다. */
function readOutline(buf) {
  const s = buf.toString("latin1");
  const objs = new Map();
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objs.set(+m[1], m[2]);

  const catalog = [...objs.values()].find((b) => /\/Type\s*\/Catalog/.test(b)) ?? "";
  const order = [];
  (function walk(ref, seen = new Set()) {
    if (seen.has(ref)) return;
    seen.add(ref);
    const body = objs.get(ref) ?? "";
    if (/\/Type\s*\/Pages/.test(body)) {
      const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(body)?.[1] ?? "";
      for (const k of kids.matchAll(/(\d+) 0 R/g)) walk(+k[1], seen);
    } else if (/\/Type\s*\/Page\b/.test(body)) order.push(ref);
  })(+(/\/Pages (\d+) 0 R/.exec(catalog)?.[1] ?? 0));
  const pageOf = new Map(order.map((n, i) => [n, i + 1]));

  const decode = (hex) => {
    const b = Buffer.from(hex, "hex");
    return (b[0] === 0xfe && b[1] === 0xff ? b.subarray(2) : b).swap16().toString("utf16le");
  };
  const titleOf = (body) => {
    const hex = /\/Title <([0-9A-Fa-f]+)>/.exec(body);
    if (hex) return decode(hex[1]);
    const lit = /\/Title \(([\s\S]*?)\)/.exec(body);
    return lit ? lit[1] : "";
  };

  const pages = new Map();
  const rootRef = +(/\/Outlines (\d+) 0 R/.exec(catalog)?.[1] ?? 0);
  const firstRef = +(/\/First (\d+) 0 R/.exec(objs.get(rootRef) ?? "")?.[1] ?? 0);
  (function walk(ref) {
    while (ref) {
      const body = objs.get(ref) ?? "";
      const dest = /\/Dest \[(\d+) 0 R/.exec(body);
      const title = titleOf(body).trim();
      const page = dest ? pageOf.get(+dest[1]) : null;
      if (title && page && !pages.has(title)) pages.set(title, page);
      const first = /\/First (\d+) 0 R/.exec(body);
      if (first) walk(+first[1]);
      const next = /\/Next (\d+) 0 R/.exec(body);
      ref = next ? +next[1] : 0;
    }
  })(firstRef);
  return { pages, total: order.length };
}

/* ── 쪽 번호를 원본 HTML에 새긴다 ──────────────────────────────────
   화면과 인쇄는 레이아웃이 달라, 브라우저 혼자서는 자기가 몇 쪽인지 알 수 없다.
   그런데 여기서는 방금 잰 값이 있다. 그것을 제목에 `data-page`로 남기면 읽는
   쪽(`docs/templates/doc-rail.js`)이 그대로 쓴다.

   목차 지면은 파일에 쓰지 않는데 이것은 쓰는 이유 — 목차는 매번 다시 재면 되지만,
   쪽 번호는 PDF를 뽑을 때만 알 수 있어서 남겨 두지 않으면 사라진다.

   제목은 문서 순서로 맞춘다. READ_HEADINGS 가 절마다 h2 하나와 그 아래 h3 들을
   차례로 담으므로 파일에 나타나는 차례와 같다. 개수가 어긋나면 쓰지 않는다 —
   한 칸 밀린 쪽 번호는 없느니만 못하다. */
function writePages(file, rows, total) {
  const src = readFileSync(file, "utf8");
  const tags = [...src.matchAll(/<(h2|h3|h4)(\s[^>]*?)?>/g)];

  if (tags.length !== rows.length) {
    console.warn(`경고: 제목 ${tags.length}개인데 쪽 번호는 ${rows.length}개입니다. 새기지 않았습니다.`);
    return false;
  }

  let out = "", at = 0;
  tags.forEach((m, i) => {
    const attrs = (m[2] ?? "").replace(/\s*data-page="[^"]*"/g, "");
    const page = rows[i].page;
    out += src.slice(at, m.index)
      + `<${m[1]}${attrs}${page ? ` data-page="${page}"` : ""}>`;
    at = m.index + m[0].length;
  });
  out += src.slice(at);

  // 전체 쪽수와 잰 날. 문서를 고치고 다시 뽑지 않으면 이 날짜가 어긋난다 —
  // 레일이 그때 "지난 번 출력 기준"이라고 말할 수 있어야 한다.
  const stamp = new Date().toISOString().slice(0, 10);
  out = out.replace(/<main class="sheet" id="doc"(?:\s+data-doc-[a-z-]+="[^"]*")*/,
    `<main class="sheet" id="doc" data-doc-pages="${total}" data-doc-paged-at="${stamp}"`);

  if (out === src) return false;
  writeFileSync(file, out);
  return true;
}

/** 목차 지면을 문서 안에 끼워 넣는다. 파일에는 쓰지 않는다 — 매번 새로 잰다. */
const INJECT_TOC = (rows) => `(() => {
  document.getElementById('ex-toc-page')?.remove();
  const rows = ${JSON.stringify(rows)};
  const sec = document.createElement('section');
  sec.id = 'ex-toc-page';
  sec.className = 'print-only print-page';
  sec.style.display = 'none';
  const line = (r) => {
    const lv = r.level === 1;
    return '<div style="display:flex; align-items:baseline; gap:8px; margin:' +
      (lv ? '14px 0 6px' : '3px 0') + '; padding-left:' + (lv ? 0 : 22) + 'px;">' +
      '<span style="font-weight:' + (lv ? 600 : 400) + '; font-size:' + (lv ? '11.5pt' : '10pt') +
      '; color:var(--ex-' + (lv ? 'ink-900' : 'slate-700') + ')">' + r.label + '</span>' +
      '<span style="flex:1; border-bottom:1px dotted var(--ex-line-300); transform:translateY(-3px)"></span>' +
      '<span style="font-family:var(--ex-font-brand); font-weight:' + (lv ? 500 : 400) + '; font-size:10pt; color:var(--ex-' +
      (lv ? 'espresso' : 'slate-500') + ')">' + r.page + '</span></div>';
  };
  sec.innerHTML = '<div class="print-title"><span class="kicker">Contents</span><span class="t">목차</span></div>'
    + rows.map(line).join('');
  const first = document.querySelector('#doc > section.sec');
  first.parentNode.insertBefore(sec, first);
})()`;

/** 문서에서 장·절의 차례를 읽는다. */
const READ_HEADINGS = `(() => [...document.querySelectorAll('#doc > section.sec')].flatMap((sec) => {
  const h2 = sec.querySelector('.sec-head h2');
  const num = (sec.querySelector('.sec-head .num')?.textContent ?? '').trim();
  const out = [{ level: 1, key: h2.textContent.trim(), label: num + '. ' + h2.textContent.trim() }];
  for (const h3 of sec.querySelectorAll(':scope > h3')) {
    const t = h3.textContent.trim();
    out.push({ level: 2, key: t, label: t });
  }
  return out;
}))()`;

/* 쪽 번호를 새길 닻. 목차 행(h2·h3)보다 촘촘해야 한다 — 5.3절 하나에 화면이
   29개라, 절 머리에만 닻을 두면 그 사이 60쪽을 비율로 찍게 되고 실제와 어긋난다.
   Chrome 의 문서 개요는 h4 도 책갈피로 만들므로 쪽 번호를 그대로 얻을 수 있다.

   문서에 나타나는 차례 그대로 담는다. 되쓰기가 이 차례로 태그를 찾는다. */
const READ_ANCHORS = `(() => [...document.querySelectorAll('#doc h2, #doc h3, #doc h4')]
  .map((h) => ({ tag: h.tagName.toLowerCase(), key: h.textContent.trim() })))()`;

/** 파일을 그대로 내주는 최소 서버. file:// 로 열면 글꼴 CDN이 막힌다. */
async function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
      const target = resolve(root, rel);
      if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
      const info = await stat(target);
      if (info.isDirectory()) { res.writeHead(404).end(); return; }
      const type = target.endsWith(".html") ? "text/html; charset=utf-8"
        : target.endsWith(".css") ? "text/css"
        : target.endsWith(".png") ? "image/png"
        : target.endsWith(".svg") ? "image/svg+xml"
        : target.endsWith(".json") ? "application/json" : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(await readFile(target));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, port: server.address().port };
}

/** Chrome을 띄우고 브라우저 소켓 주소를 받는다. */
function launch() {
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--hide-scrollbars", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  return new Promise((ok, fail) => {
    let buf = "";
    const timer = setTimeout(() => fail(new Error("Chrome이 30초 안에 뜨지 않았습니다")), 30_000);
    chrome.stderr.on("data", (chunk) => {
      buf += chunk;
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) { clearTimeout(timer); ok({ chrome, wsUrl: m[0] }); }
    });
    chrome.on("exit", (code) => { clearTimeout(timer); fail(new Error(`Chrome 종료 (${code})`)); });
  });
}

/** CDP 한 벌. id를 붙여 보내고 같은 id의 답을 기다린다. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const waiting = new Map();
  const listeners = [];
  let seq = 0;
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, fail } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? fail(new Error(`${msg.error.message} (${msg.method ?? ""})`)) : ok(msg.result);
    }
    for (const fn of listeners) fn(msg);
  });
  const ready = new Promise((ok, fail) => {
    ws.addEventListener("open", ok);
    ws.addEventListener("error", () => fail(new Error(`소켓 연결 실패: ${wsUrl}`)));
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = ++seq;
      return new Promise((ok, fail) => {
        waiting.set(id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    once(predicate) {
      return new Promise((ok) => {
        const fn = (msg) => {
          if (!predicate(msg)) return;
          listeners.splice(listeners.indexOf(fn), 1);
          ok(msg);
        };
        listeners.push(fn);
      });
    },
    close: () => ws.close(),
  };
}

async function main() {
  const input = process.argv[2] ?? "docs/졸업작품-설계서.html";
  const output = resolve(ROOT, process.argv[3] ?? input.replace(/\.html$/, ".pdf"));
  const relative = resolve(ROOT, input).slice(ROOT.length + 1);

  const { server, port } = await serve(ROOT);
  const url = `http://127.0.0.1:${port}/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const { chrome, wsUrl } = await launch();
  const cdp = connect(wsUrl);
  await cdp.ready;

  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

    await cdp.send("Page.enable", {}, sessionId);
    const loaded = cdp.once((m) => m.method === "Page.loadEventFired" && m.sessionId === sessionId);
    await cdp.send("Page.navigate", { url }, sessionId);
    await loaded;

    // 글꼴이 오기 전에 찍으면 줄이 밀린다. 목차 · 쪽 나눔도 그때 자리를 잡는다.
    await cdp.send("Runtime.evaluate", {
      expression: "document.fonts.ready.then(() => new Promise(r => setTimeout(r, 1200)))",
      awaitPromise: true,
    }, sessionId);

    const print = () => cdp.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27, paperHeight: 11.69,            // A4
      marginTop: 0.83, marginBottom: 0.71,             // 머리말 · 꼬리말 자리
      marginLeft: 0.55, marginRight: 0.55,
      displayHeaderFooter: true,
      headerTemplate: HEADER,
      footerTemplate: FOOTER,
      preferCSSPageSize: false,
      generateDocumentOutline: true,   // 장·절이 PDF 책갈피가 되고, 쪽 번호를 여기서 읽는다
    }, sessionId).then((r) => Buffer.from(r.data, "base64"));

    const heads = (await cdp.send("Runtime.evaluate", {
      expression: READ_HEADINGS, returnByValue: true,
    }, sessionId)).result.value;

    /* 목차를 넣으면 그만큼 뒤가 밀린다. 그래서 한 번에 끝나지 않는다 —
       찍어서 쪽 번호를 읽고, 목차를 고쳐 넣고, 다시 찍기를 값이 멎을 때까지 한다. */
    let pdf = null, rows = null, settled = false;
    for (let pass = 1; pass <= 5; pass += 1) {
      if (rows) await cdp.send("Runtime.evaluate", { expression: INJECT_TOC(rows) }, sessionId);
      pdf = await print();
      const { pages, total } = readOutline(pdf);
      const next = heads.map((h) => ({ ...h, page: pages.get(h.key) ?? "—" }));
      const same = rows && rows.length === next.length
        && rows.every((r, i) => r.page === next[i].page);
      process.stdout.write(`${pass}차 ${total}쪽${same ? " · 멎음" : ""}\n`);
      if (same) { settled = true; break; }
      rows = next;
    }
    if (!settled) console.warn("경고: 쪽 번호가 멎지 않았습니다. 목차를 확인하십시오.");

    if (settled) {
      const anchors = (await cdp.send("Runtime.evaluate", {
        expression: READ_ANCHORS, returnByValue: true,
      }, sessionId)).result.value;

      /* 같은 제목이 두 번 나오면(「■ 상호작용 유형」) 개요는 첫 자리만 알려 준다.
         그대로 쓰면 뒤쪽 닻이 앞 쪽수를 달고 번호가 거꾸로 간다. 앞 닻보다
         작아지는 것은 버린다 — 닻 하나가 없는 편이 거꾸로 가는 것보다 낫다. */
      const { pages, total } = readOutline(pdf);
      let last = 0;
      const marks = anchors.map((a) => {
        const page = pages.get(a.key);
        if (!page || page < last) return { page: null };
        last = page;
        return { page };
      });

      const found = marks.filter((m) => m.page).length;
      if (writePages(resolve(ROOT, input), marks, total)) {
        console.log(`쪽 번호를 ${basename(input)} 에 새겼습니다 — 닻 ${found}/${marks.length}`);
      }
    }

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, pdf);
    console.log(`${basename(output)} · ${readOutline(pdf).total}쪽 · ${(pdf.length / 1024 / 1024).toFixed(1)}MB`);
  } finally {
    cdp.close();
    chrome.kill();
    server.close();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
