import { DESIGN_TARGET_MAX_COUNT, DESIGN_TARGET_MAX_LENGTH, partialLeaves, type DesignSnippet } from "@expresso/contracts";
import { Parser } from "htmlparser2";

/**
 * 바뀌는 자리.
 *
 * 고치는 호출은 「이 글자를 이 글자로」 조각을 낸다. 조각의 「지금 있는 글자」가 첫 화면의 어디에 놓였는지를 보면
 * 어느 요소가 바뀌는지 알 수 있다. 화면은 그 요소를 청사진으로 보인다 — 고치는 동안에는 지금 첫 화면에서, 다 고친 뒤에는
 * 고친 첫 화면에서.
 *
 * 자리는 CSS 선택자로 낸다. 첫 화면은 스크립트가 막힌 틀 안에 그려져 바깥에서 요소를 고를 수 없고, 화면이 할 수 있는 일은
 * 문서에 CSS를 더하는 것뿐이다.
 * - CSS 조각은 그 글자가 든 규칙의 선택자다.
 * - 마크업 조각은 그 글자를 감싼 가장 안쪽 요소다. 클래스가 없는 요소도 가리키도록 `body`에서 내려가는 순서 경로로 적는다.
 *
 * 자리를 알아내지 못하면 빈 목록이다. 그때 화면은 강조 없이 기다린다 — 모르는 자리를 지어내지 않는다.
 */

type Source = Pick<DesignSnippet, "html" | "css">;
type Place = "css" | "html";
/** 글자 범위. 끝은 포함하지 않는다. 지운 자리는 길이가 0이다. */
type Range = readonly [start: number, end: number];

/** 마크업의 자리가 이보다 많으면 한 요소로 묶는다 — 같은 속성 값을 여러 요소에서 바꾸는 조각이 그렇다. */
const HTML_TARGET_MAX = 12;

export interface CssRule {
  selector: string;
  start: number;
  end: number;
}

/**
 * CSS에서 스타일 규칙의 선택자와 범위를 읽는다.
 *
 * `@media`처럼 규칙을 감싸는 묶음은 안으로 들어가고, `@keyframes` · `@font-face`처럼 요소를 고르지 않는 것은 건너뛴다.
 * 규칙 안에 중첩된 규칙은 바깥 규칙의 범위에 든다.
 */
export function cssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const stack: ("group" | "skip" | "rule" | "inner")[] = [];
  let prelude = 0;
  let open: { selector: string; start: number } | null = null;
  for (let at = 0; at < css.length; at += 1) {
    const char = css[at];
    if (char === "\\") at += 1;
    else if (char === "/" && css[at + 1] === "*") {
      const end = css.indexOf("*/", at + 2);
      at = end < 0 ? css.length : end + 1;
    } else if (char === '"' || char === "'") {
      at += 1;
      while (at < css.length && css[at] !== char) at += css[at] === "\\" ? 2 : 1;
    } else if (char === "{") {
      const head = css.slice(prelude, at);
      const parent = stack.at(-1);
      if (parent === "skip" || parent === "rule" || parent === "inner") stack.push("inner");
      else if (head.trimStart().startsWith("@")) stack.push(/^\s*@(?:media|supports|container|layer|scope)\b/i.test(head) ? "group" : "skip");
      else {
        stack.push("rule");
        open = { selector: head.replace(/\/\*[\s\S]*?\*\//g, "").trim(), start: prelude + (head.length - head.trimStart().length) };
      }
      prelude = at + 1;
    } else if (char === "}") {
      if (stack.pop() === "rule" && open) {
        rules.push({ ...open, end: at + 1 });
        open = null;
      }
      prelude = at + 1;
    } else if (char === ";" && (stack.length === 0 || stack.at(-1) === "group")) prelude = at + 1;
  }
  return rules;
}

/** 상태와 가상 요소. 떼어 내면 그 규칙이 꾸미는 요소가 남는다(`.a:hover` → `.a`, `.a::before` → `.a`). */
const TRANSIENT = /::?(?:before|after|first-line|first-letter|marker|placeholder|selection|hover|focus-visible|focus-within|focus|active|visited|link|target)\b/g;
/** 선택자에 올 수 있는 글자. 화면이 이 글자를 CSS 규칙에 그대로 넣으므로 규칙을 끊는 글자(`{` `}` `;` `<` `\` `/`)는 받지 않는다. */
const SELECTOR = /^[\w\s.#>+~:()[\]="'*^$|,-]+$/;

/** 선택자 목록을 맨 바깥 쉼표에서 나눈다. */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < list.length; at += 1) {
    const char = list[at];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(list.slice(from, at));
      from = at + 1;
    }
  }
  return [...parts, list.slice(from)];
}

