import {
  LayoutDraftSchema,
  LayoutSpecSchema,
  classNameRules,
  type LayoutItem,
  type LayoutSpec,
} from "@expresso/contracts";

import { AiError, type AiClient } from "../../platform/ai/client.js";
import { placeSections, unplacedSections } from "./designer.js";

/**
 * §8.3 「지면 변형」 계약 — 한 문장으로 지면을 고친다.
 *
 * 지면 생성은 후보 셋을 내고 사람이 고르는 일이고, 변형은 **이미 선 지면을**
 * 지시대로 손보는 일이다. "더 차분하게" · "수치를 크게" · "첫 화면을 밝게".
 *
 * 세 가지가 대상이 아니다:
 * - **내용.** 블록 텍스트는 지면의 소관이 아니다. 스펙에 아예 들어 있지 않다.
 * - **사용자가 직접 고친 값.** 렌더가 `LayoutSpec ∘ block.style` 순서로 합성하므로
 *   스펙을 통째로 갈아도 요소에 덮어쓴 값은 그대로 남는다(P3). 구조가 지켜준다.
 * - **섹션의 존재.** 배치를 바꿀 수는 있어도 빠뜨릴 수는 없다.
 */

/** 프롬프트를 고치면 올린다. */
export const REMIX_PROMPT_VERSION = 1;

export class LayoutRemixError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "LayoutRemixError";
  }
}

export interface RemixContext {
  instruction: string;
  /** 지금 선 지면. */
  current: LayoutSpec;
  /** 배치 순서 그대로의 섹션. 프롬프트의 번호가 이 배열의 자리다. */
  sections: { portfolioSectionId: string; title: string }[];
  /**
   * 블록 번호 순서의 식별자. 지면의 배치 나무가 이 번호로 오간다 —
   * 모델에게는 `#3`으로 보이고 저장할 때 우리가 UUID로 되돌린다.
   */
  blockIds: string[];
}

export interface LayoutRemixer {
  remix(context: RemixContext): Promise<LayoutSpec>;
}

const SYSTEM = [
  "너는 이미 선 포트폴리오 **지면**을 사용자가 시킨 대로 고친다.",
  "새 지면을 짜는 것이 아니라 있는 지면을 손보는 일이다.",
  "",
  "## 무엇을 내는가",
  "고친 지면 **전체**를 낸다. 지면은 한 덩어리라 일부만 낼 수 없다.",
  "**지시가 건드리지 않은 것은 그대로 둔다** — 색을 바꾸라고 했으면 서체와 배치는",
  "지금 값을 그대로 옮긴다. 손대는 김에 이것저것 바꾸지 않는다.",
  "",
  "## 섹션과 블록",
  "섹션도 블록도 번호로 준다. **모든 섹션을 한 번씩 배치한다.** 순서와 크기는 바꿔도",
  "되지만 빠뜨리면 그 내용이 지면에서 사라진다.",
  "섹션 안의 `items`가 배치 나무다 — `block`(블록 하나) · `group`(묶어서 카드) ·",
  "`label`(섹션 이름표). 지시가 배치를 건드리지 않으면 지금 나무를 그대로 옮긴다.",
  "",
  "## 대상이 아닌 것",
  "- 블록에 적힌 글. 지면은 글을 고치지 않는다.",
  "- 사용자가 개별 요소에 직접 준 값. 그건 이 스펙 밖에서 덧씌워진다.",
  "",
  "## 색",
  "- 대비: 본문 4.5:1, 강조 3:1을 넘어야 한다. 못 넘기면 버려진다.",
  "- 어두운 지면을 쓴다면 그 위의 글자도 읽혀야 한다.",
  "",
  "## 클래스",
  classNameRules(),
  "",
  "## rationale",
  "**무엇을 왜 바꿨는지** 한 문장. 이번엔 지면을 설명하는 자리가 아니라",
  "변경을 설명하는 자리다 — \"지시대로 채도를 낮추고 섹션 간격을 넓혔습니다\"처럼",
  "손댄 것을 적는다. 사용자는 이 문장을 읽고 되돌릴지 정한다.",
].join("\n");

