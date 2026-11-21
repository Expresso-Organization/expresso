import type { AgentMessage } from "@expresso/contracts";

import { decodeHtmlEntities } from "../../platform/html/entities.js";
import { htmlToText } from "../../platform/html/markdown.js";
import { fetchPublicPage, PublicPageError, type PublicPage } from "../../platform/web/public-page.js";

/**
 * 사용자가 대화에 적은 링크를 에이전트 대신 읽는다.
 *
 * 읽을 수 있는 주소는 사용자 메시지에 적힌 것뿐이다. 페이지 글은 남이 쓴 글이라 「이 주소를 열어라」 같은
 * 지시가 들어 있을 수 있는데, 에이전트는 기록을 읽는 도구도 쥐고 있다 — 아무 주소나 열게 두면 기록 내용이
 * 쿼리스트링에 실려 나간다. 페이지 안의 링크도 따라가지 않는다.
 */

/** 링크 하나에서 에이전트에게 넘기는 글의 끝. 기록을 보강할 사실을 찾기에 넉넉하고, 실행 한 번의 토큰을 지킨다. */
const MAX_TEXT = 12_000;
/** 이보다 짧으면 읽을 글이 없는 페이지다 — 로그인 벽이나 자바스크립트로만 그리는 화면. */
const MIN_TEXT = 80;
const READABLE_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "text/markdown"];
const USER_AGENT = "ExpressoBot/0.1 (+https://expresso.ai.kr/bot)";

/** 문장에 붙여 쓴 주소 끝의 문장부호 · 닫는 괄호는 주소가 아니다. */
const TRAILING = /[.,;:!?'"’”)\]}>」』〉》]+$/;
/**
 * 스킴이 있는 주소, 또는 `www.`나 `github.com/`으로 시작하는 주소. 공백 · 따옴표 · 꺾쇠 · 한글에서 끊는다 —
 * 「github.com/me/api도요」처럼 주소 뒤에 말을 붙여 쓴다. 브라우저에서 복사한 주소의 한글은 `%EB…`로 온다.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.|github\.com\/)[^\s<>"'「」『』\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]+/gi;

/** 비교할 수 있게 주소를 한 모양으로 만든다. 주소가 아니면 null. */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim().replace(TRAILING, "");
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    // 끝의 `/`는 모델이 붙였다 뗐다 한다. 같은 주소로 본다.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return null;
  }
}

/** 이 대화의 사용자 메시지에 적힌 주소. */
export function linksInMessages(messages: readonly AgentMessage[]): Set<string> {
  const links = new Set<string>();
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const match of message.text.matchAll(URL_PATTERN)) {
      const link = normalizeLink(match[0]);
      if (link) links.add(link);
    }
  }
  return links;
}

export interface LinkPage {
  /** 리다이렉트를 따라간 끝 주소. */
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  /** 본문을 `MAX_TEXT`에서 잘랐는가. */
  truncated: boolean;
}

/** 에이전트에게 돌려줄 실패 사유. 다음 행동(주소만 남기고 사용자에게 묻기)이 같아 문장 하나로 모은다. */
export class LinkReadError extends Error {}

export type FetchPage = (url: string) => Promise<PublicPage>;

const fetchPage: FetchPage = url => fetchPublicPage(url, {
  userAgent: USER_AGENT,
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
  maxBytes: 2_000_000,
  timeoutMs: 12_000,
  maxRedirects: 3,
});

