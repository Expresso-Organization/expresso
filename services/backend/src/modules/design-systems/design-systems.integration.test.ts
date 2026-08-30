import { randomUUID } from "node:crypto";

import {
  BrewStateResponseSchema,
  DesignSelectionResponseSchema,
  DesignSystemCatalogResponseSchema,
  DesignSystemRevisionResponseSchema,
} from "@expresso/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { createMysqlResource } from "../../platform/mysql.js";
import { IdentityService } from "../identity/service.js";
import { MaterialsService } from "../materials/service.js";
import { catalogEntries } from "./catalog.js";
import { DesignSystemService } from "./service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: databaseUrl ?? "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-design-systems-test",
};

interface IdRow { id: string }

describe("design systems catalog", () => {
  it("기본 디자인의 template 연결과 컴파일 hash를 고정한다", () => {
    const entries = catalogEntries();
    expect(entries).toHaveLength(8);
    expect(entries.slice(0, 3).map(({ item }) => item.legacyTemplateId)).toEqual([
      "c42de58e-a0d3-4118-ab68-1a057324f7f1",
      "e1f697a4-ab3a-436a-913e-d214a65be422",
      "a3702f97-24e0-44ad-aff9-af895601dea1",
    ]);
    expect(entries.slice(3).every(({ item }) =>
      item.origin.kind === "reference"
      && item.origin.sourceUrl?.startsWith("https://styles.refero.design/style/")
      && item.legacyTemplateId === null
    )).toBe(true);
    expect(entries.filter(({ item }) => item.recommended)).toHaveLength(1);
    for (const { item, revision } of entries) {
      expect(item.markdownSha256).toBe(revision.markdownSha256);
      expect(revision.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(revision.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describeWithDatabase("design selection integration", () => {
  const sql = createMysqlResource(databaseUrl ?? "mysql://127.0.0.1:1/unused").sql;
  const identityService = new IdentityService(sql);
  const materialsService = new MaterialsService(sql);
  const designSystemService = new DesignSystemService(sql);
  const app = buildApi({ config, identityService, materialsService, designSystemService });
  const marker = randomUUID();
  let ownerId = "";
  let otherId = "";
  let ownerToken = "";
  let otherToken = "";
  let ownerBrewId = "";
  let otherBrewId = "";

  beforeAll(async () => {
    const planId = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!planId) throw new Error("free plan seed missing");
    ownerId = randomUUID();
    otherId = randomUUID();
    await sql`
      insert into \`user\` (id, email, display_name, plan_id)
      values
        (${ownerId}, ${`design-owner-${marker}@example.com`}, 'Design Owner', ${planId}),
        (${otherId}, ${`design-other-${marker}@example.com`}, 'Design Other', ${planId})
    `;
    const ownerAnalysisId = (await sql<IdRow[]>`
      insert into job_analysis (
        user_id, input_type, status, progress_stage, result_version, target_version, analyzed_at
      ) values (${ownerId}, 'free', 'done', 'done', 1, 1, now(6)) returning id
    `)[0]?.id;
    const otherAnalysisId = (await sql<IdRow[]>`
      insert into job_analysis (
        user_id, input_type, status, progress_stage, result_version, target_version, analyzed_at
      ) values (${otherId}, 'free', 'done', 'done', 1, 1, now(6)) returning id
    `)[0]?.id;
    if (!ownerAnalysisId || !otherAnalysisId) throw new Error("analysis fixture missing");
    ownerBrewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, free_title, free_brief, length_preset)
      values (${ownerId}, ${ownerAnalysisId}, 'Owner portfolio', 'Design test', 'single')
      returning id
    `)[0]?.id ?? "";
    otherBrewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, free_title, free_brief, length_preset)
      values (${otherId}, ${otherAnalysisId}, 'Other portfolio', 'Design test', 'single')
      returning id
    `)[0]?.id ?? "";
    ownerToken = (await identityService.issueSession({ userId: ownerId })).accessToken;
    otherToken = (await identityService.issueSession({ userId: otherId })).accessToken;
    await app.ready();
  });

  afterAll(async () => {
    if (ownerId && otherId) {
      await sql`delete from \`user\` where id in (${ownerId}, ${otherId})`;
    }
    await app.close();
    await sql.end({ timeout: 5 });
  });

  const auth = (token = ownerToken) => ({ authorization: `Bearer ${token}` });

  it("인증된 카탈로그와 디자인·revision 문서를 반환한다", async () => {
    const unauthorized = await app.inject({ method: "GET", url: "/v1/design-systems" });
    expect(unauthorized.statusCode).toBe(401);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/design-systems",
      headers: auth(),
    });
    expect(listResponse.statusCode).toBe(200);
    const list = DesignSystemCatalogResponseSchema.parse(listResponse.json()).data.items;
    expect(list).toHaveLength(8);

    const designResponse = await app.inject({
      method: "GET",
      url: `/v1/design-systems/${list[0]!.designSystemId}`,
      headers: auth(),
    });
    expect(designResponse.statusCode).toBe(200);
    expect(designResponse.json().data.revisionId).toBe(list[0]!.revisionId);

    const revisionResponse = await app.inject({
      method: "GET",
      url: `/v1/design-system-revisions/${list[0]!.revisionId}`,
      headers: auth(),
    });
    expect(revisionResponse.statusCode).toBe(200);
    const revision = DesignSystemRevisionResponseSchema.parse(revisionResponse.json()).data;
    expect(revision.designHtml).toContain('name="design-md-sha256"');
    expect(revision.markdownSha256).toBe(list[0]!.markdownSha256);
  });

  it("소유한 brew의 선택 스냅샷을 저장하고 BrewState에서 복원한다", async () => {
    const revision = catalogEntries()[1]!.revision;
    const selectedResponse = await app.inject({
      method: "POST",
      url: `/v1/brews/${ownerBrewId}/design-selection`,
      headers: auth(),
      payload: {
        revisionId: revision.revisionId,
        overrides: { density: "compact", accentStrength: "strong" },
      },
    });
    expect(selectedResponse.statusCode).toBe(200);
    const selected = DesignSelectionResponseSchema.parse(selectedResponse.json()).data;
    expect(selected).toMatchObject({
      designSystemRevisionId: revision.revisionId,
      styleOverrides: { density: "compact", accentStrength: "strong" },
      referenceLock: revision.referenceLock,
    });

    const stateResponse = await app.inject({
      method: "GET",
      url: `/v1/brews/${ownerBrewId}`,
      headers: auth(),
    });
    expect(stateResponse.statusCode).toBe(200);
    const state = BrewStateResponseSchema.parse(stateResponse.json()).data;
    expect(state.designSelection).toEqual(selected);

    const stored = (await sql<{
      design_system_revision_id: string | null;
      reference_lock_snapshot: unknown;
      design_style_overrides: unknown;
    }[]>`
      select design_system_revision_id, reference_lock_snapshot, design_style_overrides
      from brew where id = ${ownerBrewId}
    `)[0];
    expect(stored).toMatchObject({ design_system_revision_id: revision.revisionId });
    expect(stored?.reference_lock_snapshot).toEqual(revision.referenceLock);
    expect(stored?.design_style_overrides).toEqual({ density: "compact", accentStrength: "strong" });
  });

  it("알 수 없는 revision과 다른 사용자의 brew를 같은 404 경계에서 막는다", async () => {
    const unknownResponse = await app.inject({
      method: "POST",
      url: `/v1/brews/${ownerBrewId}/design-selection`,
      headers: auth(),
      payload: { revisionId: randomUUID() },
    });
    expect(unknownResponse.statusCode).toBe(404);

    const foreignResponse = await app.inject({
      method: "POST",
      url: `/v1/brews/${otherBrewId}/design-selection`,
      headers: auth(),
      payload: { revisionId: catalogEntries()[0]!.revision.revisionId },
    });
    expect(foreignResponse.statusCode).toBe(404);
    const otherSelection = (await sql<{ design_system_revision_id: string | null }[]>`
      select design_system_revision_id from brew where id = ${otherBrewId}
    `)[0];
    expect(otherSelection?.design_system_revision_id).toBeNull();

    const otherCanSelectOwn = await app.inject({
      method: "POST",
      url: `/v1/brews/${otherBrewId}/design-selection`,
      headers: auth(otherToken),
      payload: { revisionId: catalogEntries()[0]!.revision.revisionId },
    });
    expect(otherCanSelectOwn.statusCode).toBe(200);
  });
});
