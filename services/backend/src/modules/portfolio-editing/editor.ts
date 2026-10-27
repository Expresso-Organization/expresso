import {
  PortfolioEditDraftSchema,
  type PortfolioEditPatch,
} from "@expresso/contracts";

import { AiError, type AiClient, type AiViolation } from "../../platform/ai/client.js";
import { jsonPointer } from "../../platform/ai/fixes.js";
import { ungroundedNumbers } from "../../platform/numbers.js";

/**
 * §8.3 「부분 편집」 계약 — 말로 고친다.
 *
 * 지금까지 편집은 기계적이었다. 사용자가 **직접 쓴 텍스트**로 바꾸거나, 스타일
 * 값을 지정하거나, 기록 본문을 붙이거나. "이 문단을 짧게"는 받을 수 없었다.
 *
 * 이 계약은 **바꾼 자리마다 patch를 하나씩** 낸다(§8.3: 변경 요약 UI가 이 배열을
 * 그대로 렌더한다). 사용자는 무엇이 어떻게 바뀌는지 보고 적용할지 정한다 —
 * 그래서 제안이지 적용이 아니다.
 *
 * 고칠 수 있는 자리는 우리가 정한다. 모델이 블록에 없는 칸을 만들어 낼 수 없고,
 * **잠근 블록은 애초에 대상이 아니다**(§8.3).
 */

/** 프롬프트를 고치면 올린다. */
export const EDIT_PROMPT_VERSION = 2;

export class BlockEditError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "BlockEditError";
  }
}

/**
 * 블록 종류마다 고칠 수 있는 자리.
 *
 * 미디어는 없다 — 자산은 사용자가 올리는 것이고, 말로 바꿀 것이 없다.
 */
export const EDITABLE_PATHS: Record<string, readonly string[]> = {
  heading: ["content.text"],
  paragraph: ["content.text"],
  list: ["content.text"],
  metric: ["content.value", "content.label"],
};

export interface EditContext {
  /** 사용량을 남길 사용자. 사용자가 없는 작업만 null이다. */
  userId: string | null;
  instruction: string;
  block: {
    kind: string;
    /** 지금 값. 자리 이름 → 글. */
    fields: Record<string, string>;
  };
  section: {
    title: string;
    purpose: string;
    goal: string;
    tone: string;
    /** 이 섹션에서 쓰면 안 되는 말(레시피가 정한 것). */
    exclude: string[];
  } | null;
  /** 이 블록이 인용한 기록 원문. 수치의 출처다. */
  sourceText: string;
}

export interface BlockEditor {
  edit(context: EditContext): Promise<PortfolioEditPatch[]>;
}

const SYSTEM = [
  "너는 이미 쓰인 포트폴리오 문장을 **사용자가 시킨 대로** 고친다.",
  "새로 쓰는 것이 아니라 있는 것을 손보는 일이다.",
  "",
  "## 무엇을 내는가",
  "바꾼 자리마다 patch 하나. path · before · after · label.",
  "- path: 고칠 수 있는 자리로 준 것 중 하나. 다른 이름을 지어내지 않는다.",
  "- before: 지금 값을 **그대로** 옮긴다.",
  "- after: 고친 값.",
  "- label: 이 변경을 한 줄로. \"군더더기 두 문장을 덜어냈습니다\"처럼",
  "  **무엇을 했는지** 쓴다. \"수정했습니다\"는 아무 말도 아니다.",
  "바꿀 것이 없는 자리는 patch를 내지 않는다.",
  "",
  "## 지어내지 않는다",
  "- **없던 수치를 만들지 않는다.** 지금 글과 근거 기록에 없는 숫자가 있으면",
  "  검사에 걸려 그 patch를 다시 써야 한다. 짧게 고치라고 해서 \"30% 개선\"을",
  "  붙이지 않는다.",
  "- 없던 사실 · 도구 · 조직을 덧붙이지 않는다. 고치는 것이지 늘리는 것이 아니다.",
  "- 사용자가 시키지 않은 것은 바꾸지 않는다. 말투를 고치라고 했으면 내용은 둔다.",
  "",
  "## 지면의 약속",
  "- 섹션이 쓰지 말라고 정한 말은 쓰지 않는다.",
  "- 수치 블록의 값은 값 하나다. 문장을 넣지 않는다.",
  "- 목록은 줄바꿈으로 나뉜다. 줄 수를 바꿔도 되지만 문장을 목록으로 쪼개지 않는다.",
  "",
  "지시가 이 블록으로 할 수 없는 것이면(예: 다른 섹션을 지워 달라)",
  "할 수 있는 범위에서만 고치고, label에 무엇을 못 했는지 적는다.",
].join("\n");

function buildPrompt(context: EditContext, paths: readonly string[]): string {
  const lines = [`지시: ${context.instruction}`, ""];
  if (context.section) {
    lines.push(
      `## 이 블록이 놓인 섹션: ${context.section.title}`,
      `목적: ${context.section.purpose}`,
    );
    if (context.section.goal) lines.push(`왜 두는가: ${context.section.goal}`);
    if (context.section.tone) lines.push(`톤: ${context.section.tone}`);
    if (context.section.exclude.length > 0) {
      lines.push(`쓰면 안 되는 말: ${context.section.exclude.join(" · ")}`);
    }
    lines.push("");
  }
  lines.push(`## 지금 값 (${context.block.kind})`);
  for (const path of paths) {
    lines.push(`${path}:`, context.block.fields[path] ?? "");
  }
  if (context.sourceText.trim()) {
    lines.push("", "## 이 문장이 나온 기록 — 수치는 여기 있는 것만 쓴다", context.sourceText.trim());
  }
  lines.push("", `고칠 수 있는 자리: ${paths.join(" · ")}`, "지시대로 고쳐라.");
  return lines.join("\n");
}

