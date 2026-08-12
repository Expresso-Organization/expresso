import { z } from "zod";

import { UuidSchema } from "./common.js";
import { PortfolioChartSchema } from "./portfolio-chart.js";
import { ListItemSchema, TextRunsSchema, flattenRuns } from "./portfolio-text.js";
import { TemplateStyleOverrideSchema } from "./templates.js";

export const SubmitGenerationSchema = z.strictObject({
  recipeId: UuidSchema,
  templateId: UuidSchema,
  styleOverrides: TemplateStyleOverrideSchema.optional(),
});

export const GenerationJobStatusSchema = z.strictObject({
  generationJobId: UuidSchema,
  status: z.enum(["queued", "running", "done", "failed"]),
  stage: z.enum(["queued", "validating", "materializing", "charging", "done", "failed"]),
  attempts: z.number().int().nonnegative(),
  usageCharged: z.boolean(),
  portfolioId: UuidSchema.nullable(),
  failure: z.strictObject({ code: z.string().min(1), retryable: z.boolean() }).nullable(),
});

/**
 * 추출이 만들 수 있는 블록 종류.
 *
 * `media`는 없다 — 자산은 사용자가 올리는 것이지 문장에서 나오지 않는다.
 * 종류를 모델이 고르는 것이 중요하다: 아까운 수치를 문단에 묻지 않고 `metric`으로
 * 꺼내야 지면이 그걸 크게 세울 수 있다(§8.3 지면 생성의 입력이 블록 통계다).
 *
 * `chart`도 같은 이유로 여기 있다. 견줄 수치가 둘 이상이면 큰 숫자를 나란히
 * 놓는 것보다 **그림 하나가 낫다** — 그리고 그림은 근거의 수만으로 서므로
 * 업로드가 필요 없다.
 */
export const DRAFT_BLOCK_KINDS = ["heading", "paragraph", "list", "metric", "chart"] as const;
export const DraftBlockKindSchema = z.enum(DRAFT_BLOCK_KINDS);

/**
 * 모델이 내는 초안 블록.
 *
 * 섹션과 근거를 **번호**로 가리킨다. 지면 생성과 같은 이유다 — 모델은 36자리
 * 식별자를 정확히 옮겨 적지 못하고, 한 글자만 틀리면 그 블록이 통째로 버려진다.
 */
export const GenerationDraftBlockSchema = z
  .strictObject({
    /** 프롬프트에서 준 섹션 번호. 1부터. */
    section: z.number().int().min(1).max(20),
    kind: DraftBlockKindSchema,
    /**
     * heading · paragraph는 문장, list는 줄바꿈으로 나눈 항목,
     * metric은 값 하나("24분" · "3,000만 건").
     *
     * `runs`나 `items`를 주면 여기는 비워도 된다 — 서버가 이어 붙여 채운다.
     * 두 곳에 같은 글을 적게 하면 언젠가 어긋나고, 어긋난 쪽이 근거 검증을 받는다.
     */
    text: z.string().max(4_000).optional(),
    /**
     * 문장 안의 결. 핵심 낱말만 강조하거나 링크를 걸 때 쓴다.
     * heading · paragraph에서만.
     */
    runs: TextRunsSchema.optional(),
    /**
     * 목록의 줄들. 문자열이거나 `{term, value}` 쌍이다.
     * 쌍은 이름과 값이 지면에서 다르게 서야 할 때 쓴다("역할 · 백엔드").
     */
    items: z.array(ListItemSchema).min(2).max(24).optional(),
    /** metric이 무엇을 잰 값인지. 다른 종류에서는 쓰지 않는다. */
    label: z.string().max(80).optional(),
    /** chart의 데이터. 다른 종류에서는 쓰지 않는다. */
    chart: PortfolioChartSchema.optional(),
    /** 이 블록이 쓴 근거 번호. 근거 없는 블록은 만들 수 없다. */
    sources: z.array(z.number().int().min(1).max(60)).min(1).max(8),
  })
  .superRefine((block, context) => {
    // 글은 셋 중 한 곳에서만 온다. 어느 것도 없으면 빈 블록이다.
    const written = draftBlockText(block);
    if (!written.trim()) {
      context.addIssue({
        code: "custom",
        message: "블록에 글이 없습니다 (text · runs · items 중 하나는 있어야 합니다)",
        path: ["text"],
      });
    }
    if (block.runs && block.kind !== "heading" && block.kind !== "paragraph") {
      context.addIssue({
        code: "custom",
        message: "runs는 heading · paragraph에만 씁니다",
        path: ["runs"],
      });
    }
    if (block.items && block.kind !== "list") {
      context.addIssue({
        code: "custom",
        message: "items는 list에만 씁니다",
        path: ["items"],
      });
    }
    if (block.kind === "chart") {
      if (!block.chart) {
        context.addIssue({
          code: "custom",
          message: "chart에는 그림 데이터(chart)가 필요합니다",
          path: ["chart"],
        });
      }
    } else if (block.chart) {
      context.addIssue({
        code: "custom",
        message: "chart 데이터는 chart 블록에만 씁니다",
        path: ["chart"],
      });
    }
    if (block.kind === "metric") {
      // 지면이 크게 세우는 자리다. 문장이 들어오면 지면이 무너진다.
      if ([...written].length > 24) {
        context.addIssue({
          code: "custom",
          message: "metric의 text는 값 하나입니다 (24자 이내)",
          path: ["text"],
        });
      }
      if (!/\d/.test(written)) {
        context.addIssue({
          code: "custom",
          message: "metric에는 숫자가 있어야 합니다",
          path: ["text"],
        });
      }
      if (!block.label?.trim()) {
        context.addIssue({
          code: "custom",
          message: "metric에는 그 값이 무엇인지 적은 label이 필요합니다",
          path: ["label"],
        });
      }
    } else if (block.label?.trim()) {
      context.addIssue({
        code: "custom",
        message: "label은 metric에만 씁니다",
        path: ["label"],
      });
    }
    if (block.kind === "list" && written.split("\n").filter((line) => line.trim()).length < 2) {
      context.addIssue({
        code: "custom",
        message: "목록은 두 항목 이상입니다. 하나뿐이면 문단으로 씁니다",
        path: ["text"],
      });
    }
  });

