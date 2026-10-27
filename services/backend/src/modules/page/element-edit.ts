import { z } from "zod";
import {
  PAGE_PROMPT_VERSION,
  STRUCTURED_STYLE_COLORS,
  STRUCTURED_STYLE_FONTS,
  StructuredSectionSchema,
  applyStructuredTextPatches,
  isStructuredGroup,
  readStructuredText,
  validateStructuredPortfolio,
  type DesignSystemSpecV2,
  type PortfolioArchetype,
  type StructuredElementStyle,
  type StructuredPortfolioSnapshot,
  type StructuredSection,
  type StructuredTextPatch,
} from "@expresso/contracts";
export { elementTextPaths, textPathLabel };
import {
  STRUCTURED_PARTS,
  STRUCTURED_TYPE_LABELS,
  elementTextPaths,
  textPathLabel,
  STYLE_COLOR_LABELS,
  STYLE_FONT_LABELS,
  editableFields,
  structuredCatalog,
  styleProblems,
} from "@expresso/portfolio-renderer";

import type { AiClient, AiUsage, AiViolation } from "../../platform/ai/client.js";
import { ungroundedNumbers } from "../../platform/numbers.js";
import { FILL_LIMITS, FILL_SYSTEM, METRIC_VALUE_PATTERN, sectionFillSchema } from "./design-first.js";

/** 요소 하나에 대한 고침입니다. 바꾸지 않는 칸은 비웁니다. */
export type ElementEdit = {
  props?: Record<string, string> | undefined;
  style?: StructuredElementStyle | undefined;
  text?: StructuredTextPatch[] | undefined;
};

/** 화면의 「바뀐 곳」 한 줄입니다. */
export type ElementChange = { label: string; before: string; after: string };

type Snapshot = StructuredPortfolioSnapshot;

/** 고침을 적용한 새 스냅샷입니다. 계약 · 참조 검사를 지나지 못하면 오류를 던집니다. */
export function applyElementEdit(snapshot: Snapshot, key: string, edit: ElementEdit, design: DesignSystemSpecV2): Snapshot {
  const node = snapshot.spec.elements[key];
  if (!node || node.type === "PortfolioPage") throw new Error("고칠 요소가 없습니다.");
  const spec = structuredClone(snapshot.spec);
  const target = spec.elements[key]!;
  const props = target.props as Record<string, unknown>;
  if (edit.props) {
    const fields = new Map(editableFields(target.type).map((field) => [field.name, field]));
    for (const [name, value] of Object.entries(edit.props)) {
      const field = fields.get(name);
      if (!field || !field.options.some((option) => option.value === value))
        throw new Error(`${STRUCTURED_TYPE_LABELS[target.type] ?? target.type}의 '${name}'에는 '${value}'를 쓸 수 없습니다.`);
      props[name] = value;
    }
  }
  if (edit.style !== undefined) {
    const problems = styleProblems(target.type, edit.style, design);
    if (problems.length) throw new Error(problems.join(" "));
    const cleaned = Object.fromEntries(
      Object.entries(edit.style)
        .map(([part, value]) => [part, Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))] as const)
        .filter(([, value]) => Object.keys(value).length > 0),
    );
    if (Object.keys(cleaned).length) props.style = cleaned;
    else delete props.style;
  }
  const content = edit.text?.length ? applyStructuredTextPatches(snapshot.content, edit.text) : snapshot.content;
  return validateStructuredPortfolio(spec, content);
}

