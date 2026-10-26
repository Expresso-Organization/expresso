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
export const PAGE_STREAM_EVENTS = ["begin", "thinking", "delta", "blueprint", "fill", "stage", "done", "failed"] as const;
export type PageStreamEvent = (typeof PAGE_STREAM_EVENTS)[number];

export const PageStreamDeltaSchema = z.strictObject({
  /** 이번에 새로 온 글자. 받는 쪽이 이어 붙인다. */
  text: z.string(),
});

/**
 * 설계가 끝나면 한 번 오는 청사진 문서.
 *
 * 최종 지면과 같은 구조로 그렸고, 글 자리는 `data-slot`(편집 패치와 같은 경로) 요소입니다. 받는 쪽은 이 문서를
 * 한 번 열고, 이후 `fill`은 그 요소의 글만 바꿉니다. 완성본은 지금처럼 `delta`로 옵니다.
 */
export const PageStreamBlueprintSchema = z.strictObject({
  html: z.string(),
  css: z.string(),
});

/** 칸 하나의 지금까지 쓴 글입니다. 조각이 아니라 그 칸의 전체 글이라, 가장 늦게 온 것만 반영하면 됩니다. */
export const PageStreamFillSchema = z.strictObject({
  path: z.string().min(1).max(200),
  text: z.string(),
  /** 그 칸을 다 썼는가. 블록 안의 칸이 모두 끝나면 블록에 디자인이 입혀집니다. */
  done: z.boolean(),
});

/** 설계가 먼저 오는 생성의 단계입니다. `filled` 뒤에는 모델 호출 없이 렌더와 측정만 남습니다. */
export const PAGE_STREAM_STAGES = ["designed", "filled", "rendered"] as const;
export type PageStreamStage = (typeof PAGE_STREAM_STAGES)[number];
export const PageStreamStageSchema = z.strictObject({
  name: z.enum(PAGE_STREAM_STAGES),
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

/** 끝나지 않은 JSON에서 읽은 글 값 하나입니다. */
export interface PartialJsonLeaf {
  path: readonly (string | number)[];
  text: string;
  /** 닫는 따옴표까지 왔는가. */
  closed: boolean;
}

/**
 * 조각을 이어 붙인 것에서 **지금까지 온 글 값**을 경로와 함께 꺼낸다.
 *
 * `partialFields`의 중첩판이다. 객체 · 배열 안의 문자열도 경로(`["sections", "a", "title"]`)로 돌려준다.
 * 숫자 · 참거짓은 글 칸이 아니라 건너뛴다. 끊긴 자리에서 멈추고, 그 앞까지 읽은 것을 돌려준다.
 */
export function partialLeaves(buffer: string): PartialJsonLeaf[] {
  const leaves: PartialJsonLeaf[] = [];
  readValue(buffer, { at: 0 }, [], leaves);
  return leaves;
}

/** 값 하나를 읽는다. 끝까지 읽었으면 `true`, 버퍼가 그 값 안에서 끊겼으면 `false`. */
function readValue(source: string, cursor: { at: number }, path: (string | number)[], leaves: PartialJsonLeaf[]): boolean {
  cursor.at = skipSpace(source, cursor.at);
  const char = source[cursor.at];
  if (char === undefined) return false;
  if (char === '"') {
    const value = readString(source, cursor.at);
    leaves.push({ path, text: value.text, closed: value.closed });
    cursor.at = value.end;
    return value.closed;
  }
  if (char === "{" || char === "[") {
    const object = char === "{";
    cursor.at = skipSpace(source, cursor.at + 1);
    if (source[cursor.at] === (object ? "}" : "]")) {
      cursor.at += 1;
      return true;
    }
    for (let index = 0; ; index += 1) {
      let key: string | number = index;
      if (object) {
        if (source[cursor.at] !== '"') return false;
        const name = readString(source, cursor.at);
        if (!name.closed) return false;
        cursor.at = skipSpace(source, name.end);
        if (source[cursor.at] !== ":") return false;
        cursor.at += 1;
        key = name.text;
      }
      if (!readValue(source, cursor, [...path, key], leaves)) return false;
      cursor.at = skipSpace(source, cursor.at);
      const next = source[cursor.at];
      if (next === ",") {
        cursor.at = skipSpace(source, cursor.at + 1);
        continue;
      }
      if (next === (object ? "}" : "]")) {
        cursor.at += 1;
        return true;
      }
      return false;
    }
  }
  LITERAL.lastIndex = cursor.at;
  const literal = LITERAL.exec(source);
  // 버퍼 끝에 닿은 숫자는 아직 자릿수가 더 올 수 있다.
  if (!literal || cursor.at + literal[0].length >= source.length) return false;
  cursor.at += literal[0].length;
  return true;
}

const LITERAL = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;

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
