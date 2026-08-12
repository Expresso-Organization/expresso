import {
  BLOCK_KINDS,
  LayoutCandidatesSchema,
  LayoutDraftCandidatesSchema,
  classNameRules,
  draftBlockNumbers,
  type LayoutDraft,
  type LayoutDraftItem,
  type LayoutItem,
  type LayoutSpec,
} from "@expresso/contracts";

import { AiError, type AiClient } from "../../platform/ai/client.js";

/**
 * §8.3 「지면 생성」 계약.
 *
 * 지면은 준비된 템플릿에서 고르는 것이 아니라 **이 사람 이 공고를 위해 매번 새로
 * 짠다.** 모델이 타입 · 팔레트 · 리듬과 Tailwind 클래스를 직접 정하고, 우리는
 * 부술 수 있는 것과 읽을 수 없는 것만 막는다(`layout-classes.ts` · 대비 4.5:1).
 *
 * 모델에게 **식별자를 옮겨 적게 하지 않는다.** 섹션도 블록도 번호로 가리킨다.
 * 공고 분석에서 글자 위치를 세라고 하지 않은 것과 같은 이유다 — 36자리 식별자는
 * 한 글자만 틀려도 그 자리가 지면에서 통째로 사라진다.
 */

/** 프롬프트를 고치면 올린다. 저장된 지면에 함께 남아 낡은 결과를 가려낸다. */
export const LAYOUT_PROMPT_VERSION = 3;

export class LayoutDesignError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "LayoutDesignError";
  }
}

export type LayoutBlockKind = (typeof BLOCK_KINDS)[number];

export interface LayoutBlockContext {
  /** 페이지 전체에서 1부터 이어 세는 번호. 모델은 이 번호로 블록을 가리킨다. */
  number: number;
  kind: LayoutBlockKind;
  /** 무엇이 적혀 있는지 앞부분만. 지면은 내용을 보고 정해야 한다. */
  preview: string;
  length: number;
}

export interface LayoutSectionContext {
  title: string;
  blocks: LayoutBlockContext[];
}

export interface LayoutDesignContext {
  /** 배치 순서 그대로. 프롬프트의 번호가 이 배열의 자리다. */
  sections: LayoutSectionContext[];
  company: {
    name: string;
    industry: string | null;
    toneSummary: string | null;
    brandColors: string[];
  } | null;
  jobTitle: string | null;
  jobFamily: string | null;
}

export interface LayoutDesigner {
  design(context: LayoutDesignContext): Promise<LayoutDraft[]>;
}

