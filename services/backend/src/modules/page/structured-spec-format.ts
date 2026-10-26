import { z } from "zod";
import {
  STRUCTURED_GROUP_CHILDREN,
  STRUCTURED_GROUP_TYPES,
  STRUCTURED_GROUP_VARIANTS,
  STRUCTURED_MAX_GROUPS,
} from "@expresso/contracts";

/** 같은 값 집합의 enum을 목록 대신 이름으로 적습니다. 선택지 ID 목록은 프롬프트에 따로 있습니다. */
export type EnumLabel = { values: readonly string[]; label: string };

type JsonNode = {
  const?: unknown;
  enum?: unknown[];
  type?: string | string[];
  properties?: Record<string, JsonNode>;
  required?: string[];
  items?: JsonNode;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
};

export type SpecSchemaDescription = {
  /** 프롬프트에 넣을 형식 설명입니다. */
  text: string;
  /** 반드시 출력해야 하는 요소 ID입니다. page는 제외합니다. */
  required: string[];
  /** 필요할 때만 출력하는 요소 ID입니다. */
  optional: string[];
};

const range = (min: number | undefined, max: number | undefined) =>
  min === max ? `${min}` : `${min ?? 0}–${max ?? "∞"}`;

function shape(node: JsonNode, labels: EnumLabel[]): string {
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (node.enum) {
    const values = node.enum.map(String);
    const label = labels.find(
      (item) =>
        item.values.length === values.length &&
        item.values.every((value) => values.includes(value)),
    );
    return label
      ? `<${label.label}>`
      : node.enum.map((value) => JSON.stringify(value)).join("|");
  }
  if (node.properties) {
    const required = new Set(node.required ?? []);
    return `{${Object.entries(node.properties)
      .map(
        ([key, value]) =>
          `${key}${required.has(key) ? "" : "?"}: ${shape(value, labels)}`,
      )
      .join(", ")}}`;
  }
  if (node.type === "array") {
    if (node.maxItems === 0) return "[]";
    const count =
      node.minItems === undefined && node.maxItems === undefined
        ? ""
        : ` ${range(node.minItems, node.maxItems)}개`;
    return `[${node.items ? shape(node.items, labels) : "unknown"}${count}]`;
  }
  if (node.type === "string")
    return node.minLength === undefined && node.maxLength === undefined
      ? "string"
      : `string(${range(node.minLength, node.maxLength)}자)`;
  return JSON.stringify(node);
}

/**
 * 모델 출력 스키마에서 요소별 형식 설명을 만듭니다.
 *
 * 공급자에 넘기는 스키마와 같은 객체에서 만들기 때문에, Spec 구조를 바꿀 때
 * 프롬프트 문자열을 따로 고치지 않습니다.
 */
export function describeSpecSchema(
  schema: z.ZodType,
  labels: EnumLabel[] = [],
): SpecSchemaDescription {
  const root = z.toJSONSchema(schema) as JsonNode;
  const elements = root.properties?.["elements"];
  if (!elements?.properties)
    throw new Error("Spec 스키마에 elements 속성이 없습니다.");
  const required = new Set(elements.required ?? []);
  // 모양이 같은 선택 요소(컨테이너)는 한 줄로 묶습니다.
  const optional = new Map<string, string[]>();
  const lines = [`root: ${shape(root.properties!["root"]!, labels)}`];
  for (const [key, node] of Object.entries(elements.properties)) {
    const text = shape(node, labels);
    if (required.has(key)) lines.push(`elements.${key}: ${text}`);
    else optional.set(text, [...(optional.get(text) ?? []), key]);
  }
  for (const [text, keys] of optional)
    // 공급자 스키마는 선택 속성도 키를 요구하고 null을 허용합니다(`toToolSchema`). "생략"이라고 쓰면 모델이 키를 빼
    // 공급자 검사에 걸리고 출력을 처음부터 다시 씁니다(2026-10-26 다듬기: "must have required property 'group-2'").
    lines.push(`elements.${keys.join(", ")} (선택, 쓰지 않으면 null): ${text}`);
  return {
    text: lines.join("\n"),
    required: Object.keys(elements.properties).filter(
      (key) => key !== "page" && required.has(key),
    ),
    optional: [...optional.values()].flat(),
  };
}

/** 컨테이너 종류별 자식 수와 variant 규칙을 계약 상수에서 만듭니다. */
export function describeGroupRules(): string {
  return `${STRUCTURED_GROUP_TYPES.map((type) => {
    const [min, max] = STRUCTURED_GROUP_CHILDREN[type];
    return `${type}는 자식 ${range(min, max)}개(variant ${STRUCTURED_GROUP_VARIANTS[type].join("|")})`;
  }).join(
    ", ",
  )}입니다. 컨테이너는 0–${STRUCTURED_MAX_GROUPS}개를 쓸 수 있습니다.`;
}
