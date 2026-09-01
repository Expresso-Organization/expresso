import { randomUUID } from "node:crypto";

import { z } from "zod";

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const CAREER_BLOCK_TYPES = [
  "paragraph", "heading1", "heading2", "heading3", "bulletList", "orderedList",
  "taskList", "listItem", "blockquote", "code", "callout", "horizontalRule",
  "image", "file", "table", "tableRow", "tableCell", "evidence",
] as const;

export const CareerBlockTypeSchema = z.union([
  z.enum(CAREER_BLOCK_TYPES),
  z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,63}$/),
]);
export const CareerMarkSchema = z.strictObject({
  type: z.enum(["bold", "italic", "strike", "code", "link"]),
  attrs: z.record(z.string(), JsonValueSchema).optional(),
});
export const CareerTextSpanSchema = z.strictObject({
  text: z.string().max(50_000),
  marks: z.array(CareerMarkSchema).max(20).optional(),
});

export interface CareerTextSpan {
  text: string;
  marks?: Array<z.infer<typeof CareerMarkSchema>> | undefined;
}
export interface CareerBlock {
  id: string;
  type: z.infer<typeof CareerBlockTypeSchema>;
  attrs: Record<string, unknown>;
  content?: CareerBlock[] | undefined;
  text?: CareerTextSpan[] | undefined;
}
export interface CareerDocument {
  schemaVersion: 1;
  type: "doc";
  content: CareerBlock[];
}

export const CareerBlockSchema: z.ZodType<CareerBlock> = z.lazy(() =>
  z.strictObject({
    id: z.uuid(), type: CareerBlockTypeSchema, attrs: z.record(z.string(), JsonValueSchema),
    content: z.array(CareerBlockSchema).optional(), text: z.array(CareerTextSpanSchema).optional(),
  }),
);
export const CareerDocumentSchema: z.ZodType<CareerDocument> = z.strictObject({
  schemaVersion: z.literal(1), type: z.literal("doc"), content: z.array(CareerBlockSchema).max(20_000),
}).superRefine((document, context) => {
  const ids = new Set<string>();
  let blockCount = 0;
  const visit = (blocks: CareerBlock[], depth: number) => {
    if (depth > 32) {
      context.addIssue({ code: "custom", message: "document nesting exceeds 32" });
      return;
    }
    for (const block of blocks) {
      blockCount += 1;
      if (ids.has(block.id)) context.addIssue({ code: "custom", message: `duplicate block id: ${block.id}` });
      ids.add(block.id);
      if (block.content) visit(block.content, depth + 1);
    }
  };
  visit(document.content, 1);
  if (blockCount > 20_000) context.addIssue({ code: "custom", message: "document has too many blocks" });
});

export function parseCareerDocument(input: unknown): CareerDocument { return CareerDocumentSchema.parse(input); }
export function createEmptyCareerDocument(): CareerDocument {
  return { schemaVersion: 1, type: "doc", content: [{ id: randomUUID(), type: "paragraph", attrs: {}, text: [] }] };
}
