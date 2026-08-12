import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { checkClassName, type ClassNameSlot } from "./layout-classes.js";

/**
 * 지면(LayoutSpec).
 *
 * 포트폴리오가 어떻게 그려지는지를 담는다. 준비된 템플릿에서 고르는 것이 아니라
 * **이 사람 이 공고를 위해 매번 새로 짠다.**
 *
 * 두 층으로 나뉜다:
 *
 * - **팔레트 · 타입 · 리듬**은 구조화된 값이다. 실행 시점에 CSS 변수로 펴지고,
 *   대비 같은 검사가 여기서 걸린다.
 * - **클래스 문자열**은 Tailwind 어휘를 그대로 쓴다. 표현의 천장을 우리가 정하지
 *   않는다 — 부술 수 있는 것과 읽을 수 없는 것만 막는다(`layout-classes.ts`).
 *
 * 그리고 지면은 두 겹이다. 이 스펙이 **기본값**을 정하고, 사용자가 요소를 직접
 * 고치면 `block.style`이 그 자리를 **덮어쓴다**. 스펙을 다시 짜도 직접 고친
 * 값은 남는다(P3).
 */

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * 클래스 문자열. 막힌 것이 하나라도 있으면 스펙 자체가 거절된다.
 *
 * 자리를 함께 준다 — 섹션 지면과 카드 표지는 같은 클래스라도 뜻이 다르다.
 * 그라디언트가 그렇다(`layout-classes.ts`).
 */
function className(slot: ClassNameSlot) {
  return z
    .string()
    .max(400)
    .superRefine((value, context) => {
      const checked = checkClassName(value, slot);
      for (const { className: token, reason } of checked.rejected) {
        context.addIssue({ code: "custom", message: `${token} — ${reason}` });
      }
    });
}

/** 섹션 지면 · 페이지 골격. 배경이 되는 자리다. */
const SectionClassNameSchema = className("section");
/** 카드 · 블록. 표지 미술이 허용되는 자리다. */
const BlockClassNameSchema = className("block");

export const FontRoleSchema = z.enum([
  "sans-neutral",
  "sans-geometric",
  "serif-editorial",
  "serif-humanist",
  "mono-technical",
]);

export const TypeSpecSchema = z.strictObject({
  display: FontRoleSchema,
  body: FontRoleSchema,
  /** 제목 계단의 비율. 작으면 차분하고 크면 강하다. */
  scaleRatio: z.number().min(1.125).max(1.5),
  /** 본문 한 줄 글자 수. 읽기 편한 범위를 벗어나지 않는다. */
  measure: z.number().int().min(45).max(80),
});

/**
 * 네 색. 역할이 정해져 있다.
 *
 * `muted`는 **한 단 낮춘 글자색**이다 — 면이 아니다. 전에는 "톤을 낮춘 면"이라고
 * 적어 두었는데 실측에서 모델 셋이 셋 다 `text-muted`로 썼고, 그게 맞다:
 * 이름표 · 캡션 · 부연은 본문보다 조용해야 하고 그럴 자리가 팔레트에 필요하다.
 * 옅은 면이 필요하면 `bg-muted/10`처럼 농도로 깐다.
 */
export const PaletteSchema = z.strictObject({
  ink: HexColorSchema,
  paper: HexColorSchema,
  accent: HexColorSchema,
  muted: HexColorSchema,
});

export const RhythmSchema = z.strictObject({
  density: z.enum(["compact", "comfortable", "spacious"]),
  sectionGap: z.number().int().min(32).max(160),
});

// ── 배치 나무 ─────────────────────────────────────────────────────────