/**
 * 받은 patch들이 업무 규칙을 어긴 칸. 경로는 모델 출력 기준이다.
 *
 * 자리가 틀린 patch는 patch 하나(`/patches/3`)를, 글이 틀린 patch는 그 글(`/patches/3/after`)을
 * 가리킨다. 아무것도 안 바뀌었으면 목록 전체(`/patches`)를 다시 받는다.
 */
export function editViolations(
  patches: PortfolioEditPatch[],
  context: EditContext,
  paths: readonly string[],
): AiViolation[] {
  const found: AiViolation[] = [];
  // 수치의 출처는 지금 글과 근거 기록뿐이다.
  const source = [...Object.values(context.block.fields), context.sourceText].join("\n");
  const exclude = (context.section?.exclude ?? []).filter(Boolean);
  const seen = new Set<string>();
  patches.forEach((patch, index) => {
    if (!paths.includes(patch.path)) {
      found.push({ path: jsonPointer(["patches", index]), problem: `${patch.path}는 고칠 수 있는 자리가 아닙니다 — ${paths.join(" · ")} 중 하나입니다` });
    } else if (seen.has(patch.path)) {
      found.push({ path: jsonPointer(["patches", index]), problem: `${patch.path}를 두 번 고쳤습니다 — 한 자리에 patch 하나입니다` });
    }
    seen.add(patch.path);

    const invented = ungroundedNumbers(patch.after, source);
    if (invented.length > 0) {
      found.push({ path: jsonPointer(["patches", index, "after"]), problem: `글에 없던 수치입니다: ${invented.join(", ")}` });
    }
    const banned = exclude.filter((term) => patch.after.includes(term));
    if (banned.length > 0) {
      found.push({ path: jsonPointer(["patches", index, "after"]), problem: `이 섹션에서 쓰지 않기로 한 말입니다: ${banned.join(" · ")}` });
    }
  });

  // 아무것도 안 바뀐 patch는 변경이 아니다.
  if (patches.every(({ path, before, after }) => after.trim() === (context.block.fields[path] ?? before).trim())) {
    found.push({ path: "/patches", problem: "바뀐 것이 없습니다 — 지시대로 고친 값을 냅니다" });
  }
  return found;
}

export class AiBlockEditor implements BlockEditor {
  readonly #ai: AiClient;

  constructor(ai: AiClient) {
    this.#ai = ai;
  }

  async edit(context: EditContext): Promise<PortfolioEditPatch[]> {
    const paths = EDITABLE_PATHS[context.block.kind];
    if (!paths) throw new BlockEditError(`${context.block.kind} 블록은 말로 고칠 수 없습니다`);

    // 다시 요청하지 않는다 — 걸린 칸은 어댑터가 같은 대화에서 고쳐 받는다(`platform/ai/fixes.ts`).
    let patches: PortfolioEditPatch[];
    try {
      ({ data: { patches } } = await this.#ai.complete(
        {
          contract: "partial_edit",
          system: SYSTEM,
          prompt: buildPrompt(context, paths),
          promptVersion: EDIT_PROMPT_VERSION,
        },
        PortfolioEditDraftSchema,
        { userId: context.userId, check: (draft) => editViolations(draft.patches, context, paths) },
      ));
    } catch (error) {
      // 고쳐도 계약을 못 맞춘 출력은 편집 실패(422)로 알린다.
      if (error instanceof AiError && error.code === "AI_INVALID_OUTPUT") {
        throw new BlockEditError(`편집이 계약을 벗어났습니다: ${error.message}`, { cause: error });
      }
      throw error;
    }

    // 고친 뒤에도 남은 위반은 그대로 온다. 수치 · 금지어는 제안 그대로 둔다 — 사용자가 변경
    // 요약을 보고 적용할지 정한다. 자리가 틀리거나 겹친 patch는 블록에 얹을 수 없어
    // (`applyPatches`) 그때만 편집을 만들 수 없는 것으로 끝낸다. 바뀐 것이 없어도 같다.
    const unusable = editViolations(patches, context, paths).filter(({ path }) => !path.endsWith("/after"));
    if (unusable.length > 0) throw new BlockEditError(unusable.map(({ problem }) => problem).join(", "));
    // before는 우리가 아는 값으로 덮는다 — 모델이 옮겨 적다 틀리면
    // 변경 요약이 거짓말을 하게 된다.
    return patches.map((patch) => ({
      ...patch,
      before: context.block.fields[patch.path] ?? "",
    }));
  }
}

/** 블록 종류마다 실제 값이 어디 들어 있는지. 계약의 path와 짝이다. */
export function blockFields(kind: string, content: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const path of EDITABLE_PATHS[kind] ?? []) {
    const key = path.slice("content.".length);
    const value = content[key];
    fields[path] = typeof value === "string" ? value : "";
  }
  return fields;
}

/** patch들을 블록 content에 얹는다. */
export function applyPatches(
  content: Record<string, unknown>,
  patches: PortfolioEditPatch[],
): Record<string, unknown> {
  const next = { ...content };
  for (const patch of patches) next[patch.path.slice("content.".length)] = patch.after;
  return next;
}
