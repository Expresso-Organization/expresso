#!/usr/bin/env node
/**
 * 문서를 제출용 PDF로 내보낸다.
 *
 * 브라우저의 「인쇄 → PDF로 저장」과 다른 점은 **쪽 번호와 머리말**이다. Chrome은
 * CSS의 `@page` 여백 상자를 지원하지 않아 인쇄 대화상자로는 양식이 요구하는
 * 「팀번호 · 프로젝트명 · version」 머리말과 「가천대학교, 설계서  N」 꼬리말을
 * 넣을 수 없다. 그래서 DevTools 프로토콜의 `Page.printToPDF`를 직접 부른다 —
 * 이쪽은 머리말·꼬리말 서식과 쪽 번호를 받는다.
 *
 * 설치할 것은 없다. Chrome은 이미 있고, WebSocket은 Node에 들어 있다.
 *
 *   node scripts/doc-pdf.mjs docs/졸업작품-설계서.html [나갈-경로.pdf]
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** 양식 머리말 — 표지 오른쪽 위의 그 칸이다. */
const META = {
  team: "팀번호: XX",
  project: "Expresso — 채용 공고 맞춤형 포트폴리오 생성 서비스",
  version: "v0.1",
  course: "네트워크보안프로그래밍 (졸업작품 프로젝트)",
  footer: "2026 가천대학교, 설계서",
};

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/* Chrome은 머리말·꼬리말을 본문과 다른 문서로 그린다. 상속되는 스타일이 없으므로
   글꼴과 크기를 여기서 다시 정한다. 폭은 인쇄 여백 안쪽이라 100%로 둔다. */
const HEADER = `
<div style="width:100%;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:7pt;
            color:#16223a;padding:0 14mm;box-sizing:border-box;">
  <table style="width:100%;border-collapse:collapse;border-bottom:1.2pt solid #16223a;">
    <tr>
      <td style="padding:0 0 2mm 0;white-space:nowrap;">${esc(META.team)}</td>
      <td style="padding:0 0 2mm 0;text-align:center;color:#5a6b87;">${esc(META.project)}</td>
      <td style="padding:0 0 2mm 0;text-align:center;color:#9a4030;white-space:nowrap;width:14mm;">${esc(META.version)}</td>
      <td style="padding:0 0 2mm 0;text-align:right;white-space:nowrap;font-weight:600;">${esc(META.course)}</td>
    </tr>
  </table>
</div>`;

const FOOTER = `
<div style="width:100%;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:8pt;
            color:#16223a;padding:0 14mm;box-sizing:border-box;">
  <table style="width:100%;border-collapse:collapse;border-top:1.2pt solid #16223a;">
    <tr>
      <td style="padding:2mm 0 0 0;">${esc(META.footer)}</td>
      <td style="padding:2mm 0 0 0;text-align:right;"><span class="pageNumber"></span></td>
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
      '<span style="font-family:var(--ex-font-mono); font-size:10pt; color:var(--ex-' +
      (lv ? 'espresso' : 'slate-500') + ')">' + r.page + '</span></div>';
  };
  sec.innerHTML = '<div style="text-align:center; font-size:20pt; letter-spacing:.3em; margin:10mm 0 12mm">목 차</div>'
    + rows.map(line).join('');
  const first = document.querySelector('main > section.sec');
  first.parentNode.insertBefore(sec, first);
})()`;

/** 문서에서 장·절의 차례를 읽는다. */
const READ_HEADINGS = `(() => [...document.querySelectorAll('main > section.sec')].flatMap((sec) => {
  const h2 = sec.querySelector('.sec-head h2');
  const num = (sec.querySelector('.sec-head .num')?.textContent ?? '').trim();
  const out = [{ level: 1, key: h2.textContent.trim(), label: num + '. ' + h2.textContent.trim() }];
  for (const h3 of sec.querySelectorAll(':scope > h3')) {
    const t = h3.textContent.trim();
    out.push({ level: 2, key: t, label: t });
  }
  return out;
}))()`;

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