/** 두 스냅샷 사이에서 요소 하나가 바뀐 곳을 줄로 냅니다. */
export function elementChanges(before: Snapshot, after: Snapshot, key: string): ElementChange[] {
  const changes: ElementChange[] = [];
  const oldNode = before.spec.elements[key];
  const newNode = after.spec.elements[key];
  if (oldNode && newNode) {
    for (const field of editableFields(newNode.type)) {
      const was = (oldNode.props as Record<string, unknown>)[field.name];
      const now = (newNode.props as Record<string, unknown>)[field.name];
      if (was === now) continue;
      const label = (value: unknown) => field.options.find((option) => option.value === value)?.label ?? "기본";
      changes.push({ label: field.label, before: label(was), after: label(now) });
    }
    const parts = STRUCTURED_PARTS[newNode.type] ?? {};
    const oldStyle = (oldNode.props as { style?: StructuredElementStyle }).style ?? {};
    const newStyle = (newNode.props as { style?: StructuredElementStyle }).style ?? {};
    for (const part of new Set([...Object.keys(oldStyle), ...Object.keys(newStyle)])) {
      const describe = (value: StructuredElementStyle[string] | undefined) =>
        [value?.color ? STYLE_COLOR_LABELS[value.color] : "", value?.font ? STYLE_FONT_LABELS[value.font] : "", value?.size ?? ""].filter(Boolean).join(" · ") || "기본";
      const was = describe(oldStyle[part]);
      const now = describe(newStyle[part]);
      if (was !== now) changes.push({ label: `${parts[part]?.label ?? part} 모양`, before: was, after: now });
    }
  }
  const paths = elementTextPaths(after, key);
  // 한 섹션만 보이는 요소의 줄 이름에는 섹션 제목을 붙이지 않습니다.
  const section = new Set(paths.filter((path) => path.startsWith("/sections/")).map((path) => path.split("/")[2])).size > 1;
  for (const path of paths) {
    const was = readStructuredText(before.content, path) ?? "";
    const now = readStructuredText(after.content, path) ?? "";
    if (was !== now) changes.push({ label: textPathLabel(after, path, { section }), before: was, after: now });
  }
  return changes;
}

/** 요소가 가진 글의 근거 원문입니다. 고친 글의 숫자는 이 안에 있어야 합니다. */
function groundSource(snapshot: Snapshot): string {
  return [JSON.stringify(snapshot.content.sections), ...snapshot.content.evidence.map((item) => `${item.title}\n${item.summary}\n${item.body}`)].join("\n");
}

const INSTRUCT_SYSTEM =
  "포트폴리오 지면에서 사용자가 고른 요소 하나를 사용자의 요청대로 고칩니다. 요청과 관계없는 칸은 비워 둡니다. 출처에 없는 수치 · 성과 · 경력을 만들지 않고, 글은 지금 글의 사실을 유지합니다. 모양은 주어진 선택지 안에서만 고릅니다.";

/**
 * 요소 하나를 말로 고칩니다. 모델은 고칠 칸만 JSON으로 쓰고, 서버가 적용 · 검사합니다.
 *
 * 검사에 걸린 칸은 출력을 거절하지 않고 같은 대화에서 그 칸만 고쳐 받습니다(`check`). 호출하는 쪽에 다시 요청하는 루프를
 * 두지 않습니다(AGENTS.md 「AI 출력을 거절해서 처음부터 다시 쓰게 하지 않습니다」).
 */
export class PageElementEditor {
  constructor(private readonly ai: AiClient) {}

