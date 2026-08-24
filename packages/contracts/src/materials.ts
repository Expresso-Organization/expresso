import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { BrewJobStatusSchema } from "./jobs.js";

export const CreateBrewSchema = z.strictObject({
  jobAnalysisId: UuidSchema,
  lengthPreset: z.enum(["single", "double", "triple"]).default("single"),
});

export const CreateFreeBrewSchema = z.strictObject({
  title: z.string().min(1).max(300),
  brief: z.string().min(1).max(20_000),
  lengthPreset: z.enum(["single", "double", "triple"]).default("single"),
});

export const BrewMaterialSchema = z.strictObject({
  recordId: UuidSchema,
  title: z.string().max(300),
  status: z.enum(["organized", "verified"]),
  score: z.number().int().nonnegative(),
  /** 매칭 순위. 재료가 정해질 때 한 번 매겨지고 고르기로는 바뀌지 않는다. */
  rank: z.number().int().nonnegative(),
  selected: z.boolean(),
  selectedBy: z.enum(["auto", "user"]),
  excludedReason: z.string().min(1).max(300).nullable(),
  /** 01b 표가 그리는 것 — 어느 서랍의 기록인지, 언제 일인지, 어디서 온 글인지. */
  categoryName: z.string().min(1).max(80),
  categoryIcon: z.string().min(1).max(40),
  periodFrom: z.iso.date().nullable(),
  periodTo: z.iso.date().nullable(),
  origin: z.enum(["manual", "ai", "interview", "import"]),
  /** 왜 이 순위인가. 랭킹이 남긴 말 그대로. */
  reason: z.string().min(1).max(300),
});

export const BrewMaterialsSchema = z.strictObject({
  brewId: UuidSchema,
  jobAnalysisId: UuidSchema,
  updatedAt: TimestampSchema,
  /** 한 번에 담을 수 있는 재료 수. 화면이 "10건까지"라고 말하려면 알아야 한다. */
  selectionLimit: z.number().int().positive(),
  mode: z.enum(["solo", "collab"]),
  lengthPreset: z.enum(["single", "double", "triple"]),
  materials: z.array(BrewMaterialSchema).max(50),
});

/** 01b 오른쪽 레일의 제작 모드. `collab`은 PRO다. */
export const UpdateBrewSchema = z.strictObject({
  mode: z.enum(["solo", "collab"]),
});

export const UpdateBrewMaterialsSchema = z.strictObject({
  recordIds: z.array(UuidSchema).min(1).max(10)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "record IDs must be unique",
    }),
});

export const BrewMaterialsResponseSchema = z.strictObject({ data: BrewMaterialsSchema });

export type CreateBrew = z.infer<typeof CreateBrewSchema>;
export type CreateFreeBrew = z.infer<typeof CreateFreeBrewSchema>;
export type BrewMaterial = z.infer<typeof BrewMaterialSchema>;
export type BrewMaterials = z.infer<typeof BrewMaterialsSchema>;
export type UpdateBrewMaterials = z.infer<typeof UpdateBrewMaterialsSchema>;
export type UpdateBrew = z.infer<typeof UpdateBrewSchema>;

/**
 * 위저드가 자기 자리를 되찾는 데 필요한 것.
 *
 * 01b·02b는 brewId 하나만 들고 열린다 — 어느 인터뷰 세션인지, 레시피가 이미
 * 있는지, 지금 뭔가 만들어지는 중인지를 여기서 읽는다.
 */
export const BrewStateSchema = z.strictObject({
  brewId: UuidSchema,
  jobAnalysisId: UuidSchema,
  status: z.enum(["draft", "interviewing", "recipe", "generating", "done"]),
  lengthPreset: z.enum(["single", "double", "triple"]),
  freeTitle: z.string().min(1).max(300).nullable(),
  freeBrief: z.string().min(1).max(20_000).nullable(),
  /** 위저드 머리말에 그리는 공고. */
  posting: z.strictObject({
    title: z.string().min(1).max(300),
    companyName: z.string().min(1).max(200),
  }).nullable(),
  materials: z.strictObject({
    selected: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  interviewSessionId: UuidSchema.nullable(),
  recipeId: UuidSchema.nullable(),
  /**
   * 이 제작이 낳은 포트폴리오. 추출이 끝나야 생긴다.
   *
   * 03이 이걸 본다 — 이미 추출한 제작에 다시 들어오면 또 뽑는 것이 아니라
   * 만든 것을 여는 게 맞다. 추출은 이번 달 횟수를 쓰는 일이다.
   */
  portfolioId: UuidSchema.nullable(),
  /** 가장 최근 제작 잡. 만들어지는 중이면 화면이 기다린다. */
  latestJob: BrewJobStatusSchema.nullable(),
  /**
   * 가장 최근 추출. 03이 이걸 보고 고르기와 기다리기를 가른다.
   *
   * 질문·레시피 잡(`brew_job`)과 표가 다르다 — 추출은 이번 달 횟수를 쓰고
   * 포트폴리오를 낳는 일이라 처음부터 제 표(`generation_job`)에 있었다.
   */
  latestGeneration: z.strictObject({
    id: UuidSchema,
    status: z.enum(["queued", "running", "done", "failed"]),
    stage: z.enum(["queued", "validating", "materializing", "charging", "done", "failed"]),
    portfolioId: UuidSchema.nullable(),
    failureCode: z.string().min(1).max(100).nullable(),
  }).nullable(),
  updatedAt: TimestampSchema,
});

export const BrewStateResponseSchema = z.strictObject({ data: BrewStateSchema });

export type BrewState = z.infer<typeof BrewStateSchema>;