function balanced(selector: string): boolean {
  let depth = 0;
  for (const char of selector) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0 && (selector.match(/"/g)?.length ?? 0) % 2 === 0 && (selector.match(/'/g)?.length ?? 0) % 2 === 0;
}

/** 규칙의 선택자를 화면이 쓸 수 있는 자리로 옮긴다. 쓸 수 없는 것은 버린다. */
function selectorTargets(selector: string): string[] {
  return splitSelectors(selector)
    .map((part) => part.replace(TRANSIENT, "").replace(/\s+/g, " ").trim())
    .filter((part) =>
      part.length > 0 && part.length <= DESIGN_TARGET_MAX_LENGTH && SELECTOR.test(part) && balanced(part)
      // 떼어 낸 뒤 결합자만 남은 것, 화면이 `:has()` 안에 넣을 수 없는 것.
      && !/^[>+~]|[>+~]$/.test(part) && !part.includes(":has("));
}

const overlaps = ([start, end]: Range, from: number, to: number) => start < to && Math.max(end, start + 1) > from;

function cssTargets(css: string, ranges: readonly Range[]): string[] {
  if (ranges.length === 0) return [];
  return cssRules(css).filter((rule) => ranges.some((range) => overlaps(range, rule.start, rule.end))).flatMap((rule) => selectorTargets(rule.selector));
}

interface Element {
  tag: string;
  start: number;
  end: number;
  parent: Element | null;
  children: Element[];
}

/**
 * 마크업을 요소 나무로 읽는다. 요소마다 여는 태그의 시작과 닫는 태그의 끝을 가진다.
 *
 * 첫 화면의 마크업은 소독기가 다시 쓴 것이라 태그가 빠짐없이 닫혀 있다. 브라우저가 스스로 요소를 끼워 넣는 자리
 * (`<table>` 바로 아래의 `<tr>`)에서는 순서 경로가 어긋나 그 자리가 강조되지 않는다.
 */
function elementTree(html: string): Element {
  const root: Element = { tag: "", start: 0, end: html.length, parent: null, children: [] };
  let current = root;
  const parser = new Parser({
    onopentag(tag) {
      const node: Element = { tag, start: parser.startIndex, end: html.length, parent: current, children: [] };
      current.children.push(node);
      current = node;
    },
    onclosetag() {
      if (!current.parent) return;
      current.end = parser.endIndex + 1;
      current = current.parent;
    },
  }, { decodeEntities: false });
  parser.write(html);
  parser.end();
  return root;
}

/**
 * 범위를 감싼 가장 안쪽 요소까지의 순서 경로. 맨 바깥(요소 밖)이면 빈 경로다.
 * svg 안으로는 들어가지 않는다 — 화면은 도형 하나가 아니라 그 그림 전체를 청사진으로 보인다. 막대 여덟 개를 하나씩 고치는
 * 조각이 이어져도 자리는 그림 하나로 남아, 조각이 올 때마다 화면이 다시 그려지지 않는다.
 */
function elementPath(root: Element, [start, end]: Range): number[] {
  const path: number[] = [];
  let node = root;
  for (;;) {
    // 길이가 없는 범위(지운 자리)가 요소의 경계에 닿아 있으면 그 요소의 밖이다.
    const index = node.children.findIndex((child) => (start === end ? child.start < start && child.end > end : child.start <= start && child.end >= end));
    if (index < 0) return path;
    path.push(index);
    node = node.children[index]!;
    if (node.tag === "svg") return path;
  }
}

/** 순서 경로를 선택자로 적는다. 깊어서 길이 상한을 넘으면 상한에 드는 바깥 요소까지만 적는다 — 그 요소가 바뀌는 자리를 감싼다. */
function pathSelector(path: readonly number[]): string {
  const steps = ["body", ...path.map((index) => `:nth-child(${index + 1})`)];
  while (steps.join(" > ").length > DESIGN_TARGET_MAX_LENGTH) steps.pop();
  return steps.join(" > ");
}

function htmlTargets(html: string, ranges: readonly Range[]): string[] {
  if (ranges.length === 0) return [];
  const root = elementTree(html);
  let paths = [...new Map(ranges.map((range) => elementPath(root, range)).map((path) => [path.join("."), path])).values()];
  if (paths.length > HTML_TARGET_MAX) {
    // 자리가 많으면 모두를 감싼 요소 하나로 묶는다.
    const first = paths[0]!;
    let shared = first.length;
    for (const path of paths) {
      let same = 0;
      while (same < shared && path[same] === first[same]) same += 1;
      shared = same;
    }
    paths = [first.slice(0, shared)];
  }
  return paths.map(pathSelector);
}

function occurrences(text: string, find: string): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + find.length)) found.push(at);
  return found;
}