/**
 * 섹션 안이 **평평하지 않다.**
 *
 * 전에는 섹션이 블록의 일렬 목록이었다. 그래서 만들 수 없는 것이 있었다 —
 * 테두리 안에 제목·수치·목록이 함께 든 **카드**가 그렇다. 카드는 블록 몇 개를
 * 한 상자로 묶는 일인데 묶을 방법이 없었고, 지면은 늘 "여백만 다른 글 덩어리"가
 * 됐다.
 *
 * 묶는 일은 **내용이 아니라 지면의 판단이다.** 문장은 writer가 쓰고, 그중
 * 어느 셋을 한 카드로 세울지는 designer가 정한다. 그래서 이 나무는 블록 표가
 * 아니라 `LayoutSpec` 안에 산다 — 지면을 다시 짜면 묶음도 다시 짜이고, 사용자가
 * 블록에 직접 준 값은 그대로 남는다(P3).
 */

/**
 * 잎 — 블록 하나. `className`이 그 블록만의 지면이다.
 *
 * 목록에는 두 겹이 더 있다. 목록 블록의 클래스는 **바깥 상자**에 붙지 한 줄
 * 한 줄에 닿지 않아서, 그것만으로는 칩도 스펙 행도 만들 수 없었다 —
 * `기술 · Java · Kotlin`이 늘 불릿 세 줄로만 섰다.
 */
export const LayoutBlockItemSchema = z.strictObject({
  kind: z.literal("block"),
  blockId: UuidSchema,
  /** 이 블록에만 붙는다. 종류 기본값(`blockClasses`)을 덮어쓴다. */
  className: BlockClassNameSchema.optional(),
  /**
   * 목록의 **한 줄**에 붙는다. 칩은 여기서 나온다 —
   * `inline-flex rounded-full border border-hairline px-3 py-1`.
   */
  itemClassName: BlockClassNameSchema.optional(),
  /** 이름–값 목록에서 **이름 쪽**에만 붙는다. 값보다 조용해야 한다. */
  termClassName: BlockClassNameSchema.optional(),
});

/** 섹션 이름표를 나무 안 어디에 세울지. 없으면 렌더러가 맨 앞에 둔다. */
export const LayoutLabelItemSchema = z.strictObject({
  kind: z.literal("label"),
  className: BlockClassNameSchema.optional(),
});

const leaf = () => z.discriminatedUnion("kind", [LayoutBlockItemSchema, LayoutLabelItemSchema]);

/** 묶음 안의 묶음. 카드 안 2단 같은 것이 여기서 나온다. 여기서 끝이다. */
export const LayoutInnerGroupSchema = z.strictObject({
  kind: z.literal("group"),
  className: BlockClassNameSchema,
  items: z.array(leaf()).min(1).max(24),
});

/** 카드 한 장. 테두리 · 배경 · 표지 그라디언트가 여기 붙는다. */
export const LayoutGroupSchema = z.strictObject({
  kind: z.literal("group"),
  className: BlockClassNameSchema,
  items: z
    .array(z.discriminatedUnion("kind", [
      LayoutBlockItemSchema,
      LayoutLabelItemSchema,
      LayoutInnerGroupSchema,
    ]))
    .min(1)
    .max(24),
});

const LayoutItemsSchema = z
  .array(z.discriminatedUnion("kind", [
    LayoutBlockItemSchema,
    LayoutLabelItemSchema,
    LayoutGroupSchema,
  ]))
  .max(60)
  .default([]);

export const LayoutSectionSchema = z.strictObject({
  portfolioSectionId: UuidSchema,
  /** 섹션 지면 — 배경 · 여백 · 폭. */
  className: SectionClassNameSchema,
  /** 섹션 안 블록들의 배치 — 그리드 · 간격. */
  innerClassName: SectionClassNameSchema,
  /**
   * 이 섹션 안의 배치. 비우면 블록을 순서대로 눕힌다(옛 지면이 그렇다).
   * 여기 없는 블록은 **버려지지 않고** 맨 뒤에 붙는다 — 지면의 실수로 내용이
   * 사라지지는 않는다.
   */
  items: LayoutItemsSchema,
});

export const BLOCK_KINDS = [
  "heading",
  "paragraph",
  "list",
  "metric",
  "chart",
  "media",
] as const;

