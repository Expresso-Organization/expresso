import { readStructuredText, type StructuredPortfolioSnapshot } from "@expresso/contracts";
import { elementTextPaths, elementTitle, textPathLabel } from "@expresso/portfolio-renderer";

/**
 * 구조화 지면 이력(04c)의 계산. 두 판을 비교해 바뀐 요소와 요약을 내고, 판 하나의 변경만 무른다.
 *
 * 무르기는 세 판의 병합이다 — 무를 판의 앞 판(before), 무를 판(changed), 지금 판(current). 무를 판이 바꾼 칸마다 지금 값이
 * 무를 판의 값 그대로면 앞 판의 값으로 돌리고, 이미 앞 판의 값이면 둔다. 둘 다 아니면 그 뒤에 누가 또 고친 것이라 충돌이다.
 * 칸은 잎까지 내려간다. 수치 띠처럼 여러 섹션의 글을 보이는 요소의 편집과 사례 본문의 편집이 같은 섹션의 다른 칸이면 겹치지 않는다.
 */

type Snapshot = StructuredPortfolioSnapshot;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 키 순서와 무관하게 값이 같은가. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!sameValue(a[key], b[key])) return false;
    return true;
  }
  return false;
}

/** 원소가 모두 문자열 `id`를 가진 객체인 배열(빈 배열 포함). 이런 배열은 자리 대신 id로 맞춘다. */
function isIdArray(value: unknown): value is { id: string }[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === "string");
}

interface Merge {
  force: boolean;
  conflicts: string[];
}

/** id 배열의 병합. 지금 판의 순서를 지키고, 무를 판이 뺀 항목은 앞 판의 자리로 다시 넣는다. */
function mergeIdArray(before: { id: string }[], changed: { id: string }[], current: { id: string }[], path: string, merge: Merge): unknown[] {
  const find = (list: { id: string }[], id: string) => list.find((item) => item.id === id);
  const ids = current.map((item) => item.id);
  before.forEach((item, index) => {
    if (ids.includes(item.id)) return;
    // 앞 판에 있었는데 지금 없는 항목. 무를 판이 뺀 것이면 되살린다(아래 병합이 판정한다).
    const previous = before.slice(0, index).map((one) => one.id).filter((id) => ids.includes(id)).at(-1);
    ids.splice(previous === undefined ? 0 : ids.indexOf(previous) + 1, 0, item.id);
  });
  for (const item of changed) if (!ids.includes(item.id)) ids.push(item.id);
  const result: unknown[] = [];
  for (const id of ids) {
    const value = mergeValue(find(before, id), find(changed, id), find(current, id), `${path}/${id}`, merge);
    if (value !== undefined) result.push(value);
  }
  return result;
}

/** 요소의 자식 목록. 무를 판이 더한 키를 빼고, 뺀 키를 앞 판의 자리로 다시 넣는다. 순서만 바꾼 변경은 통째로 본다. */
function mergeChildren(before: string[], changed: string[], current: string[], path: string, merge: Merge): string[] {
  const added = changed.filter((key) => !before.includes(key));
  const removed = before.filter((key) => !changed.includes(key));
  if (!added.length && !removed.length) {
    // 순서만 바꿨다. 지금 판이 무를 판과 다르면 그 뒤에 또 바뀐 것이다.
    merge.conflicts.push(path);
    return merge.force ? before.filter((key) => current.includes(key)).concat(current.filter((key) => !before.includes(key))) : current;
  }
  const result = current.filter((key) => !added.includes(key));
  for (const key of removed) {
    if (result.includes(key)) continue;
    const index = before.indexOf(key);
    const previous = before.slice(0, index).filter((one) => result.includes(one)).at(-1);
    result.splice(previous === undefined ? 0 : result.indexOf(previous) + 1, 0, key);
  }
  return result;
}

function mergeValue(before: unknown, changed: unknown, current: unknown, path: string, merge: Merge): unknown {
  if (sameValue(changed, before)) return current;
  if (sameValue(current, changed)) return before;
  if (sameValue(current, before)) return current;
  if (isRecord(before) && isRecord(changed) && isRecord(current)) {
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(current), ...Object.keys(before), ...Object.keys(changed)])) {
      const value = mergeValue(before[key], changed[key], current[key], `${path}/${key}`, merge);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (path.endsWith("/children") && [before, changed, current].every((list) => Array.isArray(list) && list.every((key) => typeof key === "string"))) {
    return mergeChildren(before as string[], changed as string[], current as string[], path, merge);
  }
  if ([before, changed, current].every((list) => list === undefined || isIdArray(list)) && [before, changed, current].some((list) => isIdArray(list) && list.length > 0)) {
    return mergeIdArray((before ?? []) as { id: string }[], (changed ?? []) as { id: string }[], (current ?? []) as { id: string }[], path, merge);
  }
  if (Array.isArray(before) && Array.isArray(changed) && Array.isArray(current) && before.length === changed.length && changed.length === current.length) {
    return before.map((item, index) => mergeValue(item, changed[index], current[index], `${path}/${index}`, merge));
  }
  merge.conflicts.push(path);
  return merge.force ? before : current;
}

/**
 * 판 하나의 변경만 무른 지면. 그 뒤에 같은 칸을 또 고쳤으면 `conflicts`에 그 칸이 들어가고, `force`가 아니면 그 칸은 지금 값을 둔다.
 * 결과의 지면 검증은 부르는 쪽이 한다.
 */
export function revertChange(before: Snapshot, changed: Snapshot, current: Snapshot, force = false): { spec: unknown; content: unknown; conflicts: string[] } {
  const merge: Merge = { force, conflicts: [] };
  const spec = mergeValue(before.spec, changed.spec, current.spec, "/spec", merge);
  const content = mergeValue(before.content, changed.content, current.content, "/content", merge);
  return { spec, content, conflicts: merge.conflicts };
}

