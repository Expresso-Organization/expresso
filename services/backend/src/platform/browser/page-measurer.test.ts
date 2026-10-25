import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { ChromiumPageMeasurer } from "./page-measurer.js";

// 브라우저가 설치되지 않은 개발 기계에서는 건너뜁니다. CI는 설치 뒤 `REQUIRE_BROWSER=1`로 돌려 건너뛰지 않게 합니다.
const run = existsSync(chromium.executablePath()) || process.env.REQUIRE_BROWSER === "1" ? describe : describe.skip;

// 1×1 PNG입니다.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
const ASSET = "3f2b8c1e-4d5a-4b6c-9d7e-1a2b3c4d5e6f";

const documentWith = (body: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font:16px monospace}.xp-inner{max-width:300px;margin:0 auto}</style></head>
<body><main class="xp-page"><div class="xp-inner"><header id="intro"><h1>가상 인물</h1></header>${body}</div></main></body></html>`;

run("ChromiumPageMeasurer", () => {
  const requested: string[] = [];
  const measurer = new ChromiumPageMeasurer(async (id) => {
    requested.push(id);
    return id === ASSET ? { bytes: PNG, mimeType: "image/png" } : null;
  });
  afterAll(() => measurer.close());

  it("세 너비에서 한 글자 줄바꿈 · 단 이탈 · 가로 넘침을 재고, 상대 경로 이미지를 읽기 함수로 채운다", async () => {
    const result = await measurer.measure(documentWith(`
      <article id="section-a" data-case-type="CaseStudy">
        <h2 style="width:5ch;word-break:break-all">abcdef</h2>
        <img src="/v1/media/${ASSET}?w=640" alt="그림">
        <div style="width:3000px">넓은 상자</div>
      </article>`));
    expect(result.widths.map((item) => item.width)).toEqual([390, 926, 1440]);
    for (const { measurement } of result.widths) {
      expect(measurement.orphans).toEqual([{ element: "section-a", text: "abcdef" }]);
      expect(measurement.escaped).toEqual([{ element: "section-a", text: "넓은 상자" }]);
      expect(measurement.overflow).toBe(true);
      expect(measurement.brokenImages).toBe(0);
      expect(measurement.casesWithImage).toEqual(["section-a"]);
    }
    expect(requested).toContain(ASSET);
  }, 60_000);

  it("허용하지 않은 바깥 주소는 막는다", async () => {
    const result = await measurer.measure(documentWith(`<article id="section-b" data-case-type="CaseStudy"><img src="https://example.com/x.png" alt="바깥 그림"></article>`));
    expect(result.widths[0]!.measurement.brokenImages).toBe(1);
  }, 60_000);
});
