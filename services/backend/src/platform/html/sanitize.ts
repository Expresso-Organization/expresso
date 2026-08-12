import {
  PAGE_ALLOWED_LINK_RELS,
  PAGE_ALLOWED_INPUT_TYPES,
  PAGE_ALLOWED_LINK_SCHEMES,
  PAGE_ALLOWED_STYLESHEET_HOSTS,
  PAGE_ALLOWED_SVG_TAGS,
  PAGE_ALLOWED_TAGS,
  PAGE_CSS_FORBIDDEN,
  PAGE_CSS_URL_ALLOWED,
  PAGE_GLOBAL_ATTRIBUTES,
  PAGE_IMAGE_SRC_PREFIX,
  PAGE_TAG_ATTRIBUTES,
} from "@expresso/contracts";
import sanitizeHtml from "sanitize-html";

/**
 * 모델이 쓴 지면을 방문자에게 내보내도 되는 모양으로 만든다.
 *
 * **이건 예의가 아니라 방어선이다.** 지면의 재료에는 사용자가 쓴 기록만 있는 게
 * 아니라 **바깥에서 긁어 온 공고문**이 섞여 있다. 거기 `<img onerror=…>`가
 * 적혀 있으면 모델은 그걸 성실히 옮기고, 우리는 그 지면을 공개 주소에 건다.
 *
 * 방식은 허용 목록이다 — 나쁜 것을 찾아 지우는 게 아니라 **아는 것만 남긴다.**
 * 목록에 없는 태그와 속성은 이유를 묻지 않고 떨어지므로, 새로 나온 공격 모양을
 * 우리가 미리 알 필요가 없다.
 */

export class PageSanitizeError extends Error {
  /** 모델에게 되돌려 줄 사유. 재시도 프롬프트가 이 문장을 그대로 쓴다. */
  readonly reason: string;

  constructor(reason: string) {
    super(`지면이 소독을 통과하지 못했습니다: ${reason}`);
    this.name = "PageSanitizeError";
    this.reason = reason;
  }
}

export interface SanitizedPage {
  html: string;
  css: string;
  /**
   * 지워진 것들. **비어 있어야 정상이다** — 뭔가 지워졌다면 프롬프트가 모델에게
   * 규칙을 제대로 못 가르쳤다는 뜻이고, 지면에는 모델이 의도한 무언가가 빠져 있다.
   */
  removed: string[];
}

/** SVG 태그 전부에 같은 표현 속성 묶음을 붙인다. */
function svgAttributes(): Record<string, string[]> {
  const shared = [...(PAGE_TAG_ATTRIBUTES["*svg"] ?? [])];
  const entries = PAGE_ALLOWED_SVG_TAGS.map((tag) => [
    tag,
    tag === "svg" ? [...(PAGE_TAG_ATTRIBUTES["svg"] ?? []), ...shared] : shared,
  ] as const);
  return Object.fromEntries(entries);
}

function allowedAttributes(): Record<string, string[]> {
  const perTag: Record<string, string[]> = {};
  for (const [tag, attributes] of Object.entries(PAGE_TAG_ATTRIBUTES)) {
    if (tag.startsWith("*")) continue;
    perTag[tag] = [...attributes];
  }
  return {
    "*": [...PAGE_GLOBAL_ATTRIBUTES],
    ...perTag,
    ...svgAttributes(),
  };
}

/** 우리가 내보내는 자산인가. 바깥 주소는 전부 아니다. */
function allowedImageSrc(value: string): boolean {
  return value.startsWith(PAGE_IMAGE_SRC_PREFIX);
}

/** `srcset`은 주소가 여럿이다. 하나라도 바깥이면 통째로 버린다. */
function allowedSrcSet(value: string): boolean {
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean)
    .every(allowedImageSrc);
}

/**
 * 서체 스타일시트만 통과시킨다.
 *
 * 스타일시트는 스크립트를 실행하지 못하고, 호스트는 목록으로 묶여 있다. 그래도
 * `rel`을 함께 보는 이유는 문서를 끌어오는 rel이 따로 있어서다.
 */
function allowedStylesheet(rel: string | undefined, href: string | undefined): boolean {
  if (!rel || !href) return false;
  const rels = rel.split(/\s+/).filter(Boolean);
  if (!rels.every((value) => (PAGE_ALLOWED_LINK_RELS as readonly string[]).includes(value))) {
    return false;
  }
  try {
    const { protocol, hostname } = new URL(href);
    return protocol === "https:"
      && (PAGE_ALLOWED_STYLESHEET_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}

function allowedHref(value: string): boolean {
  const trimmed = value.trim();
  // 같은 지면 안의 앵커. 섹션 인덱스가 이걸로 움직인다.
  if (trimmed.startsWith("#")) return true;
  try {
    const { protocol } = new URL(trimmed);
    return (PAGE_ALLOWED_LINK_SCHEMES as readonly string[])
      .includes(protocol.replace(":", ""));
  } catch {
    // 상대 주소. 우리 자산 경로만 허용한다.
    return allowedImageSrc(trimmed);
  }
}

/**
 * `url(...)`이 가리키는 곳을 본다.
 *
 * 인라인 `style` 속성과 `<style>` CSS가 같은 규칙을 지난다 — 한쪽만 막으면
 * 다른 쪽으로 그대로 나간다.
 */
function scrubUrls(css: string, removed: string[]): string {
  return css.replaceAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _quote, target: string) => {
    const value = target.trim();
    if (PAGE_CSS_URL_ALLOWED.some((allowed) => allowed.test(value))) return whole;
    removed.push(`url(${value.slice(0, 60)})`);
    return "none";
  });
}

