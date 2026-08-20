import { z } from "zod";

/**
 * 만들어지는 동안 보여 주는 것.
 *
 * 지면 생성은 한 번의 계약 호출이고, 그 호출은 `PageDraftSchema` 모양의 JSON
 * **하나**를 낸다. 그래서 "만들어지는 중"에 흐르는 것은 문서가 아니라
 * **끝나지 않은 JSON**이다 —
 *
 * ```
 * {"css":"body{margin:0}\n.hero{padd
 * ```
 *
 * 여기 있는 것은 그걸 읽는 도구다. **백엔드와 웹이 같은 파일을 본다** —
 * 흘려보내는 쪽과 그리는 쪽이 다르게 읽으면 화면에만 나타나는 버그가 되고,
 * 그건 재현이 어렵다.
 *
 * 프로바이더가 조각을 못 내면 이 경로는 **아무것도 흐르지 않는다.** 흉내 내지
 * 않는다(`AiClient.streams`).
 */

/** SSE 한 줄의 이름. 받는 쪽이 `switch`로 가르는 값이다. */
export const PAGE_STREAM_EVENTS = ["begin", "thinking", "delta", "done", "failed"] as const;
export type PageStreamEvent = (typeof PAGE_STREAM_EVENTS)[number];

export const PageStreamDeltaSchema = z.strictObject({
  /** 이번에 새로 온 글자. 받는 쪽이 이어 붙인다. */
  text: z.string(),
});

export const PageStreamDoneSchema = z.strictObject({
  /** 완성된 지면. 이게 오면 미리보기를 버리고 진짜를 연다. */
  pageId: z.string().uuid(),
});

export const PageStreamFailedSchema = z.strictObject({
  code: z.string().min(1).max(100),
});

/**
 * 조각을 이어 붙인 것에서 **지금까지 온 필드**를 꺼낸다.
 *
 * `JSON.parse`는 못 쓴다 — 버퍼는 거의 항상 문자열 한가운데서 끊겨 있다.
 * 그래서 앞에서부터 훑으며 **성한 데까지만** 읽는다. 끝나지 않은 필드도
 * 거기까지는 돌려준다. 그게 이 함수의 존재 이유다.
 *
 * 구조로 읽는다 — 정규식으로 `"html"`을 찾으면 **CSS 본문에 적힌 그 글자**를
 * 집는다. 지면 하나에 `content:"html"` 같은 것이 들어갈 이유는 얼마든지 있다.
 *
 * 값이 문자열인 납작한 객체만 본다. `PageDraftSchema`가 그 모양이고, 아니게
 * 되는 날에는 여기도 함께 고쳐야 한다.
 */
export function partialFields(buffer: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let at = skipSpace(buffer, 0);
  if (buffer[at] !== "{") return fields;
  at = skipSpace(buffer, at + 1);
  if (buffer[at] === "}") return fields;

  while (at < buffer.length) {
    if (buffer[at] !== '"') return fields;
    const key = readString(buffer, at);
    // 키가 끊긴 채로 끝났다 — 이 값이 무엇인지 아직 모른다.
    if (!key.closed) return fields;
    at = skipSpace(buffer, key.end);
    if (buffer[at] !== ":") return fields;
    at = skipSpace(buffer, at + 1);
    if (buffer[at] !== '"') return fields;

    const value = readString(buffer, at);
    fields[key.text] = value.text;
    if (!value.closed) return fields;
    at = skipSpace(buffer, value.end);
    if (buffer[at] === ",") {
      at = skipSpace(buffer, at + 1);
      continue;
    }
    return fields;
  }
  return fields;
}

/**
 * 그릴 수 있는 데까지만 자른다.
 *
 * 마지막 조각은 거의 언제나 태그 한가운데다 — `<div class="he`. 그대로 넣으면
 * 브라우저가 나머지 글자를 속성 이름으로 읽어 **다음 조각에서 지면이 통째로
 * 뒤집힌다.** 마지막으로 닫힌 `>` 뒤는 버린다.
 *
 * 여는 태그를 닫아 주지는 않는다. 안 닫힌 `<section>`은 브라우저가 알아서
 * 열어 둔 채로 그리고, 다음 조각이 오면 그만큼 자란다 — 스트리밍 HTML은
 * 원래 그렇게 그려진다.
 */
export function renderableHtml(html: string): string {
  const lastTag = html.lastIndexOf(">");
  const lastOpen = html.lastIndexOf("<");
  // 여는 꺾쇠가 뒤에 있으면 그 앞까지만 성한 것이다.
  if (lastOpen > lastTag) return html.slice(0, lastOpen);
  return html;
}

function skipSpace(source: string, from: number): number {
  let at = from;
  while (at < source.length && (source[at] === " " || source[at] === "\n"
    || source[at] === "\r" || source[at] === "\t")) at += 1;
  return at;
}

/**
 * `"`에서 시작하는 문자열을 읽는다.
 *
 * 끝을 못 만나면 **읽은 데까지** 돌려주고 `closed: false`를 단다. 끊긴 자리가
 * 이스케이프 한가운데(`\` 다음, 또는 `\u00`처럼 네 자리가 모자란 곳)면 그
 * 이스케이프는 통째로 버린다 — 반쪽짜리를 글자로 옮길 방법이 없다.
 */
function readString(source: string, from: number): { text: string; end: number; closed: boolean } {
  let out = "";
  let at = from + 1;
  while (at < source.length) {
    const char = source[at]!;
    if (char === '"') return { text: out, end: at + 1, closed: true };
    if (char !== "\\") {
      out += char;
      at += 1;
      continue;
    }
    const escape = source[at + 1];
    if (escape === undefined) break;
    if (escape === "u") {
      const hex = source.slice(at + 2, at + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      at += 6;
      continue;
    }
    out += UNESCAPE[escape] ?? escape;
    at += 2;
  }
  return { text: out, end: at, closed: false };
}

const UNESCAPE: Record<string, string> = {
  n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/",
};