/** 스펙과 초안이 공유하는 부분. 섹션을 무엇으로 가리키는지만 다르다. */
const LAYOUT_SHAPE = {
  type: TypeSpecSchema,
  palette: PaletteSchema,
  rhythm: RhythmSchema,
  /** 페이지 전체 컨테이너. 여기서 지면의 큰 골격이 잡힌다. */
  pageClassName: SectionClassNameSchema,
  /**
   * 섹션 이름표의 기본 모양. 배치 나무가 자리를 정하지 않으면 섹션 맨 앞에
   * 선다. 여기까지 스펙이 정해야 지면 전체가 한 손에서 나온다 — 이 한 줄만
   * 렌더러가 쥐고 있으면 밀도를 compact로 내린 지면에서 이름표만 혼자 크게 남는다.
   */
  sectionLabelClassName: BlockClassNameSchema,
  /**
   * 블록 종류별 **기본값**. 이 블록만 다르게 세우려면 배치 나무의
   * `className`이 덮어쓴다. 없는 종류는 비워 둔다 — 미디어가 없는
   * 포트폴리오에 미디어 클래스를 짜내게 하지 않는다.
   */
  blockClasses: z.partialRecord(z.enum(BLOCK_KINDS), BlockClassNameSchema),
  /** 이 지면을 왜 이렇게 짰는지 한 문장. 후보 비교에 그대로 쓴다. */
  rationale: z.string().min(1).max(300),
} as const;

// ── 검증 ──────────────────────────────────────────────────────────────

/** WCAG 상대 휘도. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as
    [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** 본문 대비 하한. §12 접근성 기준. */
export const MINIMUM_BODY_CONTRAST = 4.5;
/** 큰 글자(제목·수치)에 허용되는 하한. */
export const MINIMUM_LARGE_CONTRAST = 3;

/** 읽을 수 없는 지면은 아무리 예뻐도 실패다. §12 접근성 기준. */
function refinePalette(palette: z.infer<typeof PaletteSchema>, context: z.RefinementCtx): void {
  if (contrastRatio(palette.ink, palette.paper) < MINIMUM_BODY_CONTRAST) {
    context.addIssue({
      code: "custom",
      message: `본문 대비가 ${MINIMUM_BODY_CONTRAST}:1 미만입니다`,
      path: ["palette", "ink"],
    });
  }
  if (contrastRatio(palette.accent, palette.paper) < MINIMUM_LARGE_CONTRAST) {
    context.addIssue({
      code: "custom",
      message: `강조색 대비가 ${MINIMUM_LARGE_CONTRAST}:1 미만입니다`,
      path: ["palette", "accent"],
    });
  }
  // muted도 글자색이다. 이름표와 캡션이 여기서 나오므로 본문 기준을 그대로 받는다.
  if (contrastRatio(palette.muted, palette.paper) < MINIMUM_BODY_CONTRAST) {
    context.addIssue({
      code: "custom",
      message: `낮춘 글자색 대비가 ${MINIMUM_BODY_CONTRAST}:1 미만입니다`,
      path: ["palette", "muted"],
    });
  }
  // 어두운 지면을 쓴다면 그 위의 글자도 읽혀야 한다.
  if (contrastRatio(palette.paper, palette.ink) < MINIMUM_BODY_CONTRAST) {
    context.addIssue({
      code: "custom",
      message: "어두운 지면 위 글자 대비가 부족합니다",
      path: ["palette", "paper"],
    });
  }
}

/** 후보끼리 얼마나 다른지 재는 기준. 팔레트만 바꾼 지면은 같은 지면이다. */
function shapeOf(spec: {
  type: { display: string };
  rhythm: { density: string };
  pageClassName: string;
}): string {
  return `${spec.type.display} ${spec.rhythm.density} ${spec.pageClassName}`;
}