const SYSTEM = [
  "너는 채용 지원용 포트폴리오의 **지면**을 짜는 디자이너다.",
  "같은 내용으로 서로 다른 지면 3안을 낸다. 사람이 셋을 나란히 놓고 고른다.",
  "",
  "## 무엇을 정하는가",
  "타입 · 팔레트 · 리듬을 정하고, **섹션 안을 어떻게 짜맞출지**를 나무로 낸다.",
  "나무의 칸은 셋이다 —",
  "- `{kind:\"block\", block:번호, className?}` — 블록 하나. className은 **그 블록에만** 붙는다.",
  "- `{kind:\"group\", className, items:[…]}` — 여러 블록을 **한 상자로 묶는다.** 카드가 이것이다.",
  "  묶음 안에 묶음을 한 겹 더 넣을 수 있다(카드 안의 2단).",
  "- `{kind:\"label\", className?}` — 섹션 이름표를 세울 자리. 두지 않으면 맨 앞에 선다.",
  "",
  "블록을 빠뜨려도 지워지지는 않는다(뒤에 붙는다). 다만 그렇게 붙은 블록은 아무",
  "판단도 받지 못한 채 서 있는 것이라, **모든 블록에 자리를 정해 주는 편이 낫다.**",
  "",
  "## 좋은 지면과 밋밋한 지면을 가르는 것",
  "글 덩어리를 세로로 쌓기만 하면 아무리 색과 여백을 골라도 밋밋하다. 실제로",
  "차이를 만드는 것은 **묶음과 대비**다:",
  "",
  "- **카드.** 한 프로젝트의 제목 · 설명 · 수치를 `group`으로 묶고 테두리나 옅은 면을",
  "  깐다. `border border-hairline rounded-2xl p-6 grid gap-3` 같은 것 하나로 지면이",
  "  선다. 다만 **모든 섹션을 같은 카드로 눕히지는 않는다** — 그건 AI 티다.",
  "- **격자.** 수치 · 짧은 항목이 여럿이면 `md:grid-cols-2` · `md:grid-cols-3`으로 견주게",
  "  세운다. 긴 문단은 격자에 넣지 않는다.",
  "- **크기 대비.** 첫 섹션의 제목은 `text-step4`나 `text-step5`, 본문은 `text-step0`.",
  "  같은 크기의 글자만 있는 지면은 읽는 순서를 알려주지 못한다.",
  "- **작은 라벨.** `text-step-1 font-mono tracking-widest uppercase opacity-70` 한 줄이",
  "  섹션 위에 붙으면 지면이 정돈된다. 이름표(`label`)의 className이 그 자리다.",
  "- **한 곳만 다르게.** 여섯 섹션 중 하나를 `bg-ink text-paper`로 뒤집거나 격자로",
  "  바꾸면 그 자리가 기억에 남는다. 전부 다르면 아무 데도 안 남는다.",
  "- **표지.** 카드나 타일 안에서만 그라디언트를 쓸 수 있다",
  "  (`bg-linear-to-br from-accent/40 to-ink/20`). 섹션 배경에는 쓸 수 없다.",
  "- **칩.** 목록 블록에 `itemClassName`을 주면 한 줄 한 줄이 그 모양이 된다.",
  "  기술 · 도구 나열은 불릿보다 칩이 낫다 —",
  "  className: `flex flex-wrap gap-2 list-none`,",
  "  itemClassName: `inline-flex rounded-full border border-hairline px-3 py-1 text-step-1`.",
  "- **스펙 행.** 이름–값 쌍으로 된 목록은 한 줄에 이름과 값을 좌우로 벌린다 —",
  "  itemClassName: `flex items-baseline justify-between gap-4 border-b border-hairline py-2`,",
  "  termClassName: `text-step-1 font-mono uppercase tracking-wider text-muted`.",
  "  이름 쪽은 **값보다 조용해야** 한다. 둘이 같은 무게면 읽는 순서가 사라진다.",
  "",
  "## 내용을 보고 정한다",
  "- 블록 목록을 먼저 읽는다. **무엇이 있는지가 지면을 정한다.**",
  "- metric · chart가 여럿이면 격자와 큰 숫자가 산다. 없으면 타이포로 승부한다.",
  "- chart 블록은 제 그림을 스스로 그린다. 지면은 **자리와 색**만 주면 된다",
  "  (`text-accent`를 주면 강조색으로, `text-ink`면 본문색으로 그려진다).",
  "- 이미지 블록이 있으면 **그게 그 섹션의 주인공이다.** 글 옆에 작게 끼워 넣지 말고",
  "  넓게 세우거나(`md:grid-cols-2`로 글과 반씩) 섹션 폭을 꽉 채운다. 액자(브라우저 창 ·",
  "  폰)는 이미 그려져 나오므로 지면이 테두리를 또 두를 필요는 없다.",
  "- 문단이 길면 폭을 좁히고(measure 50–60) 행간을 넓힌다.",
  "- 섹션이 서넛뿐이면 하나하나를 크게 세우고, 여덟이 넘으면 밀도를 올린다.",
  "- 첫 섹션은 나머지와 다르게 다룬다 — 여백 · 크기 · 지면색 중 하나는 달라야 한다.",
  "- **블록이 한둘뿐인 얇은 섹션**을 그냥 왼쪽에 매달지 않는다. 그러면 오른쪽이",
  "  통째로 비어 지면이 끝나다 만 것처럼 보인다. 셋 중 하나를 한다 —",
  "  가운데로 좁게 세우거나(`max-w-2xl mx-auto text-center`),",
  "  이름표와 내용을 좌우로 벌리거나(`md:grid-cols-3` + 이름표 1칸 · 내용 2칸),",
  "  옅은 면을 깔아 한 덩어리로 만든다(`bg-muted/10 rounded-2xl p-8`).",
  "",
  "## 세 안은 어떻게 달라야 하나",
  "- 팔레트만 바꾼 것은 다른 안이 아니다. **서체 · 밀도 · 지면 골격**이 달라야 한다.",
  "- 각 안은 하나의 판단을 끝까지 민다. 예를 들어 —",
  "  좁은 폭에 세리프를 세운 읽는 지면 / 카드 격자에 수치를 얹은 밀도 높은 지면 /",
  "  첫 섹션을 어둡게 깔아 인상을 먼저 남기는 지면.",
  "- 셋 다 무난하면 고를 이유가 없다. 무난한 안은 한 개면 충분하다.",
  "",
  "## 색",
  "- 기업 톤에서 출발한다. 다만 브랜드 색을 그대로 베끼지 않는다 —",
  "  지원자의 지면이지 회사 홈페이지가 아니다. 채도를 한 단계 내려서 쓴다.",
  "- ink는 본문 글자, paper는 지면, accent는 강조 하나, **muted는 한 단 낮춘 글자색**이다",
  "  (이름표 · 캡션 · 부연이 여기서 나온다). 옅은 면이 필요하면 bg-muted/10처럼 농도로 깐다.",
  "- 대비: ink와 muted는 4.5:1, accent는 3:1을 넘어야 한다. 못 넘기면 그 안은 버려진다.",
  "  회색 위 회색, 옅은 파랑 위 흰색이 여기서 가장 많이 걸린다.",
  "",
  "## AI가 만든 티 — 하지 않는다",
  "- 섹션 배경에 깐 보라-파랑 그라디언트, 유리 효과, 사방에 뜬 그림자 카드.",
  "- 모든 섹션을 같은 크기 같은 여백의 카드로 눕히는 것.",
  "- 전부 가운데 정렬. 이모지.",
  "- 아무 데나 붙인 `shadow-xl` — 그림자는 정말로 떠 있는 것에만 준다.",
  "",
  "## 클래스",
  classNameRules(),
  "",
  "## 좁은 화면",
  "공개되는 지면이라 폰에서 무너지면 안 된다. 격자는 `md:`부터 나누고,",
  "큰 글씨(`text-step4` 이상)나 긴 값이 든 칸에는 `min-w-0`을 붙인다.",
  "",
  "## metric 블록은 두 조각이다",
  "값과 라벨이 나란히 그려진다. `flex items-baseline gap-2`나 `grid`로 둘의 관계를",
  "정해 준다 — 아무것도 주지 않으면 두 조각이 서로 붙는다.",
  "그리고 **값은 본문보다 확실히 커야 한다**(text-step2 이상). 크기를 주지 않으면",
  "애써 꺼낸 수치가 문단과 같은 크기로 서서 꺼낸 의미가 없어진다.",
  "",
  "## 섹션 사이의 숨",
  "`rhythm.sectionGap`이 섹션과 섹션 **사이** 간격이다. 섹션 안쪽 여백은 각 섹션의",
  "`className`(py-*)이 정한다. 둘은 더해진다 — 사이를 넓게 두고 싶으면 sectionGap을",
  "올리고, 그 섹션만 특별히 띄우고 싶으면 그 섹션에 mt-*를 준다.",
  "",
  "## rationale",
  "왜 이렇게 짰는지 한 문장. \"모던하고 깔끔한 디자인\"처럼 어느 지면에나 붙는",
  "말이 아니라, 이 내용을 보고 내린 판단을 쓴다. 사용자가 이 문장을 읽고 고른다.",
].join("\n");

