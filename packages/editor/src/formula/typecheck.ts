import { FORMULA_FUNCTIONS, type FormulaStaticType } from "./functions.js";
import type { FormulaAst, FormulaDiagnostic, FormulaExpression, FormulaPropertyDefinition, FormulaPropertySchema } from "./types.js";

function diagnostic(code: FormulaDiagnostic["code"], message: string, node: { start: number; end: number }): FormulaDiagnostic {
  return { code, message, severity: "error", start: node.start, end: node.end };
}
function propertyType(definition: FormulaPropertyDefinition): FormulaStaticType {
  if (["text", "title", "url", "email", "phone", "select"].includes(definition.type)) return "text";
  if (definition.type === "number") return "number";
  if (definition.type === "checkbox") return "boolean";
  if (["date", "created_time", "updated_time"].includes(definition.type)) return "date";
  if (["multi_select", "file", "media", "relation"].includes(definition.type)) return "list";
  return "unknown";
}
function accepts(expected: FormulaStaticType, actual: FormulaStaticType): boolean { return expected === "unknown" || actual === "unknown" || actual === "null" || expected === actual; }

/** 저장 전에 문법과 독립적으로 UUID 참조/함수/기본 연산 타입을 검증한다. */
export function typecheckFormula(ast: FormulaAst, schema: FormulaPropertySchema): readonly FormulaDiagnostic[] {
  const properties = new Map(schema.filter((definition) => definition.deletedAt === null || definition.deletedAt === undefined).map((definition) => [definition.id, definition]));
  const diagnostics: FormulaDiagnostic[] = [];
  const infer = (node: FormulaExpression): FormulaStaticType => {
    if (node.kind === "literal") return node.value === null ? "null" : typeof node.value === "string" ? "text" : typeof node.value === "number" ? "number" : "boolean";
    if (node.kind === "property") {
      const definition = properties.get(node.propertyId);
      if (!definition) { diagnostics.push(diagnostic("unknown_property", "존재하지 않거나 삭제된 프로퍼티입니다", node)); return "unknown"; }
      return propertyType(definition);
    }
    if (node.kind === "list") { node.items.forEach(infer); return "list"; }
    if (node.kind === "unary") {
      const type = infer(node.operand); const expected = node.operator === "not" ? "boolean" : "number";
      if (!accepts(expected, type)) diagnostics.push(diagnostic("invalid_operator", `${node.operator === "not" ? "not" : "-"} 연산은 ${expected} 값에만 사용할 수 있습니다`, node));
      return expected;
    }
    if (node.kind === "binary") {
      const left = infer(node.left); const right = infer(node.right);
      if (node.operator === "and" || node.operator === "or") {
        if (!accepts("boolean", left) || !accepts("boolean", right)) diagnostics.push(diagnostic("invalid_operator", "논리 연산은 boolean 값에만 사용할 수 있습니다", node));
        return "boolean";
      }
      if (node.operator === "equal" || node.operator === "not_equal") return "boolean";
      if (["greater", "greater_equal", "less", "less_equal"].includes(node.operator)) {
        if ((left !== "unknown" && right !== "unknown" && left !== "null" && right !== "null" && left !== right) || !["text", "number", "date", "unknown", "null"].includes(left)) diagnostics.push(diagnostic("invalid_operator", "비교 연산은 같은 텍스트·숫자·날짜 타입에만 사용할 수 있습니다", node));
        return "boolean";
      }
      if (node.operator === "add" && left === "text" && right === "text") return "text";
      if (!accepts("number", left) || !accepts("number", right)) diagnostics.push(diagnostic("invalid_operator", "산술 연산은 숫자 값에만 사용할 수 있습니다", node));
      return "number";
    }
    if (node.kind === "conditional") {
      const condition = infer(node.condition); const whenTrue = infer(node.whenTrue); const whenFalse = infer(node.whenFalse);
      if (!accepts("boolean", condition)) diagnostics.push(diagnostic("argument_type", "조건식은 boolean 값이어야 합니다", node.condition));
      return whenTrue === whenFalse ? whenTrue : "unknown";
    }
    const definition = FORMULA_FUNCTIONS[node.name];
    const argumentTypes = node.args.map(infer);
    if (!definition) { diagnostics.push(diagnostic("unknown_function", `허용하지 않는 함수 ${node.name}입니다`, node)); return "unknown"; }
    if (node.args.length < definition.signature.minArgs || node.args.length > definition.signature.maxArgs) diagnostics.push(diagnostic("argument_count", `${node.name} 함수의 인수 개수가 올바르지 않습니다`, node));
    for (const [index, expected] of (definition.signature.args ?? []).entries()) {
      const actual = argumentTypes[index];
      if (actual !== undefined && !accepts(expected, actual)) diagnostics.push(diagnostic("argument_type", `${node.name} 함수의 ${index + 1}번째 인수 타입이 맞지 않습니다`, node.args[index]!));
    }
    return definition.signature.result;
  };
  infer(ast.expression);
  return diagnostics;
}
