import { chromium, type Browser } from "playwright";
import { PAGE_ALLOWED_STYLESHEET_HOSTS, PAGE_IMAGE_SRC_PREFIX } from "@expresso/contracts";
import { RENDER_MEASURE_WIDTHS, inspectRenderedPage, settleRenderedPage, type RenderMeasurement } from "@expresso/portfolio-renderer";

/** 한 지면을 너비마다 잰 결과입니다. */
export interface PageMeasurement {
  widths: { width: number; measurement: RenderMeasurement }[];
  durationMs: number;
}

/** 완성된 HTML 문서를 실제 레이아웃 엔진으로 잽니다. 생성기는 이 인터페이스만 압니다. */
export interface PageMeasurer {
  measure(document: string): Promise<PageMeasurement>;
}

/** `/v1/media/<id>` 이미지를 채울 바이트를 돌려줍니다. 없으면 null입니다. */
export type MeasureAssetReader = (assetId: string, width?: number) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;

// 문서를 이 가짜 오리진에서 엽니다. 지면의 상대 경로 이미지(`/v1/media/…`)가 이 오리진으로 요청되어 가로챌 수 있습니다.
const ORIGIN = "http://expresso.measure";
const STYLESHEET_HOSTS: readonly string[] = PAGE_ALLOWED_STYLESHEET_HOSTS;

/**
 * Playwright Chromium으로 재는 측정기입니다.
 *
 * 브라우저는 처음 잴 때 한 번 띄우고 워커가 끝날 때까지 재사용합니다. 측정마다 새 context를 열어
 * 다른 생성의 쿠키 · 캐시가 섞이지 않게 합니다. headless 실행은 Playwright가 chromium-headless-shell을 씁니다
 * (https://playwright.dev/docs/browsers). 네트워크는 서체 CDN(`PAGE_ALLOWED_STYLESHEET_HOSTS`)만 엽니다.
 */
export class ChromiumPageMeasurer implements PageMeasurer {
  #browser: Promise<Browser> | null = null;

  constructor(
    private readonly readAsset: MeasureAssetReader,
    private readonly timeoutMs = 20_000,
  ) {}

  #launch(): Promise<Browser> {
    if (!this.#browser) {
      const launching = chromium.launch({ headless: true });
      this.#browser = launching;
      // 실행에 실패했거나 브라우저가 죽으면 다음 측정에서 다시 띄웁니다.
      launching.then(
        (browser) => browser.on("disconnected", () => { if (this.#browser === launching) this.#browser = null; }),
        () => { if (this.#browser === launching) this.#browser = null; },
      );
    }
    return this.#browser;
  }

  async measure(html: string): Promise<PageMeasurement> {
    const started = performance.now();
    const browser = await this.#launch();
    const context = await browser.newContext({ reducedMotion: "reduce" });
    context.setDefaultTimeout(this.timeoutMs);
    try {
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN) {
          if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
          if (url.pathname.startsWith(PAGE_IMAGE_SRC_PREFIX)) {
            const id = url.pathname.slice(PAGE_IMAGE_SRC_PREFIX.length).split("/")[0]!;
            const width = Number(url.searchParams.get("w")) || undefined;
            const asset = await this.readAsset(id, width).catch(() => null);
            return asset
              ? route.fulfill({ status: 200, contentType: asset.mimeType, body: Buffer.from(asset.bytes) })
              : route.fulfill({ status: 404 });
          }
          return route.fulfill({ status: 404 });
        }
        if (url.protocol === "https:" && STYLESHEET_HOSTS.includes(url.hostname)) return route.continue();
        return route.abort();
      });
      const widths: PageMeasurement["widths"] = [];
      for (const width of RENDER_MEASURE_WIDTHS) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
        await page.evaluate(settleRenderedPage);
        widths.push({ width, measurement: await page.evaluate(inspectRenderedPage) });
        await page.close();
      }
      return { widths, durationMs: Math.round(performance.now() - started) };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    const browser = await this.#browser?.catch(() => null);
    this.#browser = null;
    await browser?.close();
  }
}
