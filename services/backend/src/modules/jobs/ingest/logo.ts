import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { USER_AGENT } from "./adapter.js";
import { icoToPng } from "./ico.js";

/**
 * 회사 사이트에서 마크를 한 장 받아 온다.
 *
 * 화면에 회사 로고를 세우려면 어딘가에서 그림을 얻어야 하는데, 우리가 쓰는
 * ATS는 주지 않는다 — Greenhouse의 `/v1/boards/{token}`은 `{name, content}`뿐이다.
 * 그래서 **회사가 자기 사이트에 걸어 둔 아이콘**을 받는다. 브라우저 탭과
 * 홈 화면에 쓰라고 회사가 직접 올려 둔 그림이다.
 *
 * ## 링크하지 않고 받아 두는 이유
 *
 * 화면에서 회사 서버를 그대로 링크하면 **보는 사람의 IP가 그 회사로 간다.**
 * 우리가 한 번 받아 두면 나가는 것은 우리 서버뿐이고, 상대가 경로를 바꿔도
 * 화면이 조용히 깨지지 않는다.
 *
 * ## 문을 닫아 둔 곳은 그냥 못 받는다
 *
 * 우리는 `ExpressoBot`이라고 밝히고 요청한다(`USER_AGENT`). 막고 싶은 쪽이
 * 막을 수 있어야 하기 때문이다. 그래서 봇 문을 닫아 둔 사이트에서는 그림 대신
 * 챌린지 페이지가 오는데, **그건 실패로 남기고 끝낸다.** 브라우저인 척해서
 * 통과할 방법을 찾지 않는다.
 *
 * ## 쿠팡을 어디까지 두드려 봤나
 *
 * 공고 108건으로 가장 많은 회사라 따로 재 봤다. 결론은 **받아 올 길이 없어서
 * 파일을 넣어 뒀다**이고(`BundledMarkReader`), 다음에 누가 다시 파 보지 않도록
 * 재 본 것을 적어 둔다.
 *
 * - `coupang.jobs`의 robots.txt는 `Allow: /`이고 우리에게 200을 준다. 막는 것은
 *   robots가 아니라 Cloudflare 챌린지고, HTML 문서 요청에만 걸린다.
 *   정적 파일 중 열린 것은 `robots.txt` · `sitemap.xml` · `favicon.ico`뿐이며
 *   그 파비콘은 16×16이다. 나머지 관례 경로는 404 아니면 챌린지다.
 * - `coupang.com`은 Akamai가 robots.txt까지 403으로 막는다.
 * - Greenhouse 보드 페이지는 `coupang.jobs`로 302를 보내고, 보드 API의
 *   `content`는 빈 문자열이다.
 * - `news.coupang.com`(뉴스룸)은 200을 준다. **256×256 ICO**가 있어 PNG로
 *   옮기는 것까지 됐는데(`ico.ts`), 그 그림이 `coupang`과 `newsroom`을 두 줄로
 *   쌓은 워드마크라 18~30px에서 뭉갠다. 그래서 그건 안 쓰고, 같은 뉴스룸이
 *   내주는 **브랜드 워드마크**를 손질해 저장소에 넣어 뒀다.
 */

export interface CompanyMark {
  bytes: Buffer;
  mediaType: "image/png";
  /** 정확히 어느 주소에서 받았는지. 근거 없는 로고는 만들지 않는다. */
  sourceUrl: string;
  checksum: string;
}

export interface MarkReader {
  read(siteUrl: string): Promise<CompanyMark | null>;
}

/**
 * 저장소에 넣어 둔 마크를 먼저 본다.
 *
 * 받아 올 수 없는 회사가 있다(쿠팡). 그런 곳은 사람이 한 번 파일을 넣어 두는데,
 * **DB에 직접 꽂아 두면 그 사람의 기계에만 있다** — 배포하거나 남이 받아 가면
 * 사라진다. 그래서 파일을 저장소에 두고 수집이 집어간다.
 *
 * 네트워크보다 먼저 본다. 넣어 둔 것이 있다는 건 그 도메인에서 못 받았다는
 * 뜻이라, 다시 두드릴 이유가 없다.
 *
 * 파일 이름이 곧 `company.domain`이다. `assets/company-marks/README.md`.
 */
export class BundledMarkReader implements MarkReader {
  readonly #next: MarkReader | null;
  readonly #directory: string;

  constructor(next: MarkReader | null = null, directory = MARK_DIRECTORY) {
    this.#next = next;
    this.#directory = directory;
  }

  async read(siteUrl: string): Promise<CompanyMark | null> {
    const site = publicUrl(siteUrl);
    if (site) {
      const file = join(this.#directory, `${site.hostname}.png`);
      // 이름을 주소에서 뽑되 경로 문자는 파일 이름에 들어올 수 없다 — 호스트명은
      // `/`도 `..`도 담지 못한다(URL이 이미 그렇게 갈라 놓는다).
      const bytes = await readFile(file).catch(() => null);
      if (bytes && pngSize(bytes)) {
        return {
          bytes,
          mediaType: "image/png",
          sourceUrl: `file:company-marks/${site.hostname}.png`,
          checksum: createHash("sha256").update(bytes).digest("hex"),
        };
      }
    }
    return this.#next ? this.#next.read(siteUrl) : null;
  }
}

/** `services/backend/assets/company-marks`. 빌드 산출물이 아니라 소스 옆이다. */
const MARK_DIRECTORY = fileURLToPath(new URL("../../../../assets/company-marks", import.meta.url));

/** 아바타로 쓸 수 있는 최소 크기. 파비콘 16·32는 24px 원 안에서도 뭉갠다. */
const MIN_PIXELS = 64;
/** 아이콘 한 장이 이보다 크면 아이콘이 아니다. */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 15_000;
/** 리디렉트를 우리가 따라간다. 한 칸씩 주소를 다시 검사하기 위해서다. */
const MAX_HOPS = 3;

export class SiteMarkReader implements MarkReader {
  async read(siteUrl: string): Promise<CompanyMark | null> {
    const site = publicUrl(siteUrl);
    if (!site) return null;

    for (const candidate of await this.#candidates(site)) {
      const mark = await this.#fetchMark(candidate);
      if (mark) return mark;
    }
    return null;
  }