function buildPrompt(context: RemixContext): string {
  const lines = [
    `지시: ${context.instruction}`,
    "",
    `## 섹션 ${context.sections.length}개 — 번호를 그대로 쓴다`,
    ...context.sections.map((section, index) => `${index + 1}. ${section.title || "(제목 없음)"}`),
    "",
    "## 지금 지면",
    JSON.stringify(
      {
        ...context.current,
        // 모델에게는 번호로 준다. UUID를 옮겨 적게 하지 않는다.
        sections: context.current.sections.map((placement) => ({
          section: context.sections.findIndex(
            ({ portfolioSectionId }) => portfolioSectionId === placement.portfolioSectionId,
          ) + 1,
          className: placement.className,
          innerClassName: placement.innerClassName,
          items: numberItems(placement.items, context.blockIds),
        })),
      },
      null,
      1,
    ),
    "",
    "지시대로 고친 지면을 내라.",
  ];
  return lines.join("\n");
}

/** 저장된 나무를 모델이 읽을 수 있게 번호로 되돌린다. */
function numberItems(items: readonly LayoutItem[], blockIds: readonly string[]): unknown[] {
  return items.flatMap((item): unknown[] => {
    if (item.kind === "label") return [item];
    if (item.kind === "group") {
      return [{ ...item, items: numberItems(item.items as readonly LayoutItem[], blockIds) }];
    }
    const number = blockIds.indexOf(item.blockId) + 1;
    // 지워진 블록을 가리키는 자리는 모델에게 보이지 않는다.
    if (number === 0) return [];
    return [{
      kind: "block",
      block: number,
      ...(item.className === undefined ? {} : { className: item.className }),
      ...(item.itemClassName === undefined ? {} : { itemClassName: item.itemClassName }),
      ...(item.termClassName === undefined ? {} : { termClassName: item.termClassName }),
    }];
  });
}

/** 지면이 실제로 달라졌는가. 같은 것을 다시 내는 건 변형이 아니다. */
function unchanged(before: LayoutSpec, after: LayoutSpec): boolean {
  const shape = (spec: LayoutSpec) => JSON.stringify({
    type: spec.type,
    palette: spec.palette,
    rhythm: spec.rhythm,
    pageClassName: spec.pageClassName,
    sectionLabelClassName: spec.sectionLabelClassName,
    blockClasses: spec.blockClasses,
    sections: spec.sections,
  });
  return shape(before) === shape(after);
}

export class AiLayoutRemixer implements LayoutRemixer {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async remix(context: RemixContext): Promise<LayoutSpec> {
    if (context.sections.length === 0) throw new LayoutRemixError("배치할 섹션이 없습니다");

    const prompt = buildPrompt(context);
    const sectionIds = context.sections.map(({ portfolioSectionId }) => portfolioSectionId);
    let lastError: unknown;

    for (const attempt of [1, 2]) {
      try {
        const { data } = await this.#ai.complete(
          {
            contract: "style_remix",
            system: SYSTEM,
            prompt: attempt === 1 ? prompt : `${prompt}\n\n${retryNote(lastError)}`,
            promptVersion: REMIX_PROMPT_VERSION,
          },
          LayoutDraftSchema,
        );

        const missing = unplacedSections(data, context.sections.length);
        if (missing.length > 0) {
          throw new LayoutRemixError(`${missing.join(" · ")}번 섹션을 빠뜨렸습니다`);
        }

        const parsed = LayoutSpecSchema.safeParse(
          placeSections(data, sectionIds, context.blockIds),
        );
        if (!parsed.success) {
          throw new LayoutRemixError(`지면이 계약을 벗어났습니다: ${parsed.error.message}`);
        }
        if (unchanged(context.current, parsed.data)) {
          throw new LayoutRemixError("지면이 그대로입니다");
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof AiError && error.code !== "AI_INVALID_OUTPUT") throw error;
        lastError = error;
      }
    }
    throw new LayoutRemixError(
      `지면 변형이 두 번 모두 계약을 벗어났습니다: ${String(lastError)}`,
      { cause: lastError },
    );
  }
}

function retryNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `직전 시도는 거절되었다. 사유: ${detail}\n같은 실수를 반복하지 말고 다시 고쳐라.`;
}
