import { runFormulaBuiltin } from "./functions.js";
import { FORMULA_EVALUATION_MAX_OPERATIONS, type FormulaAst, type FormulaComputedValue, type FormulaDateValue, type FormulaExpression, type FormulaPropertyValue, type FormulaRuntimeValue } from "./types.js";

interface EvaluationState { operations: number; readonly maxOperations: number; readonly context: ReadonlyMap<string, FormulaPropertyValue | null> }

function date(value: string): FormulaDateValue { return { kind: "date", value }; }
function isDate(value: FormulaRuntimeValue): value is FormulaDateValue { return Boolean(value && typeof value === "object" && !Array.isArray(value) && "kind" in value && value.kind === "date"); }
function isComputedScalar(value: FormulaComputedValue): value is string | number | boolean { return typeof value === "string" || typeof value === "number" || typeof value === "boolean"; }
function stable(value: FormulaRuntimeValue): string { return value === null ? "null" : Array.isArray(value) ? `[${value.map(stable).join(",")}]` : isDate(value) ? `date:${value.value}` : `${typeof value}:${value}`; }
function runtimeValue(input: FormulaPropertyValue | null | undefined): FormulaRuntimeValue {
  if (!input) return null;
  const value = input.value;
  if (input.type === "date" && value && typeof value === "object" && typeof (value as { start?: unknown }).start === "string") return date((value as { start: string }).start);
  if ((input.type === "created_time" || input.type === "updated_time") && typeof value === "string") return date(value.slice(0, 10));
  if (input.type === "relation" && Array.isArray(value)) return value.flatMap((item) => item && typeof item === "object" && typeof (item as { recordId?: unknown }).recordId === "string" ? [(item as { recordId: string }).recordId] : []);
  if (input.type === "formula" || input.type === "rollup") return runtimeFromComputed(value);
  return runtimeFromComputed(value);
}
function runtimeFromComputed(value: unknown): FormulaRuntimeValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.flatMap((item) => {
    const parsed = runtimeFromComputed(item);
    return Array.isArray(parsed) ? [] : [parsed];
  });
  return null;
}
function computed(value: FormulaRuntimeValue): FormulaComputedValue | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (isDate(value)) return value.value;
  const items: (string | number | boolean)[] = [];
  for (const item of value) {
    const parsed = computed(item);
    if (parsed === null || !isComputedScalar(parsed)) return null;
    items.push(parsed);
  }
  return items;
}
function number(value: FormulaRuntimeValue): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("숫자 피연산자가 필요합니다"); return value; }
function boolean(value: FormulaRuntimeValue): boolean { if (typeof value !== "boolean") throw new TypeError("boolean 피연산자가 필요합니다"); return value; }
function comparable(value: FormulaRuntimeValue): string | number { if (typeof value === "string" || typeof value === "number") return value; if (isDate(value)) return value.value; throw new TypeError("비교할 수 없는 값입니다"); }

function evaluate(node: FormulaExpression, state: EvaluationState): FormulaRuntimeValue {
  state.operations += 1;
  if (state.operations > state.maxOperations) throw new RangeError(`수식 계산은 ${state.maxOperations}회 연산까지 허용됩니다`);
  switch (node.kind) {
    case "literal": return node.value;
    case "property": return runtimeValue(state.context.get(node.propertyId));
    case "list": return node.items.map((item) => evaluate(item, state));
    case "call": return runFormulaBuiltin(node.name, node.args.map((item) => evaluate(item, state)));
    case "unary": {
      const value = evaluate(node.operand, state);
      if (value === null) return null;
      return node.operator === "not" ? !boolean(value) : -number(value);
    }
    case "conditional": {
      const condition = evaluate(node.condition, state);
      return condition === null ? null : evaluate(boolean(condition) ? node.whenTrue : node.whenFalse, state);
    }
    case "binary": return binary(node.operator, node.left, node.right, state);
  }
}

function binary(operator: Extract<FormulaExpression, { kind: "binary" }>["operator"], leftNode: FormulaExpression, rightNode: FormulaExpression, state: EvaluationState): FormulaRuntimeValue {
  const left = evaluate(leftNode, state);
  if (operator === "and") { if (left === null) return null; return boolean(left) ? evaluate(rightNode, state) : false; }
  if (operator === "or") { if (left === null) return null; return boolean(left) ? true : evaluate(rightNode, state); }
  const right = evaluate(rightNode, state);
  if (left === null || right === null) return null;
  if (operator === "equal") return stable(left) === stable(right);
  if (operator === "not_equal") return stable(left) !== stable(right);
  if (["greater", "greater_equal", "less", "less_equal"].includes(operator)) {
    const first = comparable(left); const second = comparable(right);
    if (typeof first !== typeof second) throw new TypeError("같은 타입끼리만 비교할 수 있습니다");
    return operator === "greater" ? first > second : operator === "greater_equal" ? first >= second : operator === "less" ? first < second : first <= second;
  }
  if (operator === "add" && typeof left === "string" && typeof right === "string") return left + right;
  const first = number(left); const second = number(right);
  if (operator === "add") return first + second;
  if (operator === "subtract") return first - second;
  if (operator === "multiply") return first * second;
  if (operator === "divide") { if (second === 0) throw new RangeError("0으로 나눌 수 없습니다"); return first / second; }
  if (operator === "modulo") { if (second === 0) throw new RangeError("0으로 나눌 수 없습니다"); return first % second; }
  return first ** second;
}

/** 런타임 오류와 초과 예산은 사용자 입력을 던지지 않고 계산 결과 없음으로 돌려준다. */
export function evaluateFormula(ast: FormulaAst, context: ReadonlyMap<string, FormulaPropertyValue | null>, maxOperations = FORMULA_EVALUATION_MAX_OPERATIONS): FormulaPropertyValue | null {
  if (!Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > FORMULA_EVALUATION_MAX_OPERATIONS) return null;
  try {
    const value = computed(evaluate(ast.expression, { operations: 0, maxOperations, context }));
    return value === null ? null : { type: "formula", value, diagnostics: [] };
  } catch { return null; }
}
