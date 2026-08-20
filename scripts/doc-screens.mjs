#!/usr/bin/env node
/**
 * 화면 정의서의 목업을 캡처해 그림 파일로 뽑는다.
 *
 * 설계서 5장은 화면마다 캡처를 요구한다. 제품은 아직 구현 중이지만 화면
 * 정의서(`docs/Expresso Screens.dc.html`)에 1440×940 목업이 화면마다 들어 있고,
 * **화면 정의서가 기준**이므로 그것을 그대로 찍는다. 손으로 다시 그리면 정의서와
 * 어긋나고, 어긋나면 어느 쪽이 맞는지 아무도 모르게 된다.
 *
 *   node scripts/doc-screens.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SOURCE = "docs/Expresso Screens.dc.html";
const OUT_DIR = resolve(ROOT, "docs/screens");

async function serve() {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    try {
      const body = await readFile(resolve(ROOT, rel));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return server;
}

function launch() {
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((ok, fail) => {
    let buf = "";
    const timer = setTimeout(() => fail(new Error("Chrome이 뜨지 않았습니다")), 30_000);
    chrome.stderr.on("data", (c) => {
      buf += c;
      const m = buf.match(/ws:\/\/\S+/);
      if (m) { clearTimeout(timer); ok({ chrome, wsUrl: m[0] }); }
    });
  });
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const waiting = new Map();
  let seq = 0;
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result ?? m.error); waiting.delete(m.id); }
  });
  const ready = new Promise((ok) => ws.addEventListener("open", ok));
  return {
    ready,
    send: (method, params = {}, sessionId) => new Promise((ok) => {
      const id = ++seq; waiting.set(id, ok);
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    }),
    close: () => ws.close(),
  };
}

const FIND_SHOTS = `(() => [...document.querySelectorAll('[data-screen-label]')].map((label) => {
  /* 라벨 다음 형제가 목업이다. 정의서가 그렇게 짜여 있다. */
  const shot = label.nextElementSibling;
  const r = shot.getBoundingClientRect();
  const h2 = label.querySelector('h2');
  const spans = [...label.querySelectorAll('span')];
  return {
    id: label.getAttribute('data-screen-label'),
    name: (h2?.textContent ?? '').trim(),
    note: (spans[spans.length - 1]?.textContent ?? '').trim(),
    x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height,
  };
}))()`;

async function main() {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/${SOURCE.split("/").map(encodeURIComponent).join("/")}`;
  const { chrome, wsUrl } = await launch();
  const cdp = connect(wsUrl);
  await cdp.ready;

  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 1560, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Page.navigate", { url }, sessionId);
    await new Promise((r) => setTimeout(r, 4000));   // 글꼴과 그림이 자리를 잡을 때까지

    const shots = (await cdp.send("Runtime.evaluate",
      { expression: FIND_SHOTS, returnByValue: true }, sessionId)).result.value;

    mkdirSync(OUT_DIR, { recursive: true });
    const index = [];
    let bytes = 0;
    for (const s of shots) {
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: s.x, y: s.y, width: s.w, height: s.h, scale: 1 },
      }, sessionId);
      const png = Buffer.from(data, "base64");
      writeFileSync(resolve(OUT_DIR, `${s.id}.png`), png);
      bytes += png.length;
      index.push({ id: s.id, name: s.name, note: s.note, w: Math.round(s.w), h: Math.round(s.h) });
      process.stdout.write(`  ${s.id.padEnd(4)} ${s.name.padEnd(24)} ${(png.length / 1024).toFixed(0)}KB\n`);
    }
    writeFileSync(resolve(OUT_DIR, "index.json"), JSON.stringify(index, null, 1));
    console.log(`화면 ${index.length}개 · 합계 ${(bytes / 1024 / 1024).toFixed(1)}MB → docs/screens/`);
  } finally {
    cdp.close(); chrome.kill(); server.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