const KIND_LABEL: Record<LayoutBlockKind, string> = {
  heading: "제목",
  paragraph: "문단",
  list: "목록",
  metric: "수치",
  chart: "그림",
  media: "이미지",
};

function describeSection(section: LayoutSectionContext, index: number): string {
  const lines = [`${index + 1}. ${section.title}`];
  if (section.blocks.length === 0) lines.push("   (빈 섹션)");
  for (const block of section.blocks) {
    const preview = block.preview.replaceAll("\n", " ").slice(0, 60);
    lines.push(`   #${block.number} ${KIND_LABEL[block.kind]} ${block.length}자 — ${preview}`);
  }
  return lines.join("\n");
}

function buildPrompt(context: LayoutDesignContext): string {
  const lines: string[] = [];
  if (context.jobTitle) lines.push(`지원 공고: ${context.jobTitle}`);
  if (context.jobFamily) lines.push(`직군: ${context.jobFamily}`);
  if (context.company) {
    const { name, industry, toneSummary, brandColors } = context.company;
    lines.push(`회사: ${name}${industry ? ` (${industry})` : ""}`);
    if (toneSummary) lines.push(`회사 톤: ${toneSummary}`);
    if (brandColors.length > 0) lines.push(`브랜드 색: ${brandColors.join(" ")}`);
  }
  const blockCount = context.sections.reduce((sum, { blocks }) => sum + blocks.length, 0);
  lines.push(
    "",
    `섹션 ${context.sections.length}개 · 블록 ${blockCount}개 — 번호를 그대로 쓴다:`,
  );
  lines.push(...context.sections.map(describeSection));
  lines.push("", "이 내용에 맞는 지면 3안을 짜라.");
  return lines.join("\n");
}