/**
 * 초안 블록이 실제로 쓴 글.
 *
 * 모델은 `text` · `runs` · `items` 중 하나로 낸다. 무엇으로 냈든 **평문 한 벌**이
 * 나와야 근거 검증(수치)과 잠긴 문장 비교가 지금 그대로 돈다.
 */
export function draftBlockText(block: {
  text?: string | undefined;
  runs?: readonly { text: string }[] | undefined;
  items?: readonly (string | { term: string; value: string })[] | undefined;
}): string {
  if (block.runs && block.runs.length > 0) return flattenRuns(block.runs);
  if (block.items && block.items.length > 0) {
    return block.items
      .map((item) => (typeof item === "string" ? item : `${item.term} ${item.value}`))
      .join("\n");
  }
  return block.text ?? "";
}

export const GenerationDraftSchema = z.strictObject({
  blocks: z.array(GenerationDraftBlockSchema).min(1).max(60),
});

/** 번호를 식별자로 되돌린 뒤의 모양. 검증기와 적재가 이걸 본다. */
export const GenerationOutputSchema = z.strictObject({
  blocks: z.array(z.strictObject({
    recipeSectionId: UuidSchema,
    kind: DraftBlockKindSchema,
    /** 평문 한 벌. `runs`/`items`로 냈어도 여기에 이어 붙어 들어온다. */
    text: z.string().min(1).max(100_000),
    /** 문장 안의 결. 없으면 평문 그대로 그린다. */
    runs: TextRunsSchema.nullable().default(null),
    /** 목록의 줄들. 쌍이면 이름과 값이 갈려 있다. */
    items: z.array(ListItemSchema).nullable().default(null),
    label: z.string().max(80).nullable(),
    /** 그림 블록의 데이터. 나머지 종류에서는 null이다. */
    chart: PortfolioChartSchema.nullable().default(null),
    evidencePathIds: z.array(UuidSchema).min(1).max(20),
  })).min(1).max(200),
});

export const GenerationJobStatusResponseSchema = z.strictObject({
  data: GenerationJobStatusSchema,
});

export type GenerationJobStatus = z.infer<typeof GenerationJobStatusSchema>;
export type DraftBlockKind = z.infer<typeof DraftBlockKindSchema>;
export type GenerationDraft = z.infer<typeof GenerationDraftSchema>;
export type SubmitGeneration = z.infer<typeof SubmitGenerationSchema>;
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;
