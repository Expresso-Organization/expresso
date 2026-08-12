"use server";

import type { PortfolioEditPatch } from "@expresso/contracts";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { portfolioEditing, portfolios } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 04 말로 고치기.
 *
 * 계약이 내는 것은 **제안**이지 적용이 아니다(§8.3). 바뀐 자리마다 patch가
 * 하나씩 오고, 사용자가 그걸 보고 "그대로 두기"를 눌러야 반영된다.
 *
 * 대상은 둘 중 하나다 — 블록 하나(부분 편집)이거나 지면 전체(지면 변형).
 * 계약이 다르므로 화면에서도 갈라 놓는다.
 */
export interface EditResult {
  /** 무엇을 시켰나. 대화에 그대로 남는다. */
  instruction?: string;
  target?: string;
  proposalId?: string;
  patches?: PortfolioEditPatch[];
  /** 지면 변형은 바로 적용된다 — 되돌리기는 03에서 옛 후보를 고르는 일이다. */
  layoutRationale?: string;
  error?: string;
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "AI 사용 동의가 필요합니다. 설정에서 켜 주세요.";
    if (error.status === 409) return "직접 고친 블록은 말로 바꾸지 않습니다. 캔버스에서 고쳐 주세요.";
    if (error.status === 422) return error.message;
    if (error.status === 503) return "지금은 말로 고치기를 쓸 수 없습니다.";
  }
  return "고치지 못했습니다. 다시 시도해 주세요.";
}

export async function instructAction(
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  const portfolioId = formData.get("portfolioId");
  const target = formData.get("target");
  const instruction = formData.get("instruction");
  if (typeof portfolioId !== "string" || typeof target !== "string"
    || typeof instruction !== "string" || !instruction.trim()) {
    return { error: "무엇을 고칠지 적어 주세요." };
  }
  const said = instruction.trim();
  const session = await requireSession();

  try {
    if (target === "layout") {
      const { data } = await portfolios.remixLayout(session.accessToken, portfolioId, said);
      const selected = data.candidates.find(({ id }) => id === data.selectedId);
      revalidatePath(`/edit/${portfolioId}`);
      return {
        instruction: said,
        target: "지면 전체",
        layoutRationale: selected?.spec.rationale ?? "지면을 고쳤습니다.",
      };
    }

    const { data } = await portfolioEditing.instruct(
      session.accessToken, portfolioId, target, said,
    );
    return {
      instruction: said,
      target: formData.get("targetLabel") as string ?? "블록",
      proposalId: data.id,
      patches: data.patches,
    };
  } catch (error) {
    return { instruction: said, error: message(error) };
  }
}

/**
 * 04c 되돌리기 · 복원.
 *
 * 되돌리기는 **그 한 번의 변경**을 무르는 것이고, 복원은 **그 지점 전체**로 가는
 * 것이다. 되돌린 것도 이력에 한 줄로 남는다 — 되돌린 일을 다시 되돌릴 수 있어야
 * 한다.
 *
 * 되돌리려는 블록이 그 뒤에 또 바뀌었으면 서버가 409로 되묻는다. 묻지 않고 덮으면
 * 그 사이의 편집이 소리 없이 사라진다.
 */
export interface HistoryResult {
  reverted?: boolean;
  restored?: boolean;
  /** 그 뒤에 또 바뀐 자리가 있다. 다시 누르면 그때는 덮는다. */
  conflict?: { revisionId: string };
  error?: string;
}

export async function historyAction(
  _previous: HistoryResult,
  formData: FormData,
): Promise<HistoryResult> {
  const portfolioId = formData.get("portfolioId");
  if (typeof portfolioId !== "string") return {};
  const session = await requireSession();

  try {
    const revisionId = formData.get("revisionId");
    const snapshotId = formData.get("snapshotId");
    if (typeof revisionId === "string") {
      await portfolioEditing.revertRevision(
        session.accessToken, revisionId, formData.get("force") === "true",
      );
      revalidatePath(`/edit/${portfolioId}`);
      return { reverted: true };
    }
    if (typeof snapshotId === "string") {
      await portfolioEditing.restore(session.accessToken, portfolioId, snapshotId);
      revalidatePath(`/edit/${portfolioId}`);
      return { restored: true };
    }
    return {};
  } catch (error) {
    const revisionId = formData.get("revisionId");
    if (error instanceof ApiError && error.status === 409
      && error.details?.conflict === true && typeof revisionId === "string") {
      return { conflict: { revisionId } };
    }
    return { error: message(error) };
  }
}

