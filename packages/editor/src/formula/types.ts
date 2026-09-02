/** 수식 언어가 외부에 내보내는 값은 UI/DB 구현과 독립적인 작은 값 집합으로 한정한다. */
export type FormulaPrimitive = string | number | boolean | null;
export interface FormulaDateValue { readonly kind: "date"; readonly value: string }
export type FormulaRuntimeValue = FormulaPrimitive | FormulaDateValue | readonly FormulaRuntimeValue[];
export type FormulaComputedValue = string | number | boolean | readonly (string | number | boolean)[] | null;

export interface FormulaDiagnostic {
  readonly code: "parse_error" | "limit_exceeded" | "unknown_property" | "unknown_function" | "argument_count" | "argument_type" | "invalid_operator" | "cycle" | "runtime_error";
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly start: number;
  readonly end: number;
}

export interface FormulaRange { readonly start: number; readonly end: number }
export interface FormulaLiteral extends FormulaRange { readonly kind: "literal"; readonly value: FormulaPrimitive }
export interface FormulaPropertyReference extends FormulaRange { readonly kind: "property"; readonly propertyId: string }
export interface FormulaList extends FormulaRange { readonly kind: "list"; readonly items: readonly FormulaExpression[] }
export interface FormulaCall extends FormulaRange { readonly kind: "call"; readonly name: string; readonly args: readonly FormulaExpression[] }
export interface FormulaUnary extends FormulaRange { readonly kind: "unary"; readonly operator: "not" | "negate"; readonly operand: FormulaExpression }
export interface FormulaBinary extends FormulaRange {
  readonly kind: "binary";
  readonly operator: "or" | "and" | "equal" | "not_equal" | "greater" | "greater_equal" | "less" | "less_equal" | "add" | "subtract" | "multiply" | "divide" | "modulo" | "power";
  readonly left: FormulaExpression;
  readonly right: FormulaExpression;
}
export interface FormulaConditional extends FormulaRange { readonly kind: "conditional"; readonly condition: FormulaExpression; readonly whenTrue: FormulaExpression; readonly whenFalse: FormulaExpression }
export type FormulaExpression = FormulaLiteral | FormulaPropertyReference | FormulaList | FormulaCall | FormulaUnary | FormulaBinary | FormulaConditional;
export interface FormulaAst { readonly version: 1; readonly source: string; readonly expression: FormulaExpression }

export interface FormulaPropertyDefinition {
  readonly id: string;
  readonly type: string;
  readonly ast?: FormulaAst | null;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly deletedAt?: string | null;
}
export type FormulaPropertySchema = readonly FormulaPropertyDefinition[];

/** contracts의 CareerPropertyValueV2와 구조적으로 호환되는 최소 표현이다. */
export interface FormulaPropertyValue {
  readonly type: string;
  readonly value: unknown;
  readonly diagnostics?: readonly FormulaDiagnostic[];
}

export const FORMULA_SOURCE_MAX_LENGTH = 4_000;
export const FORMULA_AST_MAX_DEPTH = 64;
export const FORMULA_AST_MAX_NODES = 2_000;
export const FORMULA_EVALUATION_MAX_OPERATIONS = 10_000;

export class FormulaParseError extends Error {
  constructor(message: string, readonly start: number, readonly end = start + 1, readonly code: "parse_error" | "limit_exceeded" = "parse_error") {
    super(message);
    this.name = "FormulaParseError";
  }
}
