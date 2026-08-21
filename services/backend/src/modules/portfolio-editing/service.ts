import {
  ApplyPortfolioEditResultSchema,
  PortfolioEditProposalSchema,
  type PortfolioEditCommandSchema,
} from "@expresso/contracts";
import type { z } from "zod";
import type { SqlTag, JSONValue } from "../../platform/mysql.js";

import {
  applyPatches,
  blockFields,
  BlockEditError,
  EDITABLE_PATHS,
  type BlockEditor,
  type EditContext,
} from "./editor.js";
import type { ConsentService } from "../consent/service.js";

type EditCommand = z.infer<typeof PortfolioEditCommandSchema>;

interface BlockRow {
  id: string; portfolio_section_id: string; kind: string;
  content: Record<string, unknown>; style: Record<string, unknown>;
  source_record_id: string | null; sync_state: string; locked: boolean;
}
interface ProposalRow {
  id: string; portfolio_id: string; block_id: string; target_path: string;
  operation: "update_text" | "set_style" | "insert_record" | "instruct";
  before_state: Record<string, unknown>; after_state: Record<string, unknown>;
  source_record_id: string | null; status: "pending" | "applied" | "rejected" | "expired";
  instruction: string | null;
  patches: { path: string; before: string; after: string; label: string }[];
  expires_at: Date | string;
}

/** 04c 이력에 그대로 보이는 말이다 — 사용자가 읽을 문장으로 남긴다. */
const OPERATION_SUMMARY: Record<ProposalRow["operation"], string> = {
  update_text: "값을 직접 고쳤습니다",
  set_style: "모양을 바꿨습니다",
  insert_record: "기록을 다시 이었습니다",
  instruct: "말로 고친 것을 반영했습니다",
};

export class PortfolioEditingError extends Error {
  readonly statusCode: number;
  readonly publicDetails: Record<string, unknown> | undefined;
  constructor(statusCode: number, message: string, publicDetails?: Record<string, unknown>) {
    super(message); this.name = "PortfolioEditingError"; this.statusCode = statusCode; this.publicDetails = publicDetails;
  }
}