  async instruct(input: { userId: string; snapshot: Snapshot; key: string; instruction: string; design: DesignSystemSpecV2 }): Promise<{ edit: ElementEdit; note: string; usage: AiUsage }> {
    const { snapshot, key, design } = input;
    const node = snapshot.spec.elements[key];
    if (!node || node.type === "PortfolioPage" || isStructuredGroup(node) && editableFields(node.type).length === 0)
      throw new Error("고칠 요소가 없습니다.");
    const fields = editableFields(node.type);
    const parts = Object.entries(STRUCTURED_PARTS[node.type] ?? {});
    const steps = design.typography.scale.map((step) => step.name) as [string, ...string[]];
    // 이름은 사용자가 직접만 고칩니다. 말로 고치기는 이름을 바꾸지 않습니다.
    const paths = elementTextPaths(snapshot, key).filter((path) => path !== "/profile/name");
    const partStyle = z.object({
      color: z.enum(STRUCTURED_STYLE_COLORS).optional(),
      font: z.enum(STRUCTURED_STYLE_FONTS).optional(),
      size: z.enum(steps).optional(),
    });
    const schema = z.object({
      note: z.string().min(1),
      ...(fields.length
        ? { props: z.object(Object.fromEntries(fields.map((field) => [field.name, z.enum(field.options.map((option) => option.value) as [string, ...string[]]).optional()]))).optional() }
        : {}),
      ...(parts.length ? { style: z.object(Object.fromEntries(parts.map(([name]) => [name, partStyle.optional()]))).optional() } : {}),
      ...(paths.length ? { text: z.array(z.object({ path: z.enum(paths as [string, ...string[]]), value: z.string() })).optional() } : {}),
    });
    type Output = { note: string; props?: Record<string, string | undefined>; style?: StructuredElementStyle; text?: StructuredTextPatch[] };
    const source = groundSource(snapshot);
    const toEdit = (output: Output): ElementEdit => ({
      ...(output.props ? { props: Object.fromEntries(Object.entries(output.props).filter((entry): entry is [string, string] => entry[1] !== undefined)) } : {}),
      ...(output.style ? { style: { ...((node.props as { style?: StructuredElementStyle }).style ?? {}), ...output.style } } : {}),
      ...(output.text?.length ? { text: output.text } : {}),
    });
    const check = (output: Output): AiViolation[] => {
      const violations: AiViolation[] = [];
      (output.text ?? []).forEach((patch, index) => {
        const was = readStructuredText(snapshot.content, patch.path) ?? "";
        const numbers = ungroundedNumbers(patch.value, `${source}\n${was}`);
        if (numbers.length) violations.push({ path: `/text/${index}/value`, problem: `출처에 없는 숫자가 있습니다: ${numbers.join(", ")}. 출처에 있는 숫자만 쓰세요.` });
        if (/\/(?:value|before)$/.test(patch.path) && patch.value && !METRIC_VALUE_PATTERN.test(patch.value))
          violations.push({ path: `/text/${index}/value`, problem: "수치 값은 숫자와 단위만 씁니다(예: 1.9초, 420KB, 1,200만 건)." });
      });
      if (violations.length) return violations;
      try { applyElementEdit(snapshot, key, toEdit(output), design); }
      catch (error) {
        violations.push({ path: output.text?.length ? "/text" : output.props ? "/props" : "/style", problem: error instanceof Error ? error.message : "지면 규칙에 맞지 않습니다." });
      }
      return violations;
    };
    const catalog = (structuredCatalog.data.components as Record<string, { description?: string }>)[node.type];
    const prompt = `## 고를 요소
${STRUCTURED_TYPE_LABELS[node.type] ?? node.type}(${node.type}): ${catalog?.description ?? ""}
## 지금 모양
${JSON.stringify(Object.fromEntries(fields.map((field) => [field.name, (node.props as Record<string, unknown>)[field.name] ?? "기본"])))}
글자 부분: ${parts.map(([name, part]) => `${name}(${part.label})`).join(", ") || "없음"}
지금 글자 모양: ${JSON.stringify((node.props as { style?: unknown }).style ?? {})}
## 고를 수 있는 값
${fields.map((field) => `- props.${field.name}(${field.label}): ${field.options.map((option) => `${option.value}=${option.label}`).join(", ")}`).join("\n") || "- 모양 선택지 없음"}
- style.<부분>.color: ${STRUCTURED_STYLE_COLORS.map((value) => `${value}=${STYLE_COLOR_LABELS[value]}`).join(", ")}
- style.<부분>.font: ${STRUCTURED_STYLE_FONTS.map((value) => `${value}=${STYLE_FONT_LABELS[value]}`).join(", ")}
- style.<부분>.size: 디자인의 글자 크기 단계 ${design.typography.scale.map((step) => `${step.name}(${step.size})`).join(", ")}
## 지금 글
${paths.map((path) => `${path}: ${JSON.stringify(readStructuredText(snapshot.content, path) ?? "")}`).join("\n") || "없음"}
## 출처
${source.slice(0, 6_000)}
## 사용자 요청
${input.instruction}
## 출력
note에 무엇을 바꿨는지 한두 문장으로 씁니다. 바꿀 칸만 props · style · text에 넣습니다. text의 path는 위 「지금 글」의 경로만 씁니다. 비우면 지워지는 칸은 기간 · 인용 · 이전 값 · 설명입니다.`;
    const result = await this.ai.complete<Output>(
      { contract: "partial_edit", system: INSTRUCT_SYSTEM, prompt, promptVersion: PAGE_PROMPT_VERSION },
      schema as unknown as z.ZodType<Output>,
      { check, userId: input.userId },
    );
    return { edit: toEdit(result.data), note: result.data.note, usage: result.usage };
  }