function refineDistinct(
  candidates: readonly { type: { display: string }; rhythm: { density: string }; pageClassName: string }[],
  context: z.RefinementCtx,
): void {
  if (new Set(candidates.map(shapeOf)).size < candidates.length) {
    context.addIssue({
      code: "custom",
      message: "후보가 서로 충분히 다르지 않습니다 (서체 · 밀도 · 지면 골격이 겹칩니다)",
      path: ["candidates"],
    });
  }
}

export const LayoutSpecSchema = z
  .strictObject({
    ...LAYOUT_SHAPE,
    sections: z.array(LayoutSectionSchema).min(1),
  })
  .superRefine((spec, context) => {
    refinePalette(spec.palette, context);
    // 같은 섹션을 두 번 배치하지 않는다.
    const seen = new Set<string>();
    for (const section of spec.sections) {
      if (seen.has(section.portfolioSectionId)) {
        context.addIssue({
          code: "custom",
          message: "같은 섹션이 두 번 배치되었습니다",
          path: ["sections"],
        });
      }
      seen.add(section.portfolioSectionId);
    }
  });

/** 저장된 지면. 재생성할 때마다 새 행이 쌓인다. */
export const StoredLayoutSpecSchema = z.strictObject({
  id: UuidSchema,
  portfolioId: UuidSchema,
  seedTemplateId: UuidSchema.nullable(),
  spec: LayoutSpecSchema,
  promptVersion: z.number().int().positive(),
  editedBy: z.enum(["ai", "user"]),
  /** 같은 배치 안에서의 후보 순서. 03이 이 순서로 나란히 놓는다. */
  orderNo: z.number().int().nonnegative(),
  /** 어떤 지시로 나왔나. 생성으로 나온 후보는 null이다(§8.3 지면 변형). */
  instruction: z.string().max(300).nullable(),
  createdAt: TimestampSchema,
});

/** 03 후보 비교. 가장 최근 배치만 준다 — 옛 후보를 다시 고르는 화면이 아니다. */
export const LayoutCandidateListResponseSchema = z.strictObject({
  data: z.strictObject({
    selectedId: UuidSchema.nullable(),
    candidates: z.array(StoredLayoutSpecSchema),
  }),
});

/** 04 "말로 고치기". 한 문장이면 충분하다. */
export const RemixLayoutSchema = z.strictObject({
  instruction: z.string().trim().min(1).max(300),
});

export const LayoutSelectionParamsSchema = z.strictObject({
  id: UuidSchema,
  layoutId: UuidSchema,
});

/**
 * 후보 3안. **서로 뚜렷하게 달라야 한다** — 팔레트만 바뀐 같은 지면은 후보가
 * 아니다. 사용자가 셋을 나란히 놓고 고를 이유가 있어야 한다.
 */
export const LayoutCandidatesSchema = z
  .strictObject({ candidates: z.array(LayoutSpecSchema).length(3) })
  .superRefine((value, context) => refineDistinct(value.candidates, context));

// ── 모델이 내는 초안 ──────────────────────────────────────────────────

/**
 * 지면 초안. **모델은 이 모양으로 낸다.**
 *
 * 섹션을 UUID가 아니라 **번호**로 가리키는 것이 유일한 차이다. 공고 분석에서
 * 글자 위치를 모델에게 세라고 하지 않은 것과 같은 이유다 — 모델은 36자리
 * 식별자를 정확히 옮겨 적지 못하고, 한 글자만 틀려도 그 섹션이 지면에서
 * 통째로 사라진다. 번호를 UUID로 바꾸는 일은 우리가 한다.
 */

/** 잎 — 프롬프트에서 준 **블록 번호**. 페이지 전체에서 1부터 이어 센다. */
export const LayoutDraftBlockItemSchema = z.strictObject({
  kind: z.literal("block"),
  block: z.number().int().min(1).max(400),
  className: BlockClassNameSchema.optional(),
  /** 목록 한 줄에 붙는다. 칩이 여기서 나온다. */
  itemClassName: BlockClassNameSchema.optional(),
  /** 이름–값 목록의 이름 쪽. */
  termClassName: BlockClassNameSchema.optional(),
});

