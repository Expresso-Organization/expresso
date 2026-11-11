type Node = Record<string, unknown>;
const object = (value: unknown): value is Node => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Codex 강제 출력은 객체의 모든 속성을 required로 요구합니다.
 * 선택 항목을 강제로 생성하거나 null로 바꾸지 않고 원래 계약을 보존합니다.
 * 선택 필드·동적 키가 있으면 프롬프트로 형식을 전달하고 응답은 원본 Zod로 검사합니다.
 */
export function canConstrainCodexOutput(value: unknown): boolean {
  if (typeof value === "boolean") return false;
  if (!object(value)) return false;
  const node = value;
  // z.unknown()처럼 값의 종류도 고정하지 않은 칸은 strict 출력 형식이 아닙니다.
  if (!["type", "$ref", "const", "enum", "anyOf", "oneOf", "allOf"].some(key => Object.hasOwn(node, key))) return false;
  if (node.type === "object" || Array.isArray(node.type) && node.type.includes("object") || node.properties !== undefined || node.additionalProperties !== undefined) {
    if (!object(node.properties) || node.additionalProperties !== false) return false;
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    if (Object.keys(node.properties).some(key => !required.has(key))) return false;
    if (!Object.values(node.properties).every(canConstrainCodexOutput)) return false;
  }
  for (const key of ["$defs", "definitions", "patternProperties", "dependentSchemas"] as const) {
    if (object(node[key]) && !Object.values(node[key]).every(canConstrainCodexOutput)) return false;
  }
  for (const key of ["items", "additionalItems", "contains", "not", "if", "then", "else", "propertyNames"] as const) {
    if (node[key] !== undefined && !canConstrainCodexOutput(node[key])) return false;
  }
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    if (Array.isArray(node[key]) && !node[key].every(canConstrainCodexOutput)) return false;
  }
  return true;
}