interface ElementDiff {
  key: string;
  texts: number;
  style: boolean;
  props: boolean;
}

function elementDiffs(before: Snapshot, after: Snapshot): ElementDiff[] {
  const diffs: ElementDiff[] = [];
  for (const [key, node] of Object.entries(after.spec.elements)) {
    const old = before.spec.elements[key];
    if (!old || key === after.spec.root) continue;
    const { style, ...props } = (node.props ?? {}) as Record<string, unknown>;
    const { style: oldStyle, ...oldProps } = (old.props ?? {}) as Record<string, unknown>;
    const texts = elementTextPaths(after, key).filter((path) => readStructuredText(after.content, path) !== readStructuredText(before.content, path)).length;
    const changedStyle = !sameValue(style, oldStyle);
    const changedProps = !sameValue(props, oldProps) || old.type !== node.type || !sameValue(old.children, node.children);
    if (texts || changedStyle || changedProps) diffs.push({ key, texts, style: changedStyle, props: changedProps });
  }
  return diffs;
}

/** 여러 섹션의 글을 함께 보이는 요소(작업 목차 · 수치 띠). 같은 글을 사례도 보이므로 고를 때는 사례를 먼저 둔다. */
function spansSections(snapshot: Snapshot, key: string): boolean {
  return new Set(elementTextPaths(snapshot, key).filter((path) => path.startsWith("/sections/")).map((path) => path.split("/")[2])).size > 1;
}

/**
 * 앞 판과 비교해 바뀐 요소 키. 더한 요소와 글 · 모양이 바뀐 요소를 지면 순서대로 내되 여러 섹션을 보이는 요소는 뒤로 보내고,
 * 순서만 바뀐 루트는 맨 뒤에 둔다. 이력 줄을 누르면 화면이 이 키의 첫 요소를 고른다.
 */
export function changedElementKeys(before: Snapshot, after: Snapshot): string[] {
  const order = readingOrder(after);
  const added = Object.keys(after.spec.elements).filter((key) => !(key in before.spec.elements));
  const changed = elementDiffs(before, after).map((diff) => diff.key);
  const rank = (key: string) => (spansSections(after, key) ? order.length : 0) + order.indexOf(key);
  const keys = [...new Set([...added, ...changed])].sort((a, b) => rank(a) - rank(b));
  const root = after.spec.root;
  if (!sameValue(before.spec.elements[root]?.children, after.spec.elements[root]?.children) && !keys.includes(root)) keys.push(root);
  return keys.slice(0, 40);
}

function readingOrder(snapshot: Snapshot): string[] {
  const order: string[] = [];
  const walk = (key: string) => {
    order.push(key);
    for (const child of snapshot.spec.elements[key]?.children ?? []) walk(child);
  };
  walk(snapshot.spec.root);
  return order;
}

function clip(text: string, length: number): string {
  const chars = [...text.trim()];
  return chars.length > length ? `${chars.slice(0, length - 1).join("")}…` : chars.join("");
}

/**
 * 두 판의 차이를 한 줄로 부른다. 글은 바뀐 칸으로 부르고(같은 글을 여러 요소가 보여도 한 번), 모양은 요소로 부른다.
 * 예: 「경로 재설계 · 요약 고침」, 「경로 재설계 · 글 3곳 고침」, 「수치 띠 · 글자 모양 고침」, 「목차 순서 바꿈」.
 */
export function describeChange(before: Snapshot, after: Snapshot): string {
  const added = Object.keys(after.spec.elements).filter((key) => !(key in before.spec.elements) && key !== after.spec.root);
  const removed = Object.keys(before.spec.elements).filter((key) => !(key in after.spec.elements));
  const parts: string[] = [];
  if (added.length) parts.push(`${added.map((key) => `「${clip(elementTitle(after, key).title, 24)}」`).slice(0, 2).join(" · ")} 더함`);
  if (removed.length) parts.push(`${removed.map((key) => `「${clip(elementTitle(before, key).title, 24)}」`).slice(0, 2).join(" · ")} 뺌`);
  const kept = Object.keys(after.spec.elements).filter((key) => key in before.spec.elements);
  const texts = [...new Set(kept.flatMap((key) => elementTextPaths(after, key)))]
    .filter((path) => readStructuredText(after.content, path) !== readStructuredText(before.content, path));
  if (texts.length === 1) parts.push(`${clip(textPathLabel(after, texts[0]!), 40)} 고침`);
  else if (texts.length > 1) {
    const owners = new Set(texts.map((path) => path.split("/").slice(1, 3).join("/")));
    const first = texts[0]!.split("/");
    const owner = first[1] === "profile" ? "소개" : clip(after.content.sections.find((item) => item.id === first[2])?.title ?? "섹션", 24);
    parts.push(owners.size === 1 ? `${owner} · 글 ${texts.length}곳 고침` : `${clip(textPathLabel(after, texts[0]!), 32)} 외 ${texts.length - 1}곳 고침`);
  }
  const looks = elementDiffs(before, after).filter((diff) => !added.includes(diff.key) && (diff.style || diff.props));
  for (const diff of looks.slice(0, 2)) {
    const what = [diff.style ? "글자 모양" : null, diff.props ? "모양" : null].filter(Boolean).join(", ");
    parts.push(`${clip(elementTitle(after, diff.key).title, 24)} · ${what} 고침`);
  }
  if (looks.length > 2) parts.push(`외 ${looks.length - 2}곳`);
  const root = after.spec.root;
  if (!parts.length && !sameValue(before.spec.elements[root]?.children, after.spec.elements[root]?.children)) parts.push("목차 순서 바꿈");
  return clip(parts.join(" / ") || "지면 고침", 200);
}