function blockState(block: BlockRow) {
  return {
    content: block.content,
    style: block.style,
    sourceRecordId: block.source_record_id,
    syncState: block.sync_state,
    locked: block.locked,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function mapProposal(row: ProposalRow) {
  return PortfolioEditProposalSchema.parse({
    id: row.id, portfolioId: row.portfolio_id, blockId: row.block_id,
    targetPath: row.target_path, operation: row.operation,
    before: row.before_state, after: row.after_state,
    sourceRecordId: row.source_record_id, status: row.status,
    instruction: row.instruction, patches: row.patches,
  });
}

export class PortfolioEditingService {
  readonly #sql: SqlTag;
  readonly #editor: BlockEditor | null;
  readonly #consent: ConsentService | null;

  constructor(sql: SqlTag, editor?: BlockEditor | null, consent?: ConsentService | null) {
    this.#sql = sql;
    this.#editor = editor ?? null;
    this.#consent = consent ?? null;
  }

  async preview(userId: string, portfolioId: string, blockId: string, command: EditCommand) {
    const block = (await this.#sql<BlockRow[]>`
      select block.* from block join portfolio_section on portfolio_section.id = block.portfolio_section_id
      where block.id = ${blockId} and block.user_id = ${userId} and portfolio_section.portfolio_id = ${portfolioId}
    `)[0];
    if (!block) throw new PortfolioEditingError(404, "portfolio block not found");
    const before = blockState(block);
    let after = { ...before };
    let sourceRecordId: string | null = null;
    let instruction: string | null = null;
    let patches: { path: string; before: string; after: string; label: string }[] = [];
    if (command.operation === "instruct") {
      // §8.3: 잠근 블록은 대상에서 제외한다. 사용자가 직접 고쳐 둔 자리다(P3).
      if (block.locked) {
        throw new PortfolioEditingError(409, "locked block cannot be edited by instruction");
      }
      if (!this.#editor) {
        throw new PortfolioEditingError(503, "instruction editing is unavailable");
      }
      await this.#consent?.require(userId, "partial_edit");
      instruction = command.instruction;
      patches = await this.#instruct(userId, block, command.instruction);
      after = {
        ...after,
        content: applyPatches(block.content, patches),
        // 지시로 고친 것도 사람이 고른 결과다. 재생성이 덮지 않게 잠근다.
        syncState: "detached",
        locked: true,
      };
    } else if (command.operation === "update_text") {
      // 04b가 고치는 자리는 블록 종류가 정한다 — 수치의 값·라벨과 문단의 글은 다른 칸이다.
      const path = command.path ?? "content.text";
      const allowed = EDITABLE_PATHS[block.kind];
      if (!allowed?.includes(path)) {
        throw new PortfolioEditingError(422, `${block.kind} 블록의 ${path}는 고칠 수 없습니다`);
      }
      // 직접 고친 자리는 잠근다. 다시 추출해도 덮이지 않는다(P3).
      after = {
        ...after,
        content: { ...block.content, [path.slice("content.".length)]: command.text },
        syncState: "detached",
        locked: true,
      };
      patches = [{
        path,
        before: String(block.content[path.slice("content.".length)] ?? ""),
        after: command.text,
        label: "직접 고쳤습니다",
      }];
    } else if (command.operation === "set_style") {
      after = { ...after, style: { ...block.style, ...command.style }, locked: true };
    } else {
      const record = (await this.#sql<{ id: string; body_md: string }[]>`
        select id, body_md from record where id = ${command.recordId} and user_id = ${userId} and deleted_at is null
      `)[0];
      if (!record) throw new PortfolioEditingError(404, "source record not found");
      sourceRecordId = record.id;
      after = { ...after, content: { ...block.content, text: record.body_md }, sourceRecordId: record.id, syncState: "synced", locked: true };
    }
    const targetPath = `portfolio:${portfolioId}/section:${block.portfolio_section_id}/block:${block.id}`;
    const proposal = (await this.#sql<ProposalRow[]>`
      insert into portfolio_edit_proposal (
        user_id, portfolio_id, target_path, block_id, operation,
        before_state, after_state, source_record_id, instruction, patches
      ) values (
        ${userId}, ${portfolioId}, ${targetPath}, ${blockId}, ${command.operation},
        ${this.#sql.json(before as JSONValue)}, ${this.#sql.json(after as JSONValue)},
        ${sourceRecordId}, ${instruction},
        ${this.#sql.json(patches as unknown as JSONValue)}
      ) returning *
    `)[0];
    if (!proposal) throw new Error("edit proposal missing");
    return mapProposal(proposal);
  }

  /**
   * 계약에 넘길 맥락을 모은다.
   *
   * 섹션이 정한 톤과 금지어를 함께 준다 — 편집이 레시피의 약속을 깨면
   * 지면 전체가 어긋난다. 수치의 출처는 지금 글과 이 블록이 인용한 기록뿐이다.
   */
  async #instruct(userId: string, block: BlockRow, instruction: string) {
    const context = (await this.#sql<{
      title: string | null; purpose: string | null;
      section_context: { goal?: string; tone?: string; exclude?: string[] } | null;
      source_text: string | null;
    }[]>`
      select recipe_section.title, recipe_section.purpose,
             recipe_section.context as section_context,
             record.body_md as source_text
      from portfolio_section
      left join recipe_section on recipe_section.id = portfolio_section.recipe_section_id
        and recipe_section.user_id = portfolio_section.user_id
      left join record on record.id = ${block.source_record_id} and record.user_id = ${userId}
      where portfolio_section.id = ${block.portfolio_section_id}
        and portfolio_section.user_id = ${userId}
    `)[0];

    const editContext: EditContext = {
      instruction,
      block: { kind: block.kind, fields: blockFields(block.kind, block.content) },
      section: context?.title
        ? {
          title: context.title,
          purpose: context.purpose ?? "",
          goal: context.section_context?.goal ?? "",
          tone: context.section_context?.tone ?? "",
          exclude: context.section_context?.exclude ?? [],
        }
        : null,
      sourceText: context?.source_text ?? "",
    };

    try {
      return await this.#editor!.edit(editContext);
    } catch (error) {
      // 계약이 못 고친 것은 사용자에게 말이 되게 돌려준다 — 500이 아니다.
      if (error instanceof BlockEditError) {
        throw new PortfolioEditingError(422, error.message);
      }
      throw error;
    }
  }

  async apply(userId: string, proposalId: string) {
    let revisionId = "";
    let applied!: ProposalRow;
    await this.#sql.begin(async (transaction) => {
      const proposal = (await transaction<ProposalRow[]>`
        select * from portfolio_edit_proposal where id = ${proposalId} and user_id = ${userId} for update
      `)[0];
      if (!proposal) throw new PortfolioEditingError(404, "edit proposal not found");
      if (proposal.status !== "pending" || new Date(proposal.expires_at) <= new Date()) {
        throw new PortfolioEditingError(409, "edit proposal is no longer applicable");
      }
      const block = (await transaction<BlockRow[]>`select * from block where id = ${proposal.block_id} and user_id = ${userId} for update`)[0];
      if (!block) throw new PortfolioEditingError(404, "portfolio block not found");
      if (stableJson(blockState(block)) !== stableJson(proposal.before_state)) {
        throw new PortfolioEditingError(409, "block changed after preview", { conflict: true });
      }
      await this.#captureSnapshot(transaction, userId, proposal.portfolio_id, "edit");
      const after = proposal.after_state as {
        content: Record<string, unknown>; style: Record<string, unknown>;
        sourceRecordId: string | null; syncState: string;
      };
      await transaction`
        update block set content = ${transaction.json(after.content as JSONValue)},
          style = ${transaction.json(after.style as JSONValue)},
          source_record_id = ${after.sourceRecordId}, sync_state = ${after.syncState}, locked = true
        where id = ${block.id} and user_id = ${userId}
      `;
      if (after.sourceRecordId) await transaction`
        insert into record_usage (user_id, record_id, block_id, quoted_text)
        values (${userId}, ${after.sourceRecordId}, ${block.id}, ${String(after.content.text ?? "")})
        as new on duplicate key update quoted_text = new.quoted_text
      `;
      revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, block_id, actor, before, after, proposal_id, summary)
        values (${userId}, ${proposal.portfolio_id}, ${block.id}, 'user', ${transaction.json(proposal.before_state as JSONValue)}, ${transaction.json(proposal.after_state as JSONValue)}, ${proposal.id}, ${OPERATION_SUMMARY[proposal.operation]}) returning id
      `)[0]?.id ?? "";
      applied = (await transaction<ProposalRow[]>`update portfolio_edit_proposal set status = 'applied', applied_at = now() where id = ${proposal.id} returning *`)[0]!;
    });
    return ApplyPortfolioEditResultSchema.parse({ proposal: mapProposal(applied), revisionId, locked: true });
  }

  async revertRevision(userId: string, revisionId: string, confirmConflict = false) {
    return this.#sql.begin(async (transaction) => {
      const revision = (await transaction<{
        id: string; portfolio_id: string; block_id: string | null;
        before: Record<string, unknown>; after: Record<string, unknown>;
      }[]>`select id, portfolio_id, block_id, before, after from revision where id = ${revisionId} and user_id = ${userId} for update`)[0];
      if (!revision?.block_id) throw new PortfolioEditingError(404, "revertible revision not found");
      const block = (await transaction<BlockRow[]>`select * from block where id = ${revision.block_id} and user_id = ${userId} for update`)[0];
      if (!block) throw new PortfolioEditingError(404, "revision block not found");
      const conflict = stableJson(blockState(block)) !== stableJson(revision.after);
      if (conflict && !confirmConflict) throw new PortfolioEditingError(409, "revert conflicts with later changes", { conflict: true, blockId: block.id });
      const before = revision.before as { content: Record<string, unknown>; style: Record<string, unknown>; sourceRecordId: string | null; syncState: string; locked: boolean };
      await transaction`update block set content = ${transaction.json(before.content as JSONValue)}, style = ${transaction.json(before.style as JSONValue)}, source_record_id = ${before.sourceRecordId}, sync_state = ${before.syncState}, locked = ${before.locked} where id = ${block.id}`;
      const newRevisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, block_id, actor, before, after, reverted_revision_id, change_kind, summary)
        values (${userId}, ${revision.portfolio_id}, ${block.id}, 'user', ${transaction.json(blockState(block) as JSONValue)}, ${transaction.json(before as JSONValue)}, ${revision.id}, 'revert', '한 번의 변경을 되돌렸습니다') returning id
      `)[0]?.id;
      return { revisionId: newRevisionId, conflictResolved: conflict };
    });
  }

  /** 한 섹션 안에서 블록 차례를 다시 쓴다. 섹션과 같은 규칙 — 통째로 받는다. */
  async reorderBlocks(userId: string, portfolioId: string, sectionId: string, blockIds: string[]) {
    return this.#sql.begin(async (transaction) => {
      const current = await transaction<{ id: string }[]>`
        select block.id from block
        join portfolio_section on portfolio_section.id = block.portfolio_section_id
        where block.user_id = ${userId} and block.portfolio_section_id = ${sectionId}
          and portfolio_section.portfolio_id = ${portfolioId}
        order by block.order_no, block.id for update of block
      `;
      const known = new Set(current.map(({ id }) => id));
      const given = new Set(blockIds);
      if (given.size !== blockIds.length || known.size !== given.size
        || blockIds.some((id) => !known.has(id))) {
        throw new PortfolioEditingError(409, "block order does not match the current section");
      }
      for (const [order, id] of blockIds.entries()) await transaction`
        update block set order_no = ${order} where id = ${id} and user_id = ${userId}
      `;
      const revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, actor, before, after, change_kind, summary)
        values (
          ${userId}, ${portfolioId}, 'user',
          ${transaction.json({ blockIds: current.map(({ id }) => id) })},
          ${transaction.json({ blockIds })},
          'edit', '블록 순서를 바꿨습니다'
        ) returning id
      `)[0]?.id;
      return { blockIds, revisionId };
    });
  }

  /**
   * 블록을 하나 더 만든다.
   *
   * 사람이 만든 자리이므로 잠근 채로 붙인다 — 다시 추출해도 사라지지 않는다.
   * 바로 뒤에 놓고 나머지를 한 칸씩 민다.
   */
  async duplicateBlock(userId: string, portfolioId: string, blockId: string) {
    return this.#sql.begin(async (transaction) => {
      const block = (await transaction<(BlockRow & { order_no: number })[]>`
        select block.* from block
        join portfolio_section on portfolio_section.id = block.portfolio_section_id
        where block.id = ${blockId} and block.user_id = ${userId}
          and portfolio_section.portfolio_id = ${portfolioId}
        for update of block
      `)[0];
      if (!block) throw new PortfolioEditingError(404, "portfolio block not found");

      await transaction`
        update block set order_no = order_no + 1
        where user_id = ${userId} and portfolio_section_id = ${block.portfolio_section_id}
          and order_no > ${block.order_no}
      `;
      const copy = (await transaction<{ id: string }[]>`
        insert into block (
          user_id, portfolio_section_id, kind, content, style,
          source_record_id, sync_state, locked, order_no
        ) values (
          ${userId}, ${block.portfolio_section_id}, ${block.kind},
          ${transaction.json(block.content as JSONValue)},
          ${transaction.json(block.style as JSONValue)},
          ${block.source_record_id}, ${block.sync_state}, true, ${block.order_no + 1}
        ) returning id
      `)[0];
      if (!copy) throw new Error("block copy missing");

      const revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, block_id, actor, before, after, change_kind, summary)
        values (
          ${userId}, ${portfolioId}, ${copy.id}, 'user', null,
          ${transaction.json(blockState(block) as JSONValue)},
          'edit', '블록을 하나 더 만들었습니다'
        ) returning id
      `)[0]?.id;
      return { blockId: copy.id, revisionId };
    });
  }

  /**
   * 블록을 지운다.
   *
   * 지우기 전에 **복원 지점을 하나 뜬다.** 지운 블록의 편집 이력은 함께 사라지지만
   * (`revision.block_id`가 블록을 따라간다), 지면 전체는 그 지점으로 되돌릴 수 있다.
   */
  async deleteBlock(userId: string, portfolioId: string, blockId: string) {
    return this.#sql.begin(async (transaction) => {
      const block = (await transaction<(BlockRow & { order_no: number })[]>`
        select block.* from block
        join portfolio_section on portfolio_section.id = block.portfolio_section_id
        where block.id = ${blockId} and block.user_id = ${userId}
          and portfolio_section.portfolio_id = ${portfolioId}
        for update of block
      `)[0];
      if (!block) throw new PortfolioEditingError(404, "portfolio block not found");

      const snapshotId = await this.#captureSnapshot(transaction, userId, portfolioId, "manual");
      await transaction`delete from block where id = ${blockId} and user_id = ${userId}`;
      await transaction`
        update block set order_no = order_no - 1
        where user_id = ${userId} and portfolio_section_id = ${block.portfolio_section_id}
          and order_no > ${block.order_no}
      `;
      const revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, actor, before, after, change_kind, summary)
        values (
          ${userId}, ${portfolioId}, 'user',
          ${transaction.json(blockState(block) as JSONValue)}, null,
          'edit', '블록을 지웠습니다'
        ) returning id
      `)[0]?.id;
      return { blockId, snapshotId, revisionId };
    });
  }

  /**
   * 섹션을 숨기거나 다시 꺼낸다.
   *
   * 지우는 것이 아니라 숨기는 것이다 — 레시피가 만든 자리는 남고, 배포에만 나가지
   * 않는다. 왜 숨겼는지도 함께 적는다.
   */
  async setSectionVisibility(
    userId: string,
    portfolioId: string,
    sectionId: string,
    visible: boolean,
  ) {
    return this.#sql.begin(async (transaction) => {
      const section = (await transaction<{ id: string; visible: boolean; order_no: number }[]>`
        select id, visible, order_no from portfolio_section
        where id = ${sectionId} and user_id = ${userId} and portfolio_id = ${portfolioId}
        for update
      `)[0];
      if (!section) throw new PortfolioEditingError(404, "portfolio section not found");

      await transaction`
        update portfolio_section
        set visible = ${visible}, hidden_reason = ${visible ? null : "직접 숨김"}
        where id = ${sectionId} and user_id = ${userId}
      `;
      const revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, actor, before, after, change_kind, summary)
        values (
          ${userId}, ${portfolioId}, 'user',
          ${transaction.json({ sectionId, visible: section.visible })},
          ${transaction.json({ sectionId, visible })},
          'edit', ${visible ? "섹션을 다시 꺼냈습니다" : "섹션을 숨겼습니다"}
        ) returning id
      `)[0]?.id;
      return { sectionId, visible, revisionId };
    });
  }

  /**
   * 섹션 차례를 다시 쓴다.
   *
   * `order_no`는 포트폴리오 안에서 유일해야 해서 한 번에 덮어쓸 수 없다 — 부딪히지
   * 않는 자리로 통째로 옮겨 두고 다시 적는다.
   */
  async reorderSections(userId: string, portfolioId: string, sectionIds: string[]) {
    return this.#sql.begin(async (transaction) => {
      const current = await transaction<{ id: string; order_no: number }[]>`
        select id, order_no from portfolio_section
        where user_id = ${userId} and portfolio_id = ${portfolioId}
        order by order_no for update
      `;
      const known = new Set(current.map(({ id }) => id));
      const given = new Set(sectionIds);
      if (given.size !== sectionIds.length || known.size !== given.size
        || sectionIds.some((id) => !known.has(id))) {
        throw new PortfolioEditingError(409, "section order does not match the current portfolio");
      }

      await transaction`
        update portfolio_section set order_no = order_no + 1000
        where user_id = ${userId} and portfolio_id = ${portfolioId}
      `;
      for (const [order, id] of sectionIds.entries()) await transaction`
        update portfolio_section set order_no = ${order}
        where id = ${id} and user_id = ${userId} and portfolio_id = ${portfolioId}
      `;
      const revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, actor, before, after, change_kind, summary)
        values (
          ${userId}, ${portfolioId}, 'user',
          ${transaction.json({ sectionIds: current.map(({ id }) => id) })},
          ${transaction.json({ sectionIds })},
          'edit', '섹션 순서를 바꿨습니다'
        ) returning id
      `)[0]?.id;
      return { sectionIds, revisionId };
    });
  }

  async restore(userId: string, portfolioId: string, snapshotId: string) {
    return this.#sql.begin(async (transaction) => {
      const target = (await transaction<{ snapshot: { sections?: Array<{ id: string; order: number; visible: boolean; blocks: Array<{ id: string; kind: string; content: Record<string, unknown>; style: Record<string, unknown>; sourceRecordId: string | null; syncState: string; locked: boolean }> }> } }[]>`
        select snapshot from portfolio_snapshot where id = ${snapshotId} and user_id = ${userId} and portfolio_id = ${portfolioId}
      `)[0];
      if (!target?.snapshot.sections) throw new PortfolioEditingError(409, "snapshot cannot restore portfolio blocks");
      const preRestoreId = await this.#captureSnapshot(transaction, userId, portfolioId, "manual");
      // 그 지점에 없던 블록은 지운다. 남겨 두면 "그 지점으로"가 아니고, 되살아난
      // 블록과 자리까지 부딪힌다. 지우기 전 사본은 방금 떠 뒀다.
      const kept = target.snapshot.sections.flatMap((section) =>
        section.blocks.map((block) => block.id));
      await transaction`
        delete from block using portfolio_section
        where block.portfolio_section_id = portfolio_section.id
          and portfolio_section.portfolio_id = ${portfolioId}
          and block.user_id = ${userId}
          and not (block.id = any(${kept}[]))
      `;
      for (const section of target.snapshot.sections) {
        await transaction`update portfolio_section set order_no = ${section.order}, visible = ${section.visible} where id = ${section.id} and user_id = ${userId} and portfolio_id = ${portfolioId}`;
        // 지워진 블록은 다시 넣는다 — 없으면 "복원으로 되돌린다"는 말이 거짓이 된다.
        for (const [order, block] of section.blocks.entries()) await transaction`
          insert into block (
            id, user_id, portfolio_section_id, kind, content, style,
            source_record_id, sync_state, locked, order_no
          ) values (
            ${block.id}, ${userId}, ${section.id}, ${block.kind},
            ${transaction.json(block.content as JSONValue)},
            ${transaction.json(block.style as JSONValue)},
            ${block.sourceRecordId}, ${block.syncState}, ${block.locked}, ${order}
          )
          as new on duplicate key update content = new.content, style = new.style,
            source_record_id = new.source_record_id, sync_state = new.sync_state,
            locked = new.locked, order_no = new.order_no
        `;
      }
      const revisionId = (await transaction<{ id: string }[]>`
        insert into revision (user_id, portfolio_id, actor, before, after, change_kind, summary)
        values (${userId}, ${portfolioId}, 'user', ${transaction.json({ preRestoreSnapshotId: preRestoreId })}, ${transaction.json({ restoredSnapshotId: snapshotId })}, 'restore', '지점으로 복원했습니다') returning id
      `)[0]?.id;
      return { snapshotId, preRestoreSnapshotId: preRestoreId, revisionId };
    });
  }

  async #captureSnapshot(transaction: SqlTag, userId: string, portfolioId: string, kind: "edit" | "manual") {
    const sections = await transaction<{ id: string; recipe_section_id: string | null; order_no: number; visible: boolean }[]>`select id, recipe_section_id, order_no, visible from portfolio_section where user_id = ${userId} and portfolio_id = ${portfolioId} order by order_no`;
    const blocks = await transaction<BlockRow[]>`select block.* from block join portfolio_section on portfolio_section.id = block.portfolio_section_id where block.user_id = ${userId} and portfolio_section.portfolio_id = ${portfolioId} order by portfolio_section.order_no, block.order_no, block.id`;
    const snapshot = { portfolioId, sections: sections.map((section) => ({ id: section.id, recipeSectionId: section.recipe_section_id, order: section.order_no, visible: section.visible, blocks: blocks.filter((block) => block.portfolio_section_id === section.id).map((block) => ({ id: block.id, kind: block.kind, content: block.content, style: block.style, sourceRecordId: block.source_record_id, syncState: block.sync_state, locked: block.locked })) })) };
    return (await transaction<{ id: string }[]>`insert into portfolio_snapshot (user_id, portfolio_id, kind, snapshot) values (${userId}, ${portfolioId}, ${kind}, ${transaction.json(snapshot as JSONValue)}) returning id`)[0]?.id ?? "";
  }
}