/**
 * 대화에 적을 자리. 계약의 길이와 개수 상한 안에 든 것만 낸다 — 상한을 넘는 값이 한 번 저장되면 화면이 그 대화를 다시 읽지 못한다.
 */
const limited = (css: string[], html: string[]) => [...new Set([...html, ...css])].filter((target) => target.length > 0 && target.length <= DESIGN_TARGET_MAX_LENGTH).slice(0, DESIGN_TARGET_MAX_COUNT);

/** 지금 첫 화면에서 조각의 「지금 있는 글자」가 놓인 자리. 앞 조각을 적용해야 생기는 글자는 지금 첫 화면에 없어 건너뛴다. */
export function editingTargets(snippet: Source, finds: readonly { in: Place; find: string }[]): string[] {
  const ranges = (place: Place) => finds.filter((edit) => edit.in === place).flatMap(({ find }) => occurrences(snippet[place], find).map((at): Range => [at, at + find.length]));
  return limited(cssTargets(snippet.css, ranges("css")), htmlTargets(snippet.html, ranges("html")));
}

/**
 * 고친 첫 화면에서 조각이 바꿔 넣은 자리. 조각을 순서대로 적용하면서(`applyEdits`와 같은 방식 — 같은 글자는 모두 바꾼다)
 * 바꿔 넣은 글자의 범위를 따라간다. 뒤 조각이 앞을 밀면 앞의 범위도 함께 밀린다.
 */
export function revisedTargets(snippet: Source, edits: readonly { in: Place; find: string; replace: string }[]): string[] {
  const text = { css: snippet.css, html: snippet.html };
  const ranges: Record<Place, Range[]> = { css: [], html: [] };
  for (const edit of edits) {
    const found = occurrences(text[edit.in], edit.find);
    if (found.length === 0) continue;
    const delta = edit.replace.length - edit.find.length;
    const shift = (offset: number) => offset + delta * found.filter((at) => at + edit.find.length <= offset).length;
    ranges[edit.in] = [
      ...ranges[edit.in].map(([start, end]): Range => [shift(start), Math.max(shift(start), shift(end))]),
      ...found.map((at, index): Range => [at + index * delta, at + index * delta + edit.replace.length]),
    ];
    text[edit.in] = text[edit.in].split(edit.find).join(edit.replace);
  }
  return limited(cssTargets(text.css, ranges.css), htmlTargets(text.html, ranges.html));
}

/**
 * 쓰는 중인 출력에서 「지금 있는 글자」까지 다 온 조각을 읽는다. 출력은 끝나지 않은 JSON이라 `partialLeaves`로 읽는다.
 * 바꿔 넣을 글자(`replace`)는 기다리지 않는다 — 어디가 바뀌는지는 `find`만으로 안다.
 */
export function closedFinds(buffer: string): { in: Place; find: string }[] {
  const edits = new Map<number, { in?: Place; find?: string }>();
  for (const leaf of partialLeaves(buffer)) {
    const [head, index, key] = leaf.path;
    if (head !== "edits" || typeof index !== "number" || !leaf.closed) continue;
    const edit = edits.get(index) ?? {};
    if (key === "in" && (leaf.text === "css" || leaf.text === "html")) edit.in = leaf.text;
    if (key === "find" && leaf.text) edit.find = leaf.text;
    edits.set(index, edit);
  }
  return [...edits.values()].flatMap((edit) => (edit.in && edit.find ? [{ in: edit.in, find: edit.find }] : []));
}