  /**
   * 받아 볼 주소를 좋은 순서로 늘어놓는다.
   *
   * 회사가 `<link rel="...icon">`으로 걸어 둔 것이 먼저다. 거기 적힌 `sizes`가
   * 큰 것부터 본다 — 홈 화면용 아이콘(180~512px)이 보통 가장 깨끗한 정사각
   * 마크다. HTML을 못 읽으면 관례 주소로 두드려 본다.
   */
  async #candidates(site: URL): Promise<URL[]> {
    const found = await this.#iconLinks(site);
    const fallbacks = ["/apple-touch-icon.png", "/favicon.ico"]
      .map((path) => publicUrl(new URL(path, site).href))
      .filter((url): url is URL => url !== null);
    return [...found, ...fallbacks];
  }

  async #iconLinks(site: URL): Promise<URL[]> {
    const html = await this.#fetchText(site);
    if (html === null) return [];

    const links: { url: URL; score: number }[] = [];
    for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
      const rel = attribute(tag[0], "rel");
      if (rel === null || !/\bicon\b/i.test(rel)) continue;
      const href = attribute(tag[0], "href");
      if (href === null) continue;
      let resolved: URL | null;
      try {
        resolved = publicUrl(new URL(href, site).href);
      } catch {
        continue;
      }
      if (resolved === null) continue;
      links.push({ url: resolved, score: declaredSize(attribute(tag[0], "sizes")) });
    }
    return links.sort((left, right) => right.score - left.score).map((link) => link.url);
  }

  async #fetchText(url: URL): Promise<string | null> {
    const response = await hop(url, "text/html");
    if (!response || !response.ok) return null;
    if (!/text\/html/i.test(response.headers.get("content-type") ?? "")) return null;
    return await response.text();
  }

  async #fetchMark(url: URL): Promise<CompanyMark | null> {
    const response = await hop(url, "image/png,image/*");
    if (!response || !response.ok) return null;

    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length === 0 || raw.length > MAX_BYTES) return null;
    // **글자가 아니라 바이트로 판정한다.** `content-type`도 확장자도 믿지
    // 않는다 — krafton.ai의 `/favicon.ico`는 실제로 PNG고, 봇 문이 닫힌 곳은
    // `image/png`를 달고 HTML 챌린지를 준다.
    //
    // PNG가 아니면 ICO인지 한 번 더 본다. 큰 마크를 `.ico`로만 걸어 둔 회사가
    // 있다 — 쿠팡 뉴스룸의 것이 256×256이다.
    const bytes = pngSize(raw) ? raw : icoToPng(raw);
    if (bytes === null) return null;
    const size = pngSize(bytes);
    if (size === null) return null;
    if (Math.min(size.width, size.height) < MIN_PIXELS) return null;

    return {
      bytes,
      mediaType: "image/png",
      sourceUrl: url.href,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}

/**
 * 리디렉트를 한 칸씩 따라가며 **매번 주소를 다시 검사한다.**
 *
 * `fetch`에 맡기면 첫 주소만 공개 주소인지 보고, 그 뒤에 사설 주소로 튕겨도
 * 우리가 모른다. 출처 설정은 인증만 있으면 누구나 쓸 수 있어서
 * (`POST /job-sources`에 아직 관리자 구분이 없다) 이 문을 열어 둘 수 없다.
 */
async function hop(start: URL, accept: string): Promise<Response | null> {
  let url = start;
  for (let step = 0; step < MAX_HOPS; step += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { accept, "user-agent": USER_AGENT },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (location === null) return null;
    let next: URL | null;
    try {
      next = publicUrl(new URL(location, url).href);
    } catch {
      return null;
    }
    if (next === null) return null;
    url = next;
  }
  return null;
}

/**
 * 공개된 https 주소인가.
 *
 * https만 받고, 우리 안쪽을 가리키는 이름은 거른다. 사설 대역과
 * 링크 로컬(169.254.169.254는 클라우드 메타데이터 주소다)이 여기 걸린다.
 */
export function publicUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  // 이름이 아니라 숫자로 온 주소는 대역을 본다.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
    if (a === 169 && b === 254) return null;
    if (a >= 224) return null;
  }
  if (host.includes(":")) return null; // IPv6 리터럴은 받지 않는다
  if (!host.includes(".")) return null;
  return url;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? null) : null;
}

/** `sizes="512x512"` 중 가장 큰 변. 안 적혀 있으면 0이다. */
function declaredSize(sizes: string | null): number {
  if (sizes === null) return 0;
  let best = 0;
  for (const match of sizes.matchAll(/(\d+)\s*[x×]\s*(\d+)/gi)) {
    best = Math.max(best, Number(match[1]), Number(match[2]));
  }
  return best;
}

/**
 * PNG인지 보고, 맞으면 크기를 읽는다.
 *
 * 서명 8바이트 뒤에 바로 IHDR가 오고 거기 폭·높이가 빅엔디안 4바이트씩 있다.
 * PNG가 아니면 null이다 — 그것이 곧 형식 판정이다.
 */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24) return null;
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