/**
 * CSS를 본다.
 *
 * 소독기는 마크업만 보고 `<style>` 안은 글자로 지나친다. 그래서 CSS는 여기서
 * 따로 받는다. 금지 구문은 **지우지 않고 거절한다** — 요즘 CSS에 나올 이유가
 * 없는 것들이라, 나왔다면 조용히 고칠 게 아니라 다시 뽑는 편이 맞다.
 */
export function sanitizeCss(css: string): { css: string; removed: string[] } {
  for (const { pattern, reason } of PAGE_CSS_FORBIDDEN) {
    if (pattern.test(css)) throw new PageSanitizeError(`CSS에 ${reason}`);
  }
  const removed: string[] = [];
  return { css: scrubUrls(css, removed), removed };
}

export function sanitizePage(draft: { html: string; css: string }): SanitizedPage {
  const removed: string[] = [];
  const { css, removed: cssRemoved } = sanitizeCss(draft.css);
  removed.push(...cssRemoved);

  // 허용 목록이 떨군 **속성**은 sanitize-html이 알려주지 않는다. 그래서 지우기
  // 전과 후의 속성 이름을 견줘 따로 센다 — 안 그러면 `removed`가 "없음"이라고
  // 거짓말을 하고, 모델이 쓴 것이 조용히 사라진 줄 아무도 모른다.
  const before = attributeNames(draft.html);

  const html = sanitizeHtml(draft.html, {
    allowedTags: [...PAGE_ALLOWED_TAGS, ...PAGE_ALLOWED_SVG_TAGS],
    allowedAttributes: allowedAttributes(),
    // SVG 표현 속성은 대소문자를 가린다 — `viewBox`가 `viewbox`가 되면 안 그려진다.
    allowedSchemes: [...PAGE_ALLOWED_LINK_SCHEMES],
    // 상대 주소만 허용한다. 아래 transform이 접두어까지 확인한다.
    allowedSchemesByTag: { img: [], source: [] },
    parser: { lowerCaseAttributeNames: false },
    // 목록에 없는 태그는 껍데기만 벗기고 **글은 남긴다** — 모델이 `<article>`
    // 대신 모르는 태그를 써도 문장이 사라지지는 않는다.
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs };
        if (next["href"] !== undefined && !allowedHref(next["href"])) {
          removed.push(`href=${next["href"].slice(0, 60)}`);
          delete next["href"];
        }
        // 바깥으로 나가는 주소는 여는 쪽 탭을 넘기지 않는다.
        if (next["target"] === "_blank") next["rel"] = "noopener noreferrer";
        return { tagName, attribs: next };
      },
      link: (tagName, attribs) => {
        if (allowedStylesheet(attribs["rel"], attribs["href"])) return { tagName, attribs };
        removed.push(`link rel=${attribs["rel"] ?? "?"} href=${(attribs["href"] ?? "").slice(0, 50)}`);
        // 이름을 지우면 태그가 통째로 떨어진다.
        return { tagName: "", attribs: {} };
      },
      input: (tagName, attribs) => {
        const type = (attribs["type"] ?? "").toLowerCase();
        if ((PAGE_ALLOWED_INPUT_TYPES as readonly string[]).includes(type)) {
          return { tagName, attribs };
        }
        // 켜고 끄는 것 말고는 없다. 글자를 받는 칸은 여기서 사라진다.
        removed.push(`input type=${type || "?"}`);
        return { tagName: "", attribs: {} };
      },
      img: (tagName, attribs) => cleanMedia(tagName, attribs, removed),
      source: (tagName, attribs) => cleanMedia(tagName, attribs, removed),
    },
  });

  // 인라인 style 속성도 CSS다. 같은 잣대를 댄다.
  const guarded = html.replaceAll(/style="([^"]*)"/gi, (whole, value: string) => {
    for (const { pattern, reason } of PAGE_CSS_FORBIDDEN) {
      if (pattern.test(value)) {
        removed.push(`style 속성 — ${reason}`);
        return "";
      }
    }
    const scrubbed = scrubUrls(value, removed);
    return scrubbed === value ? whole : `style="${scrubbed}"`;
  });

  for (const name of before) {
    if (!attributeNames(guarded).has(name)) removed.push(`속성 ${name}`);
  }

  return { html: guarded, css, removed };
}

/** 마크업에 쓰인 속성 이름들. 값이 아니라 이름만 본다. */
function attributeNames(html: string): Set<string> {
  const names = new Set<string>();
  for (const [, attributes] of html.matchAll(/<[a-zA-Z][\w-]*([^>]*)>/g)) {
    for (const [, name] of (attributes ?? "").matchAll(/\s([a-zA-Z_:][\w:.-]*)\s*=/g)) {
      if (name) names.add(name.toLowerCase());
    }
  }
  return names;
}

function cleanMedia(
  tagName: string,
  attribs: Record<string, string>,
  removed: string[],
): { tagName: string; attribs: Record<string, string> } {
  const next: Record<string, string> = { ...attribs };
  if (next["src"] !== undefined && !allowedImageSrc(next["src"])) {
    removed.push(`src=${next["src"].slice(0, 60)}`);
    delete next["src"];
  }
  if (next["srcset"] !== undefined && !allowedSrcSet(next["srcset"])) {
    removed.push(`srcset=${next["srcset"].slice(0, 60)}`);
    delete next["srcset"];
  }
  return { tagName, attribs: next };
}
