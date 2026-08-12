import { z } from "zod";
import { UuidSchema } from "./common.js";

/**
 * 블록 하나에 사용자가 준 모양.
 *
 * 값은 px도 hex도 아니다. **지면이 정한 계단과 팔레트 위에서** 고른다 —
 * `size`는 `LayoutSpec`이 런타임에 채우는 타입 계단의 칸이고, `color`는 팔레트
 * 이름이다. 그래서 지면을 바꾸면 이 블록의 크기와 색도 새 지면을 따라간다.
 *
 * px과 hex를 담으면 지면을 갈아도 그 블록만 옛 지면 값으로 남는다. 지면 클래스는
 * 임의값(`text-[34px]`)을 애초에 거절하는데(`layout-classes.ts`), 사용자 편집만
 * 예외를 두면 그 규칙이 무의미해진다.
 */
export const BlockStyleSchema = z.strictObject({
  /** 지면 타입 계단의 칸. 가운데가 `step0`이다. */
  size: z.enum(["step-1", "step0", "step1", "step2", "step3", "step4"]).optional(),
  weight: z.enum(["normal", "medium", "semibold", "bold"]).optional(),
  italic: z.boolean().optional(),
  strike: z.boolean().optional(),
  /** 팔레트 이름. `inherit`는 지면이 정한 색을 그대로 쓴다. */
  color: z.enum(["inherit", "ink", "accent", "muted"]).optional(),
  /** 형광 — 팔레트 강조색을 옅게 깐다. */
  highlight: z.boolean().optional(),
  alignment: z.enum(["start", "center", "end"]).optional(),
  /** 줄 간격. */
  spacing: z.enum(["compact", "normal", "wide"]).optional(),
});

export const PortfolioEditCommandSchema = z.discriminatedUnion("operation", [
  /**
   * 한 칸을 직접 고친다(04b 속성 패널).
   *
   * 어느 칸인지는 `path`가 말한다 — 문단은 `content.text`, 수치는 `content.value`와
   * `content.label`이다. 블록 종류마다 고칠 수 있는 자리가 정해져 있고, 그 밖은
   * 서버가 거절한다. 비우면 `content.text`다.
   */
  z.strictObject({
    operation: z.literal("update_text"),
    path: z.string().min(1).max(60).optional(),
    text: z.string().min(1).max(100_000),
  }),
  z.strictObject({
    operation: z.literal("set_style"),
    style: BlockStyleSchema.refine((value) => Object.keys(value).length > 0),
  }),
  z.strictObject({ operation: z.literal("insert_record"), recordId: UuidSchema }),
  /**
   * 말로 고치기(§8.3 부분 편집).
   *
   * 사용자가 "이 문단을 짧게" 같은 지시를 준다. 무엇을 어떻게 바꿀지는 계약이
   * 정하고, 바뀐 자리마다 patch가 하나씩 나온다.
   */
  z.strictObject({
    operation: z.literal("instruct"),
    instruction: z.string().trim().min(1).max(500),
  }),
]);

/**
 * 바뀐 자리 하나.
 *
 * §8.3: "변경 요약 UI가 이 배열을 그대로 렌더한다." 그래서 label이 계약에
 * 들어 있다 — 무엇을 왜 바꿨는지는 모델이 말해야 사용자가 받아들일지 정한다.
 */
export const PortfolioEditPatchSchema = z.strictObject({
  /** 블록 안의 자리. `content.text` · `content.value` · `content.label`. */
  path: z.string().min(1).max(120),
  before: z.string().max(100_000),
  after: z.string().max(100_000),
  /** 이 변경을 한 줄로. "군더더기 두 문장을 덜어냈습니다" */
  label: z.string().trim().min(1).max(120),
});

export const PortfolioEditDraftSchema = z.strictObject({
  patches: z.array(PortfolioEditPatchSchema).min(1).max(6),
});

export const PortfolioEditProposalSchema = z.strictObject({
  id: UuidSchema,
  portfolioId: UuidSchema,
  blockId: UuidSchema,
  targetPath: z.string().min(1).max(500),
  operation: z.enum(["update_text", "set_style", "insert_record", "instruct"]),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  sourceRecordId: UuidSchema.nullable(),
  /** 무엇을 시켰나. 기계적 편집은 null. */
  instruction: z.string().max(500).nullable(),
  /** 바뀐 자리들. 04b 변경 요약이 이 배열을 그대로 그린다. */
  patches: z.array(PortfolioEditPatchSchema),
  status: z.enum(["pending", "applied", "rejected", "expired"]),
});

export const ApplyPortfolioEditResultSchema = z.strictObject({
  proposal: PortfolioEditProposalSchema,
  revisionId: UuidSchema,
  locked: z.literal(true),
});

/**
 * 04 섹션 조작.
 *
 * 섹션은 **지우지 않는다.** 레시피가 만든 자리이고, 지우면 그 자리가 무엇이었는지도
 * 사라진다. 대신 숨긴다 — 숨긴 섹션은 배포에 나가지 않고 자리는 남는다.
 */
export const UpdatePortfolioSectionSchema = z.strictObject({
  visible: z.boolean(),
});

/**
 * 순서 바꾸기. **지면 전체의 차례를 통째로** 보낸다.
 *
 * 한 섹션의 순서만 고칠 수 없다 — `order_no`가 포트폴리오 안에서 유일해야 해서
 * 하나만 바꾸면 다른 섹션과 부딪힌다. 보낸 목록이 지금 섹션과 정확히 같지 않으면
 * 거절한다.
 */
export const ReorderPortfolioSectionsSchema = z.strictObject({
  sectionIds: z.array(UuidSchema).min(1).max(50),
});

/** 04 캔버스 툴바 — 한 섹션 안의 블록 차례. 섹션과 같은 규칙으로 통째로 보낸다. */
export const ReorderBlocksSchema = z.strictObject({
  blockIds: z.array(UuidSchema).min(1).max(100),
});

export const RestorePortfolioSchema = z.strictObject({
  snapshotId: UuidSchema,
  confirm: z.literal(true),
});

export type BlockStyle = z.infer<typeof BlockStyleSchema>;
export type PortfolioEditCommand = z.infer<typeof PortfolioEditCommandSchema>;
export type PortfolioEditPatch = z.infer<typeof PortfolioEditPatchSchema>;
export type PortfolioEditDraft = z.infer<typeof PortfolioEditDraftSchema>;