/**
 * 04 블록 조작 — 순서 · 복제 · 삭제.
 *
 * 지우기는 **되돌릴 수 없는 유일한 편집**이다. `revision.block_id`가 블록을 따라가
 * 지우면 그 블록의 편집 이력도 함께 사라진다. 그래서 서버가 지우기 직전에 복원
 * 지점을 하나 뜬다 — 지면 전체는 그 지점으로 되돌릴 수 있다.
 */
export async function blockAction(
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  const intent = formData.get("intent");
  const portfolioId = formData.get("portfolioId");
  if (typeof portfolioId !== "string") return {};
  const session = await requireSession();

  try {
    if (intent === "reorder") {
      const sectionId = formData.get("sectionId");
      const blockIds = formData.getAll("blockIds")
        .filter((id): id is string => typeof id === "string");
      if (typeof sectionId !== "string" || blockIds.length === 0) return {};
      await portfolioEditing.reorderBlocks(session.accessToken, portfolioId, sectionId, blockIds);
    } else {
      const blockId = formData.get("blockId");
      if (typeof blockId !== "string") return {};
      if (intent === "duplicate") {
        await portfolioEditing.duplicateBlock(session.accessToken, portfolioId, blockId);
      } else if (intent === "delete") {
        await portfolioEditing.deleteBlock(session.accessToken, portfolioId, blockId);
      } else return {};
    }
    revalidatePath(`/edit/${portfolioId}`);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

/**
 * 04 섹션 조작 — 순서와 숨김.
 *
 * 섹션은 지우지 않는다. 레시피가 만든 자리이고, 지우면 그 자리가 무엇이었는지도
 * 사라진다 — 숨기면 배포에만 나가지 않고 자리는 남는다.
 */
export async function sectionAction(
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  const portfolioId = formData.get("portfolioId");
  if (typeof portfolioId !== "string") return {};
  const session = await requireSession();

  try {
    const sectionId = formData.get("sectionId");
    const visible = formData.get("visible");
    if (typeof sectionId === "string" && (visible === "true" || visible === "false")) {
      await portfolioEditing.setSectionVisible(
        session.accessToken, portfolioId, sectionId, visible === "true",
      );
    } else {
      const sectionIds = formData.getAll("sectionIds")
        .filter((id): id is string => typeof id === "string");
      if (sectionIds.length === 0) return {};
      await portfolioEditing.reorderSections(session.accessToken, portfolioId, sectionIds);
    }
    revalidatePath(`/edit/${portfolioId}`);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

/**
 * 04b 속성 패널 — 직접 고치기.
 *
 * 말로 고치기와 달리 제안을 보여줄 것이 없다. 사용자가 이미 무엇을 바꾸는지 알고
 * 있으므로 **미리 보기와 적용을 한 번에** 한다. 그래도 같은 문을 지나므로 이력에
 * 남고 04c에서 되돌릴 수 있다.
 */
export async function editBlockAction(
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  const portfolioId = formData.get("portfolioId");
  const blockId = formData.get("blockId");
  if (typeof portfolioId !== "string" || typeof blockId !== "string") return {};
  const session = await requireSession();

  const path = formData.get("path");
  const text = formData.get("text");
  const style = formData.get("style");

  try {
    const command = typeof style === "string"
      ? { operation: "set_style" as const, style: JSON.parse(style) as Record<string, string> }
      : {
        operation: "update_text" as const,
        ...(typeof path === "string" && path ? { path } : {}),
        text: String(text ?? ""),
      };
    if (command.operation === "update_text" && command.text.trim() === "") {
      return { error: "빈 값으로 둘 수 없습니다." };
    }

    const { data } = await portfolioEditing.edit(session.accessToken, portfolioId, blockId, command);
    await portfolioEditing.apply(session.accessToken, data.id);
    revalidatePath(`/edit/${portfolioId}`);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

/** "그대로 두기". 제안이 실제 블록이 된다. */
export async function applyProposalAction(
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  const portfolioId = formData.get("portfolioId");
  const proposalId = formData.get("proposalId");
  if (typeof portfolioId !== "string" || typeof proposalId !== "string") return {};
  const session = await requireSession();
  try {
    await portfolioEditing.apply(session.accessToken, proposalId);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath(`/edit/${portfolioId}`);
  return {};
}
