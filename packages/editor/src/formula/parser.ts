import { tokenizeFormula, type FormulaToken } from "./tokenizer.js";
import {
  FORMULA_AST_MAX_DEPTH,
  FORMULA_AST_MAX_NODES,
  FormulaParseError,
  type FormulaAst,
  type FormulaExpression,
} from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPERATORS = {
  "||": [1, "or"], or: [1, "or"], "&&": [2, "and"], and: [2, "and"],
  "==": [3, "equal"], "!=": [3, "not_equal"], ">": [4, "greater"], ">=": [4, "greater_equal"], "<": [4, "less"], "<=": [4, "less_equal"],
  "+": [5, "add"], "-": [5, "subtract"], "*": [6, "multiply"], "/": [6, "divide"], "%": [6, "modulo"], "^": [7, "power"],
} as const;
type Operator = FormulaExpression extends { kind: "binary"; operator: infer T } ? T : never;

class Parser {
  #index = 0;
  #nesting = 0;
  constructor(readonly source: string, readonly tokens: readonly FormulaToken[]) {}

  parse(): FormulaExpression {
    const expression = this.expression(0);
    const trailing = this.current();
    if (trailing.kind !== "eof") throw new FormulaParseError(`예상하지 못한 토큰 ${JSON.stringify(trailing.value)}입니다`, trailing.start, trailing.end);
    return expression;
  }

  private current(offset = 0): FormulaToken { return this.tokens[this.#index + offset] ?? this.tokens.at(-1)!; }
  private consume(value?: string): FormulaToken {
    const token = this.current();
    if (value !== undefined && token.value !== value) throw new FormulaParseError(`${JSON.stringify(value)}가 필요합니다`, token.start, token.end);
    this.#index += 1;
    return token;
  }
  private withNesting<T>(operation: () => T): T {
    this.#nesting += 1;
    if (this.#nesting > FORMULA_AST_MAX_DEPTH) throw new FormulaParseError(`수식 중첩은 ${FORMULA_AST_MAX_DEPTH}단계까지 허용됩니다`, this.current().start, this.current().end, "limit_exceeded");
    try { return operation(); } finally { this.#nesting -= 1; }
  }
  private expression(minimum: number): FormulaExpression {
    let left = this.prefix();
    while (true) {
      const token = this.current();
      const entry = OPERATORS[token.value as keyof typeof OPERATORS];
      if (!entry || entry[0] < minimum) break;
      this.consume();
      // 거듭제곱만 오른쪽 결합이다.
      const right = this.expression(token.value === "^" ? entry[0] : entry[0] + 1);
      left = { kind: "binary", operator: entry[1] as Operator, left, right, start: left.start, end: right.end };
    }
    if (minimum === 0 && this.current().value === "?") {
      this.consume("?");
      const whenTrue = this.expression(0);
      this.consume(":");
      const whenFalse = this.expression(0);
      left = { kind: "conditional", condition: left, whenTrue, whenFalse, start: left.start, end: whenFalse.end };
    }
    return left;
  }
  private prefix(): FormulaExpression {
    return this.withNesting(() => {
      const token = this.current();
      if (token.kind === "number") { this.consume(); return { kind: "literal", value: Number(token.value), start: token.start, end: token.end }; }
      if (token.kind === "string") { this.consume(); return { kind: "literal", value: token.value, start: token.start, end: token.end }; }
      if (token.value === "-") { const start = this.consume().start; const operand = this.prefix(); return { kind: "unary", operator: "negate", operand, start, end: operand.end }; }
      if (token.value === "!" || token.value === "not") { const start = this.consume().start; const operand = this.prefix(); return { kind: "unary", operator: "not", operand, start, end: operand.end }; }
      if (token.value === "(") { this.consume(); const expression = this.expression(0); this.consume(")"); return expression; }
      if (token.value === "[") return this.list();
      if (token.kind === "identifier") return this.identifier();
      throw new FormulaParseError("표현식이 필요합니다", token.start, token.end);
    });
  }
  private list(): FormulaExpression {
    const start = this.consume("[").start;
    const items: FormulaExpression[] = [];
    if (this.current().value !== "]") while (true) {
      items.push(this.expression(0));
      if (this.current().value !== ",") break;
      this.consume(",");
    }
    const end = this.consume("]").end;
    return { kind: "list", items, start, end };
  }
  private identifier(): FormulaExpression {
    const name = this.consume();
    if (name.value === "true" || name.value === "false" || name.value === "null") return { kind: "literal", value: name.value === "null" ? null : name.value === "true", start: name.start, end: name.end };
    if (this.current().value !== "(") throw new FormulaParseError(`함수 ${name.value}에는 괄호가 필요합니다`, name.start, name.end);
    this.consume("(");
    const args: FormulaExpression[] = [];
    if (this.current().value !== ")") while (true) {
      args.push(this.expression(0));
      if (this.current().value !== ",") break;
      this.consume(",");
    }
    const end = this.consume(")").end;
    if (name.value === "prop") {
      const propertyId = args[0];
      if (args.length !== 1 || !propertyId || propertyId.kind !== "literal" || typeof propertyId.value !== "string" || !UUID.test(propertyId.value)) throw new FormulaParseError("prop은 UUID 문자열 하나를 받아야 합니다", name.start, end);
      return { kind: "property", propertyId: propertyId.value, start: name.start, end };
    }
    return { kind: "call", name: name.value, args, start: name.start, end };
  }
}

function assertAstLimits(expression: FormulaExpression): void {
  let nodes = 0;
  const visit = (node: FormulaExpression, depth: number): void => {
    nodes += 1;
    if (nodes > FORMULA_AST_MAX_NODES) throw new FormulaParseError(`수식 AST는 ${FORMULA_AST_MAX_NODES}개 노드까지 허용됩니다`, node.start, node.end, "limit_exceeded");
    if (depth > FORMULA_AST_MAX_DEPTH) throw new FormulaParseError(`수식 AST 깊이는 ${FORMULA_AST_MAX_DEPTH}까지 허용됩니다`, node.start, node.end, "limit_exceeded");
    if (node.kind === "list") node.items.forEach((item) => visit(item, depth + 1));
    else if (node.kind === "call") node.args.forEach((item) => visit(item, depth + 1));
    else if (node.kind === "unary") visit(node.operand, depth + 1);
    else if (node.kind === "binary") { visit(node.left, depth + 1); visit(node.right, depth + 1); }
    else if (node.kind === "conditional") { visit(node.condition, depth + 1); visit(node.whenTrue, depth + 1); visit(node.whenFalse, depth + 1); }
  };
  visit(expression, 1);
}

export function parseFormula(source: string): FormulaAst {
  const expression = new Parser(source, tokenizeFormula(source)).parse();
  assertAstLimits(expression);
  return { version: 1, source, expression };
}
