import { z } from "zod";

const DOCUMENT_LIMITS = {
  maxDepth: 32,
  maxBlocks: 20_000,
  maxAttrsDepth: 16,
  maxBlockAttrsBytes: 65_536,
  maxMarkAttrsBytes: 8_192,
  maxTextCodePoints: 200_000,
  maxMarks: 20,
  maxDocumentBytes: 4_194_304,
} as const;

const textEncoder = new TextEncoder();

function compactUtf8Bytes(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

function jsonDepth(value: unknown): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce((maximum, item) => Math.max(maximum, jsonDepth(item)), 0);
  }
  if (value !== null && typeof value === "object") {
    return 1 + Object.values(value).reduce((maximum, item) => Math.max(maximum, jsonDepth(item)), 0);
  }
  return 0;
}

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
}).superRefine((mark, context) => {
  if (mark.type === "link" && (typeof mark.attrs?.href !== "string" || mark.attrs.href.length === 0)) {
    context.addIssue({ code: "custom", message: "link mark requires a non-empty href" });
  }
});
export const CareerTextSpanSchema = z.strictObject({
  text: z.string().refine(
    (text) => [...text].length <= DOCUMENT_LIMITS.maxTextCodePoints,
    "text span exceeds 200000 Unicode code points",
  ),
  marks: z.array(CareerMarkSchema).max(DOCUMENT_LIMITS.maxMarks).optional(),
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
  schemaVersion: z.literal(1), type: z.literal("doc"), content: z.array(CareerBlockSchema).max(DOCUMENT_LIMITS.maxBlocks),
}).superRefine((document, context) => {
  const ids = new Set<string>();
  let blockCount = 0;

  const addIssue = (message: string) => context.addIssue({ code: "custom", message });
  const hasNonEmptyContent = (block: CareerBlock) => (block.content?.length ?? 0) > 0;
  const hasNonEmptyText = (block: CareerBlock) => (block.text?.length ?? 0) > 0;
  const requireEmptyContent = (block: CareerBlock) => {
    if (hasNonEmptyContent(block)) addIssue(`${block.type} block cannot have nested content`);
  };
  const requireEmptyText = (block: CareerBlock) => {
    if (hasNonEmptyText(block)) addIssue(`${block.type} block cannot have direct text`);
  };
  const requireExclusiveContentOrText = (block: CareerBlock) => {
    if (hasNonEmptyContent(block) && hasNonEmptyText(block)) {
      addIssue(`${block.type} block cannot have both nested content and direct text`);
    }
  };
  const requireChildren = (block: CareerBlock, childType: string) => {
    if (block.content?.some((child) => child.type !== childType)) {
      addIssue(`${block.type} block children must be ${childType}`);
    }
  };
  const requireNonEmptyStringAttr = (block: CareerBlock, name: string) => {
    if (typeof block.attrs[name] !== "string" || block.attrs[name].length === 0) {
      addIssue(`${block.type} block requires a non-empty ${name}`);
    }
  };
  const validateKnownBlock = (block: CareerBlock) => {
    if (!CAREER_BLOCK_TYPES.includes(block.type as (typeof CAREER_BLOCK_TYPES)[number])) return;
    if (block.attrs.sourceMarkdown !== undefined && typeof block.attrs.sourceMarkdown !== "string") {
      addIssue(`${block.type} block sourceMarkdown must be a string`);
    }
    switch (block.type) {
      case "paragraph":
      case "heading1":
      case "heading2":
      case "heading3":
        requireEmptyContent(block);
        break;
      case "code":
        requireEmptyContent(block);
        if (block.attrs.language !== undefined && block.attrs.language !== null && typeof block.attrs.language !== "string") {
          addIssue("code block language must be a string or null");
        }
        break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        requireEmptyText(block);
        requireChildren(block, "listItem");
        break;
      case "listItem":
        requireExclusiveContentOrText(block);
        if (block.attrs.checked !== undefined && typeof block.attrs.checked !== "boolean") {
          addIssue("listItem block checked must be a boolean");
        }
        break;
      case "blockquote":
      case "callout":
        requireExclusiveContentOrText(block);
        if (block.attrs.icon !== undefined && typeof block.attrs.icon !== "string") {
          addIssue(`${block.type} block icon must be a string`);
        }
        break;
      case "horizontalRule":
        requireEmptyContent(block);
        requireEmptyText(block);
        break;
      case "image":
        requireEmptyContent(block);
        requireEmptyText(block);
        requireNonEmptyStringAttr(block, "mediaId");
        if (block.attrs.alt !== undefined && typeof block.attrs.alt !== "string") {
          addIssue("image block alt must be a string");
        }
        break;
      case "file":
        requireEmptyContent(block);
        requireEmptyText(block);
        requireNonEmptyStringAttr(block, "mediaId");
        if (typeof block.attrs.name !== "string") addIssue("file block name must be a string");
        break;
      case "table":
        requireEmptyText(block);
        requireChildren(block, "tableRow");
        break;
      case "tableRow":
        requireEmptyText(block);
        requireChildren(block, "tableCell");
        break;
      case "tableCell":
        requireExclusiveContentOrText(block);
        break;
      case "evidence":
        requireEmptyContent(block);
        requireNonEmptyStringAttr(block, "source");
        break;
    }
  };

  const visit = (blocks: CareerBlock[], depth: number) => {
    if (depth > DOCUMENT_LIMITS.maxDepth) {
      context.addIssue({ code: "custom", message: "document nesting exceeds 32" });
      return;
    }
    for (const block of blocks) {
      blockCount += 1;
      if (ids.has(block.id)) context.addIssue({ code: "custom", message: `duplicate block id: ${block.id}` });
      ids.add(block.id);
      if (jsonDepth(block.attrs) > DOCUMENT_LIMITS.maxAttrsDepth) addIssue("block attrs nesting exceeds 16");
      if (compactUtf8Bytes(block.attrs) > DOCUMENT_LIMITS.maxBlockAttrsBytes) addIssue("block attrs exceed 65536 bytes");
      for (const span of block.text ?? []) {
        for (const mark of span.marks ?? []) {
          if (mark.attrs && jsonDepth(mark.attrs) > DOCUMENT_LIMITS.maxAttrsDepth) addIssue("mark attrs nesting exceeds 16");
          if (mark.attrs && compactUtf8Bytes(mark.attrs) > DOCUMENT_LIMITS.maxMarkAttrsBytes) {
            addIssue("mark attrs exceed 8192 bytes");
          }
        }
      }
      validateKnownBlock(block);
      if (block.content) visit(block.content, depth + 1);
    }
  };
  visit(document.content, 1);
  if (blockCount > DOCUMENT_LIMITS.maxBlocks) context.addIssue({ code: "custom", message: "document has too many blocks" });
  if (compactUtf8Bytes(document) > DOCUMENT_LIMITS.maxDocumentBytes) addIssue("document exceeds 4194304 bytes");
});

export function parseCareerDocument(input: unknown): CareerDocument { return CareerDocumentSchema.parse(input); }
export function createEmptyCareerDocument(): CareerDocument {
  return { schemaVersion: 1, type: "doc", content: [{ id: globalThis.crypto.randomUUID(), type: "paragraph", attrs: {}, text: [] }] };
}