const draftLeaf = () =>
  z.discriminatedUnion("kind", [LayoutDraftBlockItemSchema, LayoutLabelItemSchema]);

export const LayoutDraftInnerGroupSchema = z.strictObject({
  kind: z.literal("group"),
  className: BlockClassNameSchema,
  items: z.array(draftLeaf()).min(1).max(24),
});

export const LayoutDraftGroupSchema = z.strictObject({
  kind: z.literal("group"),
  className: BlockClassNameSchema,
  items: z
    .array(z.discriminatedUnion("kind", [
      LayoutDraftBlockItemSchema,
      LayoutLabelItemSchema,
      LayoutDraftInnerGroupSchema,
    ]))
    .min(1)
    .max(24),
});

export const LayoutDraftSectionSchema = z.strictObject({
  /** 프롬프트에서 준 섹션 번호. 1부터 센다. */
  section: z.number().int().min(1).max(40),
  className: SectionClassNameSchema,
  innerClassName: SectionClassNameSchema,
  items: z
    .array(z.discriminatedUnion("kind", [
      LayoutDraftBlockItemSchema,
      LayoutLabelItemSchema,
      LayoutDraftGroupSchema,
    ]))
    .max(60)
    .default([]),
});

export const LayoutDraftSchema = z
  .strictObject({
    ...LAYOUT_SHAPE,
    sections: z.array(LayoutDraftSectionSchema).min(1).max(40),
  })
  .superRefine((draft, context) => {
    refinePalette(draft.palette, context);
    const seen = new Set<number>();
    for (const section of draft.sections) {
      if (seen.has(section.section)) {
        context.addIssue({
          code: "custom",
          message: `${section.section}번 섹션이 두 번 배치되었습니다`,
          path: ["sections"],
        });
      }
      seen.add(section.section);
    }
    // 같은 블록을 두 군데 세우면 같은 문장이 지면에 두 번 나온다.
    const placed = new Set<number>();
    for (const block of draft.sections.flatMap(({ items }) => draftBlockNumbers(items))) {
      if (placed.has(block)) {
        context.addIssue({
          code: "custom",
          message: `${block}번 블록이 두 번 배치되었습니다`,
          path: ["sections"],
        });
      }
      placed.add(block);
    }
  });

/** 초안 나무가 가리키는 블록 번호를 전부 모은다. */
export function draftBlockNumbers(
  items: readonly { kind: string; block?: number; items?: readonly unknown[] }[],
): number[] {
  return items.flatMap((item) => {
    if (item.kind === "block" && typeof item.block === "number") return [item.block];
    if (item.kind === "group" && Array.isArray(item.items)) {
      return draftBlockNumbers(item.items as Parameters<typeof draftBlockNumbers>[0]);
    }
    return [];
  });
}

/**
 * 후보 3안. **서로 뚜렷하게 달라야 한다** — 팔레트만 바꾼 같은 지면은 후보가
 * 아니다. 사용자가 셋을 나란히 놓고 고를 이유가 있어야 한다.
 */
export const LayoutDraftCandidatesSchema = z
  .strictObject({ candidates: z.array(LayoutDraftSchema).length(3) })
  .superRefine((value, context) => refineDistinct(value.candidates, context));

export type FontRole = z.infer<typeof FontRoleSchema>;
export type LayoutSection = z.infer<typeof LayoutSectionSchema>;
export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;
export type LayoutDraft = z.infer<typeof LayoutDraftSchema>;
export type LayoutDraftSection = z.infer<typeof LayoutDraftSectionSchema>;
export type StoredLayoutSpec = z.infer<typeof StoredLayoutSpecSchema>;
/** 배치 나무의 한 칸. 렌더러가 이 모양을 그대로 내려간다. */
export type LayoutItem = LayoutSection["items"][number];
export type LayoutDraftItem = LayoutDraftSection["items"][number];
