import { assertPublicHost, BlockedUrlError } from "../net/public-url.js";

/**
 * 사용자가 준 주소 한 건을 서버가 대신 읽는다.
 *
 * 크롤러가 아니다 — 목록을 따라가지 않고 저장하지 않는다. 사용자가 준 주소를 서버가 부르므로
 * 우리 안쪽(사설 주소 · localhost · 클라우드 메타데이터)으로 들어오지 못하게 매 홉마다 막는다.
 * 리다이렉트는 우리가 따라가며 다시 검사한다.
 *
 * 검사와 실제 연결 사이에 DNS가 바뀌는 경우(DNS rebinding)는 막지 못한다.
 */

export type PublicPageFailure =
  | "invalid URL" | "unsupported scheme" | "private address" | "private host" | "host does not resolve"
  | "could not reach the page" | "redirect without location" | "too many redirects" | "blocked" | "http error";

export class PublicPageError extends Error {
  /** HTTP 오류일 때 페이지가 돌려준 상태. */
  constructor(readonly failure: PublicPageFailure, readonly status?: number) {
    super(status ? `page returned HTTP ${status}` : failure);
    this.name = "PublicPageError";
  }
}

export interface PublicPageOptions {
  userAgent: string;
  accept: string;
  /** 넘으면 거기까지만 읽는다. */
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}

export interface PublicPage {
  body: string;
  finalUrl: string;
  /** 응답의 `content-type`. 없으면 빈 글. */
  contentType: string;
}

export async function fetchPublicPage(rawUrl: string, options: PublicPageOptions): Promise<PublicPage> {
  let current = rawUrl;
  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      throw new PublicPageError("invalid URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new PublicPageError("unsupported scheme");
    try { await assertPublicHost(url.hostname); }
    catch (error) {
      if (error instanceof BlockedUrlError) throw new PublicPageError(error.message as PublicPageFailure);
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, redirect: "manual", headers: { "user-agent": options.userAgent, accept: options.accept } });
    } catch {
      clearTimeout(timer);
      throw new PublicPageError("could not reach the page");
    }

    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new PublicPageError("redirect without location");
        current = new URL(location, url).toString();
        continue;
      }
      // 401 · 403은 로그인 벽이나 봇 차단이다. 다음 행동이 「내용을 직접 알려 달라」라서 다른 실패와 가른다.
      if (!response.ok) throw new PublicPageError(response.status === 403 || response.status === 401 ? "blocked" : "http error", response.status);

      const body = await readCapped(response, options.maxBytes);
      return { body, finalUrl: url.toString(), contentType: response.headers.get("content-type") ?? "" };
    } finally { clearTimeout(timer); }
  }
  throw new PublicPageError("too many redirects");
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}