  /** 기록 하나를 지면의 사례 섹션으로 씁니다. 칸 길이 · 수치 모양 · 근거는 같은 대화에서 그 칸만 고쳐 받습니다. */
  async writeSection(input: { userId: string; id: string; title: string; text: string }): Promise<{ section: StructuredSection; usage: AiUsage }> {
    const S = FILL_LIMITS.section;
    const budget = RECORD_SECTION_BUDGET;
    const schema = sectionFillSchema();
    type Output = z.infer<typeof schema>;
    const chars = (value: string | undefined) => [...(value ?? "")].length;
    const check = (output: Output): AiViolation[] => {
      const violations: AiViolation[] = [];
      const limit = (path: string, value: string | undefined, max: number, name: string) => {
        if (chars(value) > max) violations.push({ path, problem: `${name}은 ${max}자 이내여야 합니다(지금 ${chars(value)}자).` });
      };
      limit("/title", output.title, budget.title, "제목");
      limit("/summary", output.summary, budget.summary, "요약");
      limit("/body", output.body, budget.body, "본문");
      limit("/quote", output.quote, budget.quote, "인용");
      limit("/period", output.period, S.period, "기간");
      if (output.details.length > budget.details) violations.push({ path: "/details", problem: `항목은 ${budget.details}개까지입니다.` });
      output.details.forEach((item, index) => {
        limit(`/details/${index}/label`, item.label, S.detailLabel, "항목 이름");
        limit(`/details/${index}/text`, item.text, S.detailText, "항목 설명");
      });
      if (output.metrics.length > budget.metrics) violations.push({ path: "/metrics", problem: `수치는 ${budget.metrics}개까지입니다.` });
      const ungrounded = output.metrics.flatMap((metric, index) => {
        const numbers = ungroundedNumbers([metric.value, metric.before ?? ""].join(" "), input.text);
        return numbers.length ? [`${index}번(${numbers.join(", ")})`] : [];
      });
      if (ungrounded.length)
        violations.push({ path: "/metrics", problem: `출처에 없는 숫자가 있습니다: ${ungrounded.join(", ")}. 출처에 적힌 숫자로 고치고, 맞는 숫자가 없는 수치는 빼서 metrics 목록 전체를 보내세요.` });
      output.metrics.forEach((metric, index) => {
        for (const key of ["value", "before"] as const) {
          const value = metric[key];
          if (value !== undefined && (chars(value) > S.metricValue || !METRIC_VALUE_PATTERN.test(value)))
            violations.push({ path: `/metrics/${index}/${key}`, problem: `수치 값은 숫자와 단위만 ${S.metricValue}자 이내로 씁니다(예: 1.9초, 420KB).` });
        }
      });
      if (output.steps.length > 6) violations.push({ path: "/steps", problem: "단계는 6개까지입니다." });
      output.steps.forEach((step, index) => {
        limit(`/steps/${index}/label`, step.label, S.stepLabel, "단계 이름");
        limit(`/steps/${index}/text`, step.text, S.stepText, "단계 설명");
      });
      const numbers = ungroundedNumbers([output.title, output.summary, output.body, output.quote].join("\n"), input.text);
      if (numbers.length) violations.push({ path: "/body", problem: `출처에 없는 숫자가 있습니다: ${numbers.join(", ")}. 출처의 숫자만 씁니다.` });
      return violations;
    };
    const prompt = `## 채울 칸
커리어 기록 하나를 포트폴리오의 프로젝트 사례 한 개로 씁니다. 제목 ${budget.title}자, 요약 ${budget.summary}자, 본문 ${budget.body}자 이내입니다. 항목(details)은 문제 · 작업 · 결과처럼 ${budget.details}개까지, 수치(metrics)는 출처에 적힌 숫자만 ${budget.metrics}개까지 씁니다. 수치의 value · before는 숫자와 단위만 씁니다. 인용(quote)은 이 작업의 판단 · 원칙 한 문장(${budget.quote}자 이내)이고 없으면 빈 글입니다. 단계(steps)는 작업 순서가 분명할 때만 씁니다. 기간(period)은 출처에 적힌 기간만 씁니다.
## 출처
제목: ${input.title}
${input.text.slice(0, 6_000)}`;
    const result = await this.ai.complete<Output>(
      { contract: "page_fill", system: FILL_SYSTEM, prompt, promptVersion: PAGE_PROMPT_VERSION },
      schema,
      { check, userId: input.userId },
    );
    return { section: toSection(input.id, result.data), usage: result.usage };
  }
}

