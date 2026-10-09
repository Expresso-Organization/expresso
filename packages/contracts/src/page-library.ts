import { z } from "zod";
export const PageLibrarySearchSchema = z.object({
  q: z.string().max(500).default(""),
  slot: z.enum(["intro", "section"]).optional(),
  status: z
    .enum(["renderable", "asset", "guidance", "adapter_needed", "unavailable"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(36),
});
export type PageLibrarySearch = z.infer<typeof PageLibrarySearchSchema>;
export const PageLibraryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  sourceItemId: z.string(),
  renderKey: z.string().nullable(),
  kind: z.string(),
  roles: z.array(z.string()),
  categories: z.array(z.string()),
  sourceUrl: z.string().nullable(),
  rights: z.string(),
  status: z.enum([
    "renderable",
    "asset",
    "guidance",
    "adapter_needed",
    "unavailable",
  ]),
  reason: z.string(),
  slot: z.enum(["intro", "section"]).nullable(),
});
export type PageLibraryItem = z.infer<typeof PageLibraryItemSchema>;
export const PageLibraryResultSchema = z.object({
  inventoryHash: z.string(),
  inventoryTotal: z.number(),
  counts: z.record(z.string(), z.number()),
  total: z.number(),
  page: z.number(),
  items: z.array(PageLibraryItemSchema),
});
export const PageLibrarySelectionSchema = z.object({
  inventoryHash: z.string().regex(/^[0-9a-f]{64}$/),
  inventoryTotal: z.number().int().positive(),
  query: z.string().optional(),
  offeredIds: z.array(z.string()).optional(),
  selected: z.array(
    z.object({
      id: z.string(),
      key: z.string().optional(),
      sourceUrl: z.string().nullable(),
      status: z.string(),
      material: z.string().nullable(),
      sha256: z.string().nullable(),
      adaptation: z.string(),
    }),
  ),
});
