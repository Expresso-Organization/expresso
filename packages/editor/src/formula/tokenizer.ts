import { FORMULA_SOURCE_MAX_LENGTH, FormulaParseError } from "./types.js";

export type FormulaTokenKind = "number" | "string" | "identifier" | "symbol" | "eof";
export interface FormulaToken { readonly kind: FormulaTokenKind; readonly value: string; readonly start: number; readonly end: number }

const COMPOUND_SYMBOLS = ["==", "!=", ">=", "<=", "&&", "||"] as const;

/** 문자열은 JSON escape 규칙만 허용해 복잡한 언어 기능이 parser로 새어 들어오지 않게 한다. */
export function tokenizeFormula(source: string): readonly FormulaToken[] {
  if (source.length > FORMULA_SOURCE_MAX_LENGTH) throw new FormulaParseError(`수식은 ${FORMULA_SOURCE_MAX_LENGTH}자까지 입력할 수 있습니다`, FORMULA_SOURCE_MAX_LENGTH, source.length, "limit_exceeded");
  const tokens: FormulaToken[] = [];
  let index = 0;
  const push = (kind: FormulaTokenKind, value: string, start: number, end: number) => tokens.push({ kind, value, start, end });
  while (index < source.length) {
    const character = source[index]!;
    if (/\s/u.test(character)) { index += 1; continue; }
    if (character === '"') {
      const start = index++;
      let escaped = false;
      while (index < source.length) {
        const current = source[index]!;
        if (!escaped && current === '"') { index += 1; break; }
        if (!escaped && /[\r\n]/u.test(current)) throw new FormulaParseError("문자열 안에는 줄바꿈을 넣을 수 없습니다", start, index + 1);
        escaped = !escaped && current === "\\";
        if (current !== "\\") escaped = false;
        index += 1;
      }
      const raw = source.slice(start, index);
      if (!raw.endsWith('"')) throw new FormulaParseError("문자열이 닫히지 않았습니다", start, index);
      try { push("string", JSON.parse(raw) as string, start, index); }
      catch { throw new FormulaParseError("문자열 escape가 올바르지 않습니다", start, index); }
      continue;
    }
    if (/\d/u.test(character) || (character === "." && /\d/u.test(source[index + 1] ?? ""))) {
      const start = index;
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u)?.[0];
      if (!match) throw new FormulaParseError("숫자 리터럴이 올바르지 않습니다", start);
      index += match.length;
      if (!Number.isFinite(Number(match))) throw new FormulaParseError("유한한 숫자만 사용할 수 있습니다", start, index);
      push("number", match, start, index);
      continue;
    }
    if (/[A-Za-z_]/u.test(character)) {
      const start = index++;
      while (/[A-Za-z0-9_]/u.test(source[index] ?? "")) index += 1;
      push("identifier", source.slice(start, index), start, index);
      continue;
    }
    const compound = COMPOUND_SYMBOLS.find((symbol) => source.startsWith(symbol, index));
    if (compound) { push("symbol", compound, index, index + compound.length); index += compound.length; continue; }
    if ("()[],?:+-*/%^!<>".includes(character)) { push("symbol", character, index, index + 1); index += 1; continue; }
    throw new FormulaParseError(`허용하지 않는 문자 ${JSON.stringify(character)}입니다`, index);
  }
  tokens.push({ kind: "eof", value: "", start: source.length, end: source.length });
  return tokens;
}