export async function readLinkPage(url: string, fetcher: FetchPage = fetchPage): Promise<LinkPage> {
  let page: PublicPage;
  try {
    page = await fetcher(url);
  } catch (error) {
    if (!(error instanceof PublicPageError)) throw error;
    throw new LinkReadError(FAILURE_TEXT[error.failure] ?? `페이지를 읽지 못했습니다(${error.message}).`);
  }
  const type = page.contentType.split(";")[0]!.trim().toLowerCase();
  if (type && !READABLE_TYPES.includes(type)) throw new LinkReadError(`글 페이지가 아닙니다(${type}). PDF · 이미지 · 동영상은 읽지 않습니다.`);
  const html = type === "text/plain" || type === "text/markdown" ? null : page.body;
  const text = (html === null ? page.body : readableText(html)).replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < MIN_TEXT) throw new LinkReadError("읽을 글이 거의 없습니다. 로그인이 필요하거나 자바스크립트로만 그리는 페이지일 수 있습니다.");
  return {
    url: page.finalUrl,
    title: html === null ? null : metaTitle(html),
    description: html === null ? null : metaDescription(html),
    text: text.slice(0, MAX_TEXT),
    truncated: text.length > MAX_TEXT,
  };
}

const FAILURE_TEXT: Partial<Record<PublicPageError["failure"], string>> = {
  "blocked": "페이지가 읽기를 막았습니다(로그인이 필요하거나 봇을 막는 페이지).",
  "private address": "내부 주소라 읽지 않습니다.",
  "private host": "내부 주소라 읽지 않습니다.",
  "host does not resolve": "없는 주소입니다.",
  "could not reach the page": "페이지에 닿지 못했습니다.",
  "invalid URL": "주소 모양이 아닙니다.",
  "unsupported scheme": "http · https 주소만 읽습니다.",
};

/**
 * 페이지에서 읽을 곳만 남긴다.
 *
 * 본문은 `<article>`이 넉넉하면 그것, 아니면 `<main>`, 그것도 아니면 `<body>`다. 좁은 쪽을 먼저 본다 —
 * `<main>`은 `<article>`을 감싸 늘 더 길다. GitHub 저장소 페이지는 `<main>`에 파일 목록 · 브랜치 메뉴가 함께 있고
 * README가 `<article>`이다(실측: next.js 저장소의 `<main>` 4,691자 가운데 앞이 파일 목록).
 */
function readableText(html: string): string {
  const stripped = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  for (const tag of ["article", "main"]) {
    const texts = [...stripped.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map(match => plain(match[1] ?? ""));
    const best = texts.sort((left, right) => right.length - left.length)[0] ?? "";
    if (best.length >= MIN_CONTAINER) return best;
  }
  return plain(/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(stripped)?.[1] ?? stripped);
}
/** 이보다 짧은 `<article>` · `<main>`은 본문이 아니라 카드 한 장이다. */
const MIN_CONTAINER = 400;

/**
 * 평문으로 옮기고 그림 · 빈 링크의 마크다운 찌꺼기를 걷는다. `htmlToText`는 글이 있는 링크만 글로 바꾸므로
 * `![](…)` · `[](…)`가 남는다(실측: tistory 첫 화면 앞 1,000자가 썸네일 주소였다). 모델의 토큰을 아끼고 인용을 깨끗하게 한다.
 */
function plain(html: string): string {
  // 그림은 HTML에서 먼저 뺀다. `htmlToText`가 `![alt](주소)`의 링크 부분만 글로 바꿔 「!alt」가 남는다.
  return htmlToText(html.replace(/<(img|source)\b[^>]*>/gi, ""))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\s*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // 겹친 링크를 풀고 남은 짝 없는 꼬리 `](주소)`.
    .replace(/!?\]\([^)\s]*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function meta(html: string, names: readonly string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, "property") ?? attribute(tag, "name"))?.toLowerCase();
    const content = attribute(tag, "content");
    if (key && names.includes(key) && content?.trim()) return decodeHtmlEntities(content).trim().slice(0, 500);
  }
  return null;
}

function metaTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const value = title ? decodeHtmlEntities(title).replace(/\s+/g, " ").trim() : "";
  return value ? value.slice(0, 300) : meta(html, ["og:title"]);
}

function metaDescription(html: string): string | null {
  return meta(html, ["og:description", "description"]);
}
