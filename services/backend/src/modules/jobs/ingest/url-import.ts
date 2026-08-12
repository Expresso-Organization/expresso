import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ImportedJobPostingSchema } from "@expresso/contracts";

import { JobMarketError } from "../errors.js";
import { htmlToText, USER_AGENT } from "./adapter.js";

/**
 * 주소 한 건으로 공고를 읽는다.
 *
 * 크롤러가 아니다 — 사용자가 이미 보고 있는 페이지를 서버가 한 번 대신 읽는다.
 * 채용 사이트를 훑지 않고, 목록을 따라가지 않고, 저장하지도 않는다.
 *
 * **읽은 것은 제안이지 사실이 아니다.** 돌려주기만 하고 저장은 사용자가 보고
 * 고친 뒤에 한다 — `job_posting.description_raw`는 한 번 넣으면 고칠 수 없고
 * (0002), 틀린 원문 위에서 뽑은 요건은 끝까지 틀린다.
 */

/** 사용자가 준 주소를 서버가 부른다 — 우리 안쪽으로 들어오지 못하게 막는다. */
const BLOCKED_V4 = [
  /^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value === "::"
      || value.startsWith("fc") || value.startsWith("fd")
      || value.startsWith("fe80") || value.startsWith("::ffff:");
  }
  return BLOCKED_V4.some((pattern) => pattern.test(address));
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new JobMarketError(422, "private address");
    return;
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new JobMarketError(422, "private host");
  }
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new JobMarketError(422, "host does not resolve");
  }
  if (records.length === 0) throw new JobMarketError(422, "host does not resolve");
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new JobMarketError(422, "private address");
  }
}

/** 1MB면 어떤 공고 페이지든 넘친다. 그보다 크면 우리가 읽을 것이 아니다. */
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 12_000;
/** 리다이렉트를 우리가 따라간다 — 매 홉마다 다시 검사해야 한다. */
const MAX_REDIRECTS = 3;

interface JsonLdJobPosting {
  "@type"?: unknown;
  title?: unknown;
  description?: unknown;
  employmentType?: unknown;
  validThrough?: unknown;
  hiringOrganization?: { name?: unknown } | unknown;
  jobLocation?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `@type`은 문자열일 수도 배열일 수도 있다(schema.org가 둘 다 허용한다). */
function isJobPosting(node: JsonLdJobPosting): boolean {
  const type = node["@type"];
  return type === "JobPosting"
    || (Array.isArray(type) && type.includes("JobPosting"));
}

/** `@graph` 안에 묻혀 있는 경우가 흔하다. 펴서 훑는다. */
function flatten(value: unknown, out: JsonLdJobPosting[] = []): JsonLdJobPosting[] {
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    const node = value as JsonLdJobPosting & { "@graph"?: unknown };
    out.push(node);
    if (node["@graph"]) flatten(node["@graph"], out);
  }
  return out;
}

function placeName(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return placeName(value[0]);
  if (value && typeof value === "object") {
    const place = value as { address?: unknown; name?: unknown };
    if (place.address && typeof place.address === "object") {
      const address = place.address as Record<string, unknown>;
      const parts = [address["addressRegion"], address["addressLocality"], address["streetAddress"]]
        .filter((one): one is string => typeof one === "string" && one.trim().length > 0);
      if (parts.length > 0) return parts.join(" ").slice(0, 120);
    }
    return text(place.name);
  }
  return null;
}

export class JobUrlImporter {
  async read(rawUrl: string) {
    const { html, finalUrl } = await this.#fetchPage(rawUrl);

    const structured = extractJsonLd(html);
    const bodyText = readableText(html);
    // JSON-LD의 description은 얕을 때가 많다(원티드 실측 46자). 더 긴 쪽이
    // 요건을 뽑을 근거가 된다 — 짧은 쪽을 고르면 분석이 아무것도 못 한다.
    const structuredBody = structured ? htmlToText(String(structured.description ?? "")) : "";
    const useStructuredBody = structuredBody.length >= bodyText.length;
    const description = useStructuredBody ? structuredBody : bodyText;

    if (description.length < 200) {
      throw new JobMarketError(422, "page has no readable posting text");
    }

    const organization = structured?.hiringOrganization;
    const companyName = organization && typeof organization === "object"
      ? text((organization as { name?: unknown }).name)
      : null;
    const validThrough = text(structured?.validThrough);
    const parsedValidThrough = validThrough ? new Date(validThrough) : null;

    return ImportedJobPostingSchema.parse({
      sourceUrl: finalUrl.slice(0, 2_000),
      companyName: companyName?.slice(0, 200) ?? null,
      title: text(structured?.title)?.slice(0, 300) ?? titleFromHtml(html),
      descriptionRaw: description.slice(0, 1_000_000),
      extractedFrom: structured && useStructuredBody ? "json-ld" : "page-body",
      employmentType: text(structured?.employmentType)?.slice(0, 60) ?? null,
      location: placeName(structured?.jobLocation),
      validThrough: parsedValidThrough && !Number.isNaN(parsedValidThrough.getTime())
        ? parsedValidThrough.toISOString()
        : null,
    });
  }

  async #fetchPage(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let url: URL;
      try {
        url = new URL(current);
      } catch {
        throw new JobMarketError(422, "invalid URL");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new JobMarketError(422, "unsupported scheme");
      }
      await assertPublicHost(url.hostname);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          redirect: "manual",
          headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        });
      } catch {
        throw new JobMarketError(502, "could not reach the page");
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new JobMarketError(502, "redirect without location");
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) {
        // 403은 봇 차단이다. 사용자에게는 "붙여넣어 주세요"가 다음 행동이다.
        throw new JobMarketError(
          response.status === 403 || response.status === 401 ? 422 : 502,
          `page returned HTTP ${response.status}`,
        );
      }

      const body = await readCapped(response);
      return { html: body, finalUrl: url.toString() };
    }
    throw new JobMarketError(422, "too many redirects");
  }
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** 페이지의 모든 `application/ld+json`에서 첫 JobPosting을 찾는다. */
export function extractJsonLd(html: string): JsonLdJobPosting | null {
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse((match[1] ?? "").trim());
    } catch {
      continue;
    }
    const found = flatten(parsed).find((node) => isJobPosting(node));
    if (found) return found;
  }
  return null;
}

/**
 * 페이지에서 **읽을 만한 곳**만 남긴다.
 *
 * `<body>`를 통째로 펴면 내비게이션과 푸터가 본문에 섞인다(실측: 원티드 공고를
 * 읽으니 "채용 · 이력서 · 교육·이벤트 · 콘텐츠 · 소셜"이 맨 앞에 왔다).
 * 요건 추출이 그 글에서 요건을 뽑으려 들면 공고에 없는 것이 요건이 된다.
 *
 * 완벽한 본문 추출을 하려는 것이 아니다 — 읽어 온 것은 **사용자가 보고 고친다.**
 * 껍데기를 덜어 내는 만큼 사용자가 덜 지운다.
 */
export function readableText(html: string): string {
  const stripped = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  // 본문 컨테이너가 있으면 그 안만 본다. 가장 긴 것을 고른다 —
  // `<main>`이 여러 개인 페이지에서 빈 것이 먼저 나오는 경우가 있다.
  const containers = [...stripped.matchAll(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => match[2] ?? "")
    .sort((left, right) => right.length - left.length);
  const chosen = containers[0];
  const text = htmlToText(chosen && chosen.length > 400 ? chosen : stripped);
  return text;
}

function titleFromHtml(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const value = match?.[1] ? htmlToText(match[1]).trim() : "";
  return value ? value.slice(0, 300) : null;
}
