import { randomUUID } from "node:crypto";
import type { SqlTag } from "../../platform/mysql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { IdentityService } from "../identity/service.js";
import { PortfolioEditingService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const config: RuntimeConfig = { nodeEnv: "test", host: "127.0.0.1", port: 4000, logLevel: "silent", databaseUrl: databaseUrl ?? "postgres://127.0.0.1:1", redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "editing-test" };
interface IdRow { id: string }

describeWithDatabase("portfolio editing integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1", { max: 4 });
  const identity = new IdentityService(sql);
  const service = new PortfolioEditingService(sql);
  const app = buildApi({ config, identityService: identity, portfolioEditingService: service });
  const marker = randomUUID();
  let userId = ""; let otherUserId = ""; let token = "";
  let companyId = ""; let postingId = ""; let portfolioId = "";
  let sectionId = ""; let blockId = ""; let recordId = ""; let snapshotId = "";
  let deploymentId = "";
  const initialText = "Initial generated evidence";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    const categoryId = (await sql<IdRow[]>`select id from category where key = 'experience' and is_system`)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    if (!planId || !categoryId || !templateId) throw new Error("editing seed missing");
    const users = await sql<IdRow[]>`insert into "user" (email, display_name, plan_id) values (${`editing-a-${marker}@example.com`}, 'Editing A', ${planId}), (${`editing-b-${marker}@example.com`}, 'Editing B', ${planId}) returning id`;
    userId = users[0]?.id ?? ""; otherUserId = users[1]?.id ?? "";
    token = (await identity.issueSession({ userId })).accessToken;
    recordId = (await sql<IdRow[]>`insert into record (user_id, category_id, title, status, origin, properties, body_md) values (${userId}, ${categoryId}, 'Source record', 'organized', 'manual', '{}'::jsonb, 'Exact record body') returning id`)[0]?.id ?? "";
    companyId = (await sql<IdRow[]>`insert into company (name, dedupe_key) values (${`Editing ${marker}`}, ${`editing-company-${marker}`}) returning id`)[0]?.id ?? "";
    postingId = (await sql<IdRow[]>`insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash) values (${companyId}, 'user_input', 'Engineer', 'Editing source', '{}'::jsonb, ${`editing-posting-${marker}`}) returning id`)[0]?.id ?? "";
    const analysisId = (await sql<IdRow[]>`insert into job_analysis (user_id, job_posting_id, input_type) values (${userId}, ${postingId}, 'paste') returning id`)[0]?.id;
    const brewId = analysisId && (await sql<IdRow[]>`insert into brew (user_id, job_analysis_id, length_preset) values (${userId}, ${analysisId}, 'single') returning id`)[0]?.id;
    if (!brewId) throw new Error("editing brew missing");
    portfolioId = (await sql<IdRow[]>`insert into portfolio (user_id, brew_id, template_id, title) values (${userId}, ${brewId}, ${templateId}, 'Editable') returning id`)[0]?.id ?? "";
    sectionId = (await sql<IdRow[]>`insert into portfolio_section (user_id, portfolio_id, order_no) values (${userId}, ${portfolioId}, 0) returning id`)[0]?.id ?? "";
    blockId = (await sql<IdRow[]>`insert into block (user_id, portfolio_section_id, kind, content, style) values (${userId}, ${sectionId}, 'paragraph', ${sql.json({ text: initialText })}, ${sql.json({ weight: 'normal' })}) returning id`)[0]?.id ?? "";
    const snapshot = { portfolioId, sections: [{ id: sectionId, recipeSectionId: null, order: 0, visible: true, blocks: [{ id: blockId, kind: 'paragraph', content: { text: initialText }, style: { weight: 'normal' }, sourceRecordId: null, syncState: 'synced', locked: false }] }] };
    snapshotId = (await sql<IdRow[]>`insert into portfolio_snapshot (user_id, portfolio_id, kind, snapshot) values (${userId}, ${portfolioId}, 'initial_generation', ${sql.json(snapshot)}) returning id`)[0]?.id ?? "";
    deploymentId = (await sql<IdRow[]>`insert into deployment (user_id, portfolio_id, version, subdomain, published_at) values (${userId}, ${portfolioId}, 1, ${`editing-${marker}`}, now()) returning id`)[0]?.id ?? "";
    await app.ready();
  });

  afterAll(async () => {
    if (userId && otherUserId) await sql`delete from "user" where id in (${userId}, ${otherUserId})`;
    if (postingId) await sql`delete from job_posting where id = ${postingId}`;
    if (companyId) await sql`delete from company where id = ${companyId}`;
    await app.close(); await sql.end({ timeout: 5 });
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it("previews without mutating, applies with a source link, and auto-locks", async () => {
    const previewResponse = await app.inject({ method: "POST", url: `/v1/portfolios/${portfolioId}/blocks/${blockId}/edit-preview`, headers: auth(), payload: { operation: "insert_record", recordId } });
    expect(previewResponse.statusCode).toBe(201);
    const proposal = previewResponse.json().data as { id: string; targetPath: string; before: { content: { text: string } }; after: { content: { text: string } } };
    expect(proposal.targetPath).toContain(`block:${blockId}`);
    expect(proposal.before.content.text).toBe(initialText);
    expect(proposal.after.content.text).toBe("Exact record body");
    expect((await sql<{ text: string }[]>`select content ->> 'text' as text from block where id = ${blockId}`)[0]?.text).toBe(initialText);

    const applyResponse = await app.inject({ method: "POST", url: `/v1/portfolio-edit-proposals/${proposal.id}/apply`, headers: auth() });
    expect(applyResponse.statusCode).toBe(200);
    const applied = applyResponse.json().data as { revisionId: string; locked: boolean };
    expect(applied.locked).toBe(true);
    expect((await sql<{ text: string; locked: boolean; source_record_id: string }[]>`select content ->> 'text' as text, locked, source_record_id from block where id = ${blockId}`)[0]).toEqual({ text: "Exact record body", locked: true, source_record_id: recordId });
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from record_usage where user_id = ${userId} and record_id = ${recordId} and block_id = ${blockId}`)[0]?.count).toBe(1);

    // 04 블록 조작 — 복제하고, 차례를 바꾸고, 지운다.
    const sectionOfBlock = (await sql<{ id: string }[]>`
      select portfolio_section_id as id from block where id = ${blockId}
    `)[0]?.id ?? "";
    const copy = await service.duplicateBlock(userId, portfolioId, blockId);
    const afterCopy = await sql<{ id: string; order_no: number; locked: boolean }[]>`
      select id, order_no, locked from block
      where portfolio_section_id = ${sectionOfBlock} order by order_no
    `;
    // 바로 뒤에 붙고, 사람이 만든 자리라 잠겨 있다.
    expect(afterCopy.map(({ id }) => id)).toContain(copy.blockId);
    expect(afterCopy.find(({ id }) => id === copy.blockId)).toMatchObject({ locked: true });
    expect(afterCopy.map(({ order_no }) => order_no)).toEqual([...afterCopy.keys()]);

    const flippedBlocks = [...afterCopy].reverse().map(({ id }) => id);
    await service.reorderBlocks(userId, portfolioId, sectionOfBlock, flippedBlocks);
    expect((await sql<{ id: string }[]>`
      select id from block where portfolio_section_id = ${sectionOfBlock} order by order_no
    `).map(({ id }) => id)).toEqual(flippedBlocks);
    await expect(service.reorderBlocks(userId, portfolioId, sectionOfBlock, [blockId]))
      .rejects.toMatchObject({ statusCode: 409 });

    // 지우기 전에 복원 지점을 뜬다 — 그 지점으로 되돌리면 블록이 다시 살아난다.
    const removed = await service.deleteBlock(userId, portfolioId, copy.blockId);
    expect((await sql<{ id: string }[]>`select id from block where id = ${copy.blockId}`)).toHaveLength(0);
    await service.restore(userId, portfolioId, removed.snapshotId);
    expect((await sql<{ id: string }[]>`select id from block where id = ${copy.blockId}`)).toHaveLength(1);

    // 복원은 그 지점에 없던 블록을 남기지 않는다 — 남기면 "그 지점으로"가 아니다.
    const later = await service.duplicateBlock(userId, portfolioId, blockId);
    await service.restore(userId, portfolioId, removed.snapshotId);
    expect((await sql<{ id: string }[]>`select id from block where id = ${later.blockId}`)).toHaveLength(0);
    // 되살린 블록끼리 자리가 부딪히지 않는다.
    const packed = await sql<{ order_no: number }[]>`
      select order_no from block where portfolio_section_id = ${sectionOfBlock} order by order_no
    `;
    expect(packed.map(({ order_no }) => order_no)).toEqual([...packed.keys()]);

    await service.deleteBlock(userId, portfolioId, copy.blockId);

    // 04 섹션 조작 — 숨기고, 순서를 통째로 다시 쓴다.
    const sections = await sql<{ id: string; order_no: number }[]>`
      select id, order_no from portfolio_section where portfolio_id = ${portfolioId} order by order_no
    `;
    const first = sections[0]?.id ?? "";
    await service.setSectionVisibility(userId, portfolioId, first, false);
    expect((await sql<{ visible: boolean; hidden_reason: string | null }[]>`
      select visible, hidden_reason from portfolio_section where id = ${first}
    `)[0]).toMatchObject({ visible: false, hidden_reason: "직접 숨김" });
    await service.setSectionVisibility(userId, portfolioId, first, true);

    const flipped = [...sections].reverse().map(({ id }) => id);
    await service.reorderSections(userId, portfolioId, flipped);
    expect((await sql<{ id: string }[]>`
      select id from portfolio_section where portfolio_id = ${portfolioId} order by order_no
    `).map(({ id }) => id)).toEqual(flipped);

    // 낡은 목록으로 차례를 덮지 않는다 — 빠진 섹션이 자리를 잃는다.
    await expect(service.reorderSections(userId, portfolioId, [...flipped, first]))
      .rejects.toMatchObject({ statusCode: 409 });

    // 블록 종류가 고칠 수 있는 자리를 정한다 — 문단에 수치의 칸은 없다.
    await expect(service.preview(userId, portfolioId, blockId, {
      operation: "update_text", path: "content.value", text: "12",
    })).rejects.toMatchObject({ statusCode: 422 });

    const textProposal = await service.preview(userId, portfolioId, blockId, { operation: "update_text", text: "Direct user edit" });
    expect(textProposal.patches).toEqual([
      expect.objectContaining({ path: "content.text", after: "Direct user edit" }),
    ]);
    const textApplied = await service.apply(userId, textProposal.id);
    expect(textApplied.locked).toBe(true);
    await sql`update block set content = ${sql.json({ text: 'Later conflicting edit' })} where id = ${blockId}`;
    await expect(service.revertRevision(userId, textApplied.revisionId)).rejects.toMatchObject({ statusCode: 409, publicDetails: { conflict: true } });
    const reverted = await service.revertRevision(userId, textApplied.revisionId, true);
    expect(reverted.conflictResolved).toBe(true);
    expect((await sql<{ text: string }[]>`select content ->> 'text' as text from block where id = ${blockId}`)[0]?.text).toBe("Exact record body");
  });

  it("restores the full initial snapshot while preserving deployment state and records the restore", async () => {
    const deploymentBefore = (await sql<{ value: unknown }[]>`select to_jsonb(deployment) as value from deployment where id = ${deploymentId}`)[0]?.value;
    const proposal = await service.preview(userId, portfolioId, blockId, { operation: "set_style", style: { highlight: true, spacing: "wide" } });
    await service.apply(userId, proposal.id);
    const restored = await service.restore(userId, portfolioId, snapshotId);
    expect(restored.preRestoreSnapshotId).toBeTruthy();
    expect(restored.revisionId).toBeTruthy();
    expect((await sql<{ content: { text: string }; style: { weight: string }; locked: boolean }[]>`select content, style, locked from block where id = ${blockId}`)[0]).toEqual({ content: { text: initialText }, style: { weight: 'normal' }, locked: false });
    const deploymentAfter = (await sql<{ value: unknown }[]>`select to_jsonb(deployment) as value from deployment where id = ${deploymentId}`)[0]?.value;
    expect(deploymentAfter).toEqual(deploymentBefore);
    expect((await sql<{ count: number }[]>`select count(*)::integer as count from revision where user_id = ${userId} and portfolio_id = ${portfolioId} and change_kind in ('revert', 'restore')`)[0]?.count).toBeGreaterThanOrEqual(2);
  });
});