/** 초안이 모든 섹션을 정확히 한 번씩 배치했는지. 빠뜨리면 내용이 사라진다. */
function missingSections(draft: LayoutDraft, sectionCount: number): number[] {
  const placed = new Set(draft.sections.map(({ section }) => section));
  const missing: number[] = [];
  for (let number = 1; number <= sectionCount; number += 1) {
    if (!placed.has(number)) missing.push(number);
  }
  return missing;
}

export class AiLayoutDesigner implements LayoutDesigner {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async design(context: LayoutDesignContext): Promise<LayoutDraft[]> {
    if (context.sections.length === 0) {
      throw new LayoutDesignError("배치할 섹션이 없습니다");
    }

    const prompt = buildPrompt(context);
    let lastError: unknown;
    // §8.3: 기준을 벗어난 값은 무효이며 1회 재생성한다. 대비 · 클래스 · 섹션
    // 누락이 모두 여기서 걸린다 — 도구 쪽 JSON Schema로는 표현할 수 없다.
    for (const attempt of [1, 2]) {
      try {
        const { data } = await this.#ai.complete(
          {
            contract: "layout_draft",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: LAYOUT_PROMPT_VERSION,
          },
          LayoutDraftCandidatesSchema,
        );

        const incomplete = data.candidates.flatMap((draft, index) => {
          const missing = missingSections(draft, context.sections.length);
          return missing.length === 0 ? [] : [`${index + 1}안이 ${missing.join(" · ")}번 섹션을 빠뜨렸습니다`];
        });
        if (incomplete.length > 0) throw new LayoutDesignError(incomplete.join(", "));

        return data.candidates;
      } catch (error) {
        // 레이트 리밋과 실행 실패는 다시 물어도 같은 답이다. 바로 올린다.
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new LayoutDesignError(
      `지면 초안이 두 번 모두 기준을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

/** 두 번째 시도에는 무엇이 틀렸는지 붙여 준다. 같은 실수를 반복시키지 않는다. */
function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 짜라.`;
}

/**
 * 초안의 번호를 실제 식별자로 바꾼다.
 *
 * `sectionIds`는 프롬프트에 넣은 순서와 같아야 한다 — 1번이 `sectionIds[0]`이다.
 * `blockIds`도 마찬가지로 **블록 번호 순서**다.
 *
 * 여기서 다시 `LayoutCandidatesSchema`를 태운다. 초안 단계에서 이미 걸렀지만,
 * 저장 직전의 모양으로 한 번 더 확인하는 편이 싸다.
 */
export function toLayoutSpecs(
  drafts: LayoutDraft[],
  sectionIds: string[],
  blockIds: readonly (string | null)[] = [],
): LayoutSpec[] {
  const candidates = drafts.map((draft) => placeSections(draft, sectionIds, blockIds));

  const parsed = LayoutCandidatesSchema.safeParse({ candidates });
  if (!parsed.success) {
    throw new LayoutDesignError(`지면 후보가 계약을 벗어났습니다: ${parsed.error.message}`);
  }
  return parsed.data.candidates;
}

/**
 * 초안의 번호를 실제 식별자로 바꾼 **하나**의 지면.
 *
 * 없는 번호를 가리키면 그 자리만 버린다 — 블록 하나를 잘못 가리켰다고 지면
 * 전체를 버리지 않는다. 버려진 블록은 렌더러가 섹션 뒤에 붙인다.
 */
export function placeSections(
  draft: LayoutDraft,
  sectionIds: string[],
  blockIds: readonly (string | null)[] = [],
) {
  const { sections, ...rest } = draft;
  const seen = new Set<string>();
  return {
    ...rest,
    sections: sections.flatMap((placement) => {
      const portfolioSectionId = sectionIds[placement.section - 1];
      if (!portfolioSectionId) return [];
      return [{
        portfolioSectionId,
        className: placement.className,
        innerClassName: placement.innerClassName,
        items: placeItems(placement.items, blockIds, seen),
      }];
    }),
  };
}

/** 나무를 내려가며 블록 번호를 식별자로 바꾼다. 빈 묶음은 남기지 않는다. */
function placeItems(
  items: readonly LayoutDraftItem[],
  blockIds: readonly (string | null)[],
  seen: Set<string>,
): LayoutItem[] {
  return items.flatMap((item): LayoutItem[] => {
    if (item.kind === "label") return [item];
    if (item.kind === "group") {
      const inner = placeItems(item.items as readonly LayoutDraftItem[], blockIds, seen);
      // 안이 통째로 비었으면 빈 상자만 남는다. 그건 지면에 구멍이다.
      return inner.length === 0 ? [] : [{ ...item, items: inner } as LayoutItem];
    }
    const blockId = blockIds[item.block - 1];
    // 같은 블록을 두 번 세우면 같은 문장이 지면에 두 번 나온다.
    if (!blockId || seen.has(blockId)) return [];
    seen.add(blockId);
    return [{
      kind: "block",
      blockId,
      ...(item.className === undefined ? {} : { className: item.className }),
      ...(item.itemClassName === undefined ? {} : { itemClassName: item.itemClassName }),
      ...(item.termClassName === undefined ? {} : { termClassName: item.termClassName }),
    }];
  });
}

/** 초안이 모든 섹션을 한 번씩 배치했는지. 빠뜨리면 내용이 사라진다. */
export function unplacedSections(draft: LayoutDraft, sectionCount: number): number[] {
  return missingSections(draft, sectionCount);
}

/** 초안이 자리를 정해 준 블록 번호. 프롬프트 재시도 메모에 쓴다. */
export function placedBlockNumbers(draft: LayoutDraft): number[] {
  return draft.sections.flatMap(({ items }) => draftBlockNumbers(items));
}
