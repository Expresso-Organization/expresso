import { randomUUID } from "node:crypto";

import { CONSENT_POLICY_VERSION } from "@expresso/contracts";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONTRACT_CONSENT, ConsentError, ConsentService } from "./service.js";
import { AI_CONTRACTS } from "../../platform/ai/client.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("동의", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 4 });
  const service = new ConsentService(sql);
  const marker = randomUUID();
  let userId = "";

  beforeAll(async () => {
    const planId = (await sql<{ id: string }[]>`select id from plan where code = 'free'`)[0]?.id ?? "";
    const email = `consent-${marker}@example.com`;
    userId = (await sql<{ id: string }[]>`
      insert into "user" (email, display_name, plan_id)
      values (${email}, 'Consent', ${planId}) returning id
    `)[0]?.id ?? "";
  });

  afterAll(async () => {
    if (userId) await sql`delete from "user" where id = ${userId}`;
    await sql.end({ timeout: 5 });
  });

  it("계약마다 어느 동의가 필요한지 빠짐없이 적혀 있다", () => {
    // 새 계약을 추가하고 여기 적지 않으면 이 테스트가 잡는다.
    // null도 답이다 — 사용자 데이터가 나가지 않는다는 뜻이고, 그것도 적어야 한다.
    for (const contract of AI_CONTRACTS) {
      expect(CONTRACT_CONSENT).toHaveProperty(contract);
    }
  });

  it("사용자 데이터가 나가지 않는 계약은 동의 없이도 부른다", async () => {
    // job_facts는 우리가 모아 온 공개 공고를 읽는다. 부르는 사용자가 없다.
    await expect(service.require(userId, "job_facts")).resolves.toBeUndefined();
  });

  it("묻기 전에는 아무 계약도 부를 수 없다", async () => {
    const before = await service.list(userId);
    expect(before.data.consents.every(({ granted }) => !granted)).toBe(true);
    await expect(service.require(userId, "job_analysis")).rejects.toThrow(ConsentError);
    await expect(service.require(userId, "generation")).rejects.toThrow(ConsentError);
  });

  it("범위를 따로 준다 — 공고만 주고 기록은 안 줄 수 있다", async () => {
    await service.grant(userId, ["job_posting_analysis"], CONSENT_POLICY_VERSION);

    await expect(service.require(userId, "job_analysis")).resolves.toBeUndefined();
    // 기록은 아직 안 줬다.
    await expect(service.require(userId, "record_cleanup")).rejects.toThrow(ConsentError);

    const listed = await service.list(userId);
    const posting = listed.data.consents.find(({ scope }) => scope === "job_posting_analysis");
    expect(posting).toMatchObject({ granted: true, needsRenewal: false });
    expect(posting?.grantedAt).toBeTruthy();
  });

  it("두 번 눌러도 동의는 하나다", async () => {
    await service.grant(userId, ["job_posting_analysis"], CONSENT_POLICY_VERSION);
    const rows = await sql<{ count: number }[]>`
      select count(*)::integer as count from consent
      where user_id = ${userId} and scope = 'job_posting_analysis' and revoked_at is null
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it("철회는 지우는 것이 아니라 끄는 것이다", async () => {
    await service.revoke(userId, "job_posting_analysis");
    await expect(service.require(userId, "job_analysis")).rejects.toThrow(ConsentError);

    const listed = await service.list(userId);
    const posting = listed.data.consents.find(({ scope }) => scope === "job_posting_analysis");
    // 동의한 적이 있다는 사실은 남는다.
    expect(posting).toMatchObject({ granted: false });
    expect(posting?.revokedAt).toBeTruthy();
  });

  it("문구가 바뀌면 옛 동의는 무효고, 끈 것과 구분해 보여준다", async () => {
    await service.grant(userId, ["career_records"], CONSENT_POLICY_VERSION);
    // 우리가 문구를 고쳐 판을 올린 상황.
    const bumped = new ConsentService(sql, { policyVersion: CONSENT_POLICY_VERSION + 1 });

    await expect(bumped.require(userId, "generation")).rejects.toThrow(ConsentError);
    const listed = await bumped.list(userId);
    const records = listed.data.consents.find(({ scope }) => scope === "career_records");
    expect(records).toMatchObject({ granted: false, needsRenewal: true, revokedAt: null });
  });

  it("옛 화면에서 온 승낙은 받지 않는다", async () => {
    await expect(
      service.grant(userId, ["career_records"], CONSENT_POLICY_VERSION + 1),
    ).rejects.toThrow(/동의 문구가 바뀌었습니다/);
  });
});
