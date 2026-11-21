import { chromium, type Browser, type LaunchOptions } from "playwright";
import { assertPublicHost, assertPublicHttpUrl } from "../net/public-url.js";

/**
 * 사용자가 준 사이트의 첫 화면을 찍는다(작업물 재료). 1440×900 한 화면을 JPEG로.
 *
 * 우리 서버의 브라우저가 남의 페이지를 연다. 그래서 첫 주소뿐 아니라 페이지가 부르는 **모든 요청**의 호스트를 공개 주소인지 보고,
 * 아니면 끊는다 — 리다이렉트 · 하위 리소스로 내부망에 닿지 못하게. 다운로드 · 새 창 · 권한 요청은 받지 않는다. 시간 상한을 둔다.
 */
export interface SiteCapture { bytes: Buffer; title: string; finalUrl: string }
export interface SiteCapturer { capture(url: string): Promise<SiteCapture> }

export class ChromiumSiteCapturer implements SiteCapturer {
  #browser: Promise<Browser> | null = null;
  /** `launch`는 브라우저 실행 옵션이다. 기본은 측정기와 같은 headless shell이다(로컬 점검에서 설치된 Chrome을 쓰려면 `{ channel: "chrome" }`). */
  constructor(private readonly timeoutMs = 20_000, private readonly launch: LaunchOptions = {}) {}

  #launch(): Promise<Browser> {
    if (!this.#browser) {
      const launching = chromium.launch({ headless: true, ...this.launch });
      this.#browser = launching;
      launching.then(
        (browser) => browser.on("disconnected", () => { if (this.#browser === launching) this.#browser = null; }),
        () => { if (this.#browser === launching) this.#browser = null; },
      );
    }
    return this.#browser;
  }

  async capture(value: string): Promise<SiteCapture> {
    const url = await assertPublicHttpUrl(value);
    const browser = await this.#launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: false, serviceWorkers: "block", javaScriptEnabled: true });
    // 같은 호스트를 매 요청 다시 풀지 않는다. 한 번 막힌 호스트는 계속 막는다.
    const verdicts = new Map<string, Promise<boolean>>();
    const allowed = (host: string) => {
      let verdict = verdicts.get(host);
      if (!verdict) { verdict = assertPublicHost(host).then(() => true, () => false); verdicts.set(host, verdict); }
      return verdict;
    };
    await context.route("**/*", async (route) => {
      const target = new URL(route.request().url());
      if (target.protocol === "data:" || target.protocol === "blob:") return route.continue();
      if ((target.protocol !== "http:" && target.protocol !== "https:") || !(await allowed(target.hostname))) return route.abort("blockedbyclient");
      return route.continue();
    });
    const page = await context.newPage();
    // 페이지가 연 새 창은 바로 닫는다. 처리기는 첫 페이지를 연 뒤에 단다 — context의 page 이벤트는 첫 페이지에도 온다.
    page.on("popup", (popup) => { void popup.close(); });
    try {
      await page.goto(url.toString(), { waitUntil: "load", timeout: this.timeoutMs });
      // 늦게 그려지는 첫 화면(글꼴 · 등장 동작)을 조금 기다린다.
      await page.waitForTimeout(1_500);
      const bytes = await page.screenshot({ type: "jpeg", quality: 82, timeout: this.timeoutMs });
      return { bytes, title: (await page.title()).slice(0, 200), finalUrl: page.url() };
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
