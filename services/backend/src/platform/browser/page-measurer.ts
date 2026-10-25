import { chromium, type Browser } from "playwright";
import { PAGE_ALLOWED_STYLESHEET_HOSTS, PAGE_IMAGE_SRC_PREFIX } from "@expresso/contracts";
import { RENDER_MEASURE_WIDTHS, inspectRenderedPage, settleRenderedPage, type RenderMeasurement } from "@expresso/portfolio-renderer";

/** 다듬기에서 모델에게 보여 줄 화면입니다. 1440 첫 화면은 PNG, 전체 페이지는 크기를 줄이려고 JPEG입니다. */
export interface PageScreenshot {
  name: "1440-first" | "1440-full" | "390-full";
  mediaType: "image/png" | "image/jpeg";
  /** base64 본문입니다. */
  data: string;
  /** 전체 페이지가 길이 한도에서 잘렸으면 true입니다. */
  truncated: boolean;
}

/** 한 지면을 너비마다 잰 결과입니다. */
export interface PageMeasurement {
  widths: { width: number; measurement: RenderMeasurement }[];
  screenshots: PageScreenshot[];
  durationMs: number;
}

/** 완성된 HTML 문서를 실제 레이아웃 엔진으로 잽니다. 생성기는 이 인터페이스만 압니다. */
export interface PageMeasurer {
  measure(document: string, options?: { screenshots?: boolean }): Promise<PageMeasurement>;
}

// 이미지 한 장의 긴 변 한도(8,000px) 안에서 자릅니다. 넘으면 아래쪽은 보이지 않습니다.
const MAX_SCREENSHOT_HEIGHT = 7_800;

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

  async measure(html: string, options: { screenshots?: boolean } = {}): Promise<PageMeasurement> {
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
      const screenshots: PageScreenshot[] = [];
      for (const width of RENDER_MEASURE_WIDTHS) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
        await page.evaluate(settleRenderedPage);
        widths.push({ width, measurement: await page.evaluate(inspectRenderedPage) });
        if (options.screenshots && (width === 1440 || width === 390)) {
          if (width === 1440)
            screenshots.push({ name: "1440-first", mediaType: "image/png", data: (await page.screenshot({ type: "png" })).toString("base64"), truncated: false });
          const height = await page.evaluate<number>("document.documentElement.scrollHeight");
          const truncated = height > MAX_SCREENSHOT_HEIGHT;
          const full = await page.screenshot({
            type: "jpeg",
            quality: 70,
            fullPage: true,
            ...(truncated ? { clip: { x: 0, y: 0, width, height: MAX_SCREENSHOT_HEIGHT } } : {}),
          });
          screenshots.push({ name: width === 1440 ? "1440-full" : "390-full", mediaType: "image/jpeg", data: full.toString("base64"), truncated });
        }
        await page.close();
      }
      return { widths, screenshots, durationMs: Math.round(performance.now() - started) };
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
