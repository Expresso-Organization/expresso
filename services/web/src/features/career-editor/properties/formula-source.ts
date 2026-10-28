import type { CareerFormulaDiagnosticSchema, CareerPropertyDefinitionV2 } from "@expresso/contracts";
import type { z } from "zod";

type FormulaDiagnostic = z.infer<typeof CareerFormulaDiagnosticSchema>;

/** `packages/editor/src/formula/parser.ts`가 `prop` 인자로 받는 UUID와 같은 형식이다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** `prop("…")` 한 개. 위치는 원문 기준이고 `argument*`는 따옴표를 포함한 문자열 리터럴 구간이다. */
export interface FormulaPropertyReference {
  start: number;
  end: number;
  argumentStart: number;
  argumentEnd: number;
  value: string;
}

/** 바꾼 문자열 리터럴 구간. 한쪽 원문 위치를 다른 쪽 원문 위치로 옮길 때 쓴다. */
interface Replacement { fromStart: number; fromEnd: number; toStart: number; toEnd: number }

/** 원문 하나와, 그 원문을 만든 변환이 바꾼 구간들. */
export interface ConvertedFormula { text: string; replacements: readonly Replacement[] }

function stringEnd(source: string, start: number): number | null {
  let index = start + 1;
  while (index < source.length) {
    const character = source[index]!;
    if (character === "\\") { index += 2; continue; }
    if (character === '"') return index + 1;
    if (character === "\n" || character === "\r") return null;
    index += 1;
  }
  return null;
}

function skipSpace(source: string, index: number): number {
  while (index < source.length && /\s/u.test(source[index]!)) index += 1;
  return index;
}

/**
 * 입력 중인 수식에서도 `prop("…")`을 찾는다. 다른 문자열 리터럴 안의 글자는 건너뛴다.
 * `@expresso/editor`의 tokenizer는 허용하지 않는 문자에서 예외를 던져 편집 중에는 쓸 수 없다.
 */
export function findPropertyReferences(source: string): FormulaPropertyReference[] {
  const references: FormulaPropertyReference[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '"') { index = stringEnd(source, index) ?? source.length; continue; }
    if (/[A-Za-z_]/u.test(character)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_]/u.test(source[index]!)) index += 1;
      if (source.slice(start, index) !== "prop") continue;
      const open = skipSpace(source, index);
      if (source[open] !== "(") continue;
      const argumentStart = skipSpace(source, open + 1);
      if (source[argumentStart] !== '"') continue;
      const argumentEnd = stringEnd(source, argumentStart);
      if (argumentEnd === null) continue;
      const close = skipSpace(source, argumentEnd);
      if (source[close] !== ")") continue;
      let value: string;
      try { value = JSON.parse(source.slice(argumentStart, argumentEnd)) as string; } catch { continue; }
      references.push({ start, end: close + 1, argumentStart, argumentEnd, value });
      index = close + 1;
      continue;
    }
    index += 1;
  }
  return references;
}

function liveProperties(properties: readonly CareerPropertyDefinitionV2[]) {
  return properties.filter((property) => property.deletedAt === null);
}

function replace(source: string, edits: ReadonlyArray<{ start: number; end: number; text: string }>): ConvertedFormula {
  let text = "";
  let cursor = 0;
  const replacements: Replacement[] = [];
  for (const edit of edits) {
    text += source.slice(cursor, edit.start);
    replacements.push({ fromStart: edit.start, fromEnd: edit.end, toStart: text.length, toEnd: text.length + edit.text.length });
    text += edit.text;
    cursor = edit.end;
  }
  return { text: text + source.slice(cursor), replacements };
}

/** 저장 원문의 속성 UUID를 이름으로 바꾼다. 이름이 겹치거나 없는 속성은 UUID를 그대로 둔다. */
export function formulaForDisplay(stored: string, properties: readonly CareerPropertyDefinitionV2[]): ConvertedFormula {
  const live = liveProperties(properties);
  const edits = findPropertyReferences(stored).flatMap((reference) => {
    const property = live.find((item) => item.id === reference.value);
    if (!property || live.filter((item) => item.name === property.name).length !== 1) return [];
    return [{ start: reference.argumentStart, end: reference.argumentEnd, text: JSON.stringify(property.name) }];
  });
  return replace(stored, edits);
}

/**
 * 표시 원문의 속성 이름을 UUID로 되돌린다. UUID로 적힌 참조는 그대로 둔다.
 * 없는 이름 · 겹치는 이름은 표시 원문 위치의 진단으로 돌려준다. 서버는 UUID만 알기 때문이다.
 */
export function formulaForStorage(display: string, properties: readonly CareerPropertyDefinitionV2[]): ConvertedFormula & { diagnostics: FormulaDiagnostic[] } {
  const live = liveProperties(properties);
  const diagnostics: FormulaDiagnostic[] = [];
  const edits = findPropertyReferences(display).flatMap((reference) => {
    if (UUID.test(reference.value)) return [];
    const matches = live.filter((item) => item.name === reference.value);
    if (matches.length === 1) return [{ start: reference.argumentStart, end: reference.argumentEnd, text: JSON.stringify(matches[0]!.id) }];
    diagnostics.push(matches.length === 0
      ? { code: "unknown_property", message: `「${reference.value}」 속성이 없습니다.`, severity: "error", start: reference.argumentStart, end: reference.argumentEnd }
      : { code: "ambiguous_property", message: `「${reference.value}」 이름을 쓰는 속성이 ${matches.length}개입니다.`, severity: "error", start: reference.argumentStart, end: reference.argumentEnd });
    return [];
  });
  return { ...replace(display, edits), diagnostics };
}

/**
 * 변환 전 원문의 위치를 변환 뒤 원문의 위치로 옮긴다. `formulaForStorage` 결과를 거꾸로 넘기면
 * 서버 진단(저장 원문 기준)을 표시 원문 기준으로 옮긴다.
 */
export function moveOffset(offset: number, replacements: readonly Replacement[], direction: "forward" | "backward" = "forward"): number {
  let delta = 0;
  for (const replacement of replacements) {
    const [fromStart, fromEnd, toStart, toEnd] = direction === "forward"
      ? [replacement.fromStart, replacement.fromEnd, replacement.toStart, replacement.toEnd]
      : [replacement.toStart, replacement.toEnd, replacement.fromStart, replacement.fromEnd];
    if (offset < fromStart) break;
    if (offset < fromEnd) return offset === fromStart ? toStart : toEnd;
    delta = toEnd - fromEnd;
  }
  return offset + delta;
}