/** 기록으로 쓰는 사례 한 개의 칸 예산입니다. 설계가 정하는 예산의 보통 크기와 같습니다. */
export const RECORD_SECTION_BUDGET = { title: 40, summary: 120, body: 600, quote: 80, details: 4, metrics: 3 } as const;

function toSection(id: string, output: z.infer<ReturnType<typeof sectionFillSchema>>): StructuredSection {
  return StructuredSectionSchema.parse({
    id,
    title: output.title,
    summary: output.summary,
    body: output.body,
    pattern: "project",
    ...(output.period?.trim() ? { period: output.period.trim() } : {}),
    details: output.details.slice(0, RECORD_SECTION_BUDGET.details),
    media: [],
    sourceIds: [id],
    ...(output.metrics.length ? { metrics: output.metrics.slice(0, RECORD_SECTION_BUDGET.metrics) } : {}),
    ...(output.quote.trim() ? { quote: output.quote.trim() } : {}),
    ...(output.steps.length ? { steps: output.steps.slice(0, 6) } : {}),
  });
}

/** 마크다운을 읽는 글로 바꿉니다. 제목 표시 · 강조 · 링크 문법을 걷어 냅니다. */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * AI가 꺼져 있을 때의 규칙 기반 사례입니다. 제목은 기록 제목, 요약은 본문 첫 문장, 본문은 기록 본문입니다. 글을 지어내지 않습니다.
 */
export function recordSectionByRule(input: { id: string; title: string; text: string }): StructuredSection {
  const text = input.text.slice(0, 4_000);
  const first = text.split(/(?<=[.!?。！？])\s+|\n/).map((part) => part.trim()).find(Boolean) ?? "";
  return StructuredSectionSchema.parse({
    id: input.id,
    title: input.title.slice(0, 300) || "제목 없는 기록",
    summary: [...first].slice(0, RECORD_SECTION_BUDGET.summary).join(""),
    body: text,
    pattern: "project",
    details: [],
    media: [],
    sourceIds: [input.id],
  });
}

/** 기록 사례를 놓을 부품입니다. 글 · 목록형은 사례 행, 나머지는 기사형입니다. */
export function recordCaseType(archetype: PortfolioArchetype | undefined): "CaseRow" | "CaseEssay" {
  return archetype === "list" ? "CaseRow" : "CaseEssay";
}
