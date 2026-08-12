import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { LocalMediaStorage } from "../../platform/storage/local.js";
import { IdentityService } from "../identity/service.js";
import { MediaService } from "./service.js";

/**
 * 그림이 들어오고 나가는 길 전체.
 *
 * 여기서 지키는 것은 넷이다 — 형식을 **바이트로** 판정하는가, 같은 파일을 두 번
 * 올려도 하나인가, 남의 자산을 내 지면에 놓을 수 없는가, 그리고 방문자가 인증
 * 없이 그림을 받을 수 있는가.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const root = mkdtempSync(join(tmpdir(), "expresso-media-"));
const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent",
  databaseUrl: databaseUrl ?? "postgres://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1", outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "expresso-media-test",
  mediaProvider: "local", mediaDir: root,
};

interface IdRow { id: string }

/**
 * 진짜 PNG. 머리만 맞춘 가짜로는 변환을 검증할 수 없다 — 인코더가 디코드하지
 * 못하고 변형이 0개로 나온다(그 폴백도 아래에서 함께 확인한다).
 * `tint`가 다르면 체크섬이 달라져 서로 다른 자산이 된다.
 */
async function png(width: number, height: number, tint = 0): Promise<Buffer> {
  return sharp({
    create: {
      width, height, channels: 3,
      background: { r: 236, g: 240, b: 248 },
    },
  })
    .composite([{
      input: await sharp({
        create: {
          width: Math.max(1, width >> 1), height: Math.max(1, height >> 1), channels: 3,
          background: { r: 18, g: (26 + tint) % 256, b: 48 },
        },
      }).png().toBuffer(),
      top: 0, left: 0,
    }])
    .png()
    .toBuffer();
}

describeWithDatabase("media upload and placement integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://127.0.0.1:1/unused", { max: 10 });
  const service = new MediaService(sql, new LocalMediaStorage(root));
  const identity = new IdentityService(sql);
  const app = buildApi({ config, identityService: identity, mediaService: service });
  const marker = randomUUID();
  let ownerId = "";
  let strangerId = "";
  let portfolioId = "";
  let sectionId = "";

  beforeAll(async () => {
    const plan = (await sql<IdRow[]>`select id from plan where code = 'free'`)[0]?.id;
    if (!plan) throw new Error("plan seed missing");
    ownerId = (await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values (${`media-owner-${marker}@example.com`}, 'Owner', ${plan}) returning id
    `)[0]?.id ?? "";
    strangerId = (await sql<IdRow[]>`
      insert into "user" (email, display_name, plan_id)
      values (${`media-stranger-${marker}@example.com`}, 'Stranger', ${plan}) returning id
    `)[0]?.id ?? "";

    const companyId = (await sql<IdRow[]>`
      insert into company (name, dedupe_key) values ('Media Co', ${`media-${marker}`}) returning id
    `)[0]?.id;
    const postingId = (await sql<IdRow[]>`
      insert into job_posting (company_id, source, title, description_raw, requirements, dedupe_hash)
      values (${companyId!}, 'user_input', 'Engineer', ${"x".repeat(250)}, '{}'::jsonb, ${`media-posting-${marker}`})
      returning id
    `)[0]?.id;
    const analysisId = (await sql<IdRow[]>`
      insert into job_analysis (user_id, job_posting_id, input_type, status)
      values (${ownerId}, ${postingId!}, 'paste', 'done') returning id
    `)[0]?.id;
    const brewId = (await sql<IdRow[]>`
      insert into brew (user_id, job_analysis_id, length_preset, status)
      values (${ownerId}, ${analysisId!}, 'single', 'done') returning id
    `)[0]?.id;
    const templateId = (await sql<IdRow[]>`select id from template where code = 'clarity'`)[0]?.id;
    portfolioId = (await sql<IdRow[]>`
      insert into portfolio (user_id, brew_id, template_id, title)
      values (${ownerId}, ${brewId!}, ${templateId!}, 'Media portfolio') returning id
    `)[0]?.id ?? "";
    sectionId = (await sql<IdRow[]>`
      insert into portfolio_section (user_id, portfolio_id, order_no)
      values (${ownerId}, ${portfolioId}, 0) returning id
    `)[0]?.id ?? "";
    await sql`
      insert into block (user_id, portfolio_section_id, kind, content, order_no)
      values (${ownerId}, ${sectionId}, 'paragraph', ${sql.json({ text: "먼저 있던 문단" })}, 0)
    `;
    await app.ready();
  });

  afterAll(async () => {
    if (ownerId || strangerId) {
      await sql`delete from "user" where id in (${ownerId}, ${strangerId})`;
    }
    await sql`delete from job_posting where dedupe_hash like ${`%${marker}`}`;
    await sql`delete from company where dedupe_key like ${`%${marker}`}`;
    await app.close();
    await sql.end({ timeout: 5 });
    rmSync(root, { recursive: true, force: true });
  });

  it("형식을 바이트로 판정하고, 같은 파일은 한 줄로 선다", async () => {
    const bytes = await png(1440, 900, 1);
    const asset = await service.upload(ownerId, bytes);
    expect(asset).toMatchObject({ mimeType: "image/png", width: 1440, height: 900 });

    // 같은 파일을 다시 올려도 사본이 생기지 않는다.
    const again = await service.upload(ownerId, bytes);
    expect(again.id).toBe(asset.id);
    expect((await sql<{ count: number }[]>`
      select count(*)::integer as count from media_asset where user_id = ${ownerId}
    `)[0]?.count).toBe(1);

    // 확장자도 Content-Type도 믿지 않는다 — SVG는 스크립트를 담을 수 있다.
    await expect(service.upload(ownerId, Buffer.from("<svg><script/></svg>")))
      .rejects.toMatchObject({ statusCode: 415 });

    // 머리는 PNG인데 몸이 깨진 파일 — 변환은 못 하지만 **올린 것을 잃지는 않는다.**
    const broken = Buffer.concat([bytes.subarray(0, 24), Buffer.from("broken")]);
    const brokenAsset = await service.upload(ownerId, broken);
    expect(brokenAsset.variants).toEqual([]);
    expect((await service.read(brokenAsset.id, 640)).mimeType).toBe("image/png");

    // 올린 바이트가 그대로 나온다.
    const served = await service.read(asset.id);
    expect(served.mimeType).toBe("image/png");
    expect(served.bytes.equals(bytes)).toBe(true);
  });

  it("올릴 때 폭 계단을 만들고, 요청한 폭에 맞는 것을 내보낸다", async () => {
    // 화면 캡처만 한 진짜 PNG. 가짜 머리로는 인코더를 검증할 수 없다.
    const original = await sharp({
      create: { width: 2400, height: 1350, channels: 3, background: { r: 236, g: 240, b: 248 } },
    })
      .composite([{
        input: await sharp({
          create: { width: 1200, height: 675, channels: 3, background: { r: 18, g: 26, b: 48 } },
        }).png().toBuffer(),
        top: 0, left: 0,
      }])
      .png()
      .toBuffer();

    const asset = await service.upload(ownerId, original);
    expect(asset.variants).toEqual([640, 1280, 1920, 2400]);

    // 폰이 고른 폭은 640짜리 WebP로 나간다.
    const phone = await service.read(asset.id, 640);
    expect(phone.mimeType).toBe("image/webp");
    expect((await sharp(phone.bytes).metadata()).width).toBe(640);
    // 이 일을 하는 이유가 이 한 줄이다 — 폰이 받는 것이 원본보다 훨씬 가볍다.
    expect(phone.bytes.length).toBeLessThan(original.length / 5);

    // 계단 사이의 폭을 요청하면 그보다 크지 않은 가장 큰 것을 준다.
    expect((await sharp((await service.read(asset.id, 1000)).bytes).metadata()).width).toBe(640);
    expect((await sharp((await service.read(asset.id, 1920)).bytes).metadata()).width).toBe(1920);

    // 폭을 주지 않으면 원본이다. 원본은 지우지 않는다 — 더 나은 인코더가
    // 생기면 여기서 다시 만든다.
    const raw = await service.read(asset.id);
    expect(raw.mimeType).toBe("image/png");
    expect(raw.bytes.length).toBe(original.length);
  });

  it("방문자는 인증 없이 그림을 받는다 — 링크를 받은 사람이 그림만 못 보면 안 된다", async () => {
    const asset = await service.upload(ownerId, await png(800, 600, 2));
    const response = await app.inject({ method: "GET", url: `/v1/media/${asset.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toContain("immutable");

    // 없는 자산은 404다. 없는 것을 500으로 돌려주지 않는다.
    expect((await app.inject({ method: "GET", url: `/v1/media/${randomUUID()}` })).statusCode)
      .toBe(404);
  });

  it("남의 자산은 내 지면에 놓을 수 없다", async () => {
    const mine = await service.upload(ownerId, await png(1200, 800, 3));
    const theirs = await service.upload(strangerId, await png(1200, 800, 4));

    const placed = await service.addBlock(ownerId, portfolioId, sectionId, {
      assetId: mine.id, alt: "관제 대시보드", frame: "browser",
    });
    expect(placed.blockId).toBeTruthy();

    await expect(service.addBlock(ownerId, portfolioId, sectionId, {
      assetId: theirs.id, alt: "", frame: "none",
    })).rejects.toMatchObject({ statusCode: 404 });

    // 놓인 블록은 잠겨 있다 — 사용자가 가져온 것이라 다시 추출해도 지워지지 않는다(P3).
    const block = (await sql<{ kind: string; locked: boolean; content: Record<string, unknown> }[]>`
      select kind, locked, content from block where id = ${placed.blockId}
    `)[0];
    expect(block?.kind).toBe("media");
    expect(block?.locked).toBe(true);
    expect(block?.content).toMatchObject({ assetId: mine.id, frame: "browser", width: 1200 });
    // 내보낼 수 있는 폭이 블록에 구워져 있다 — 배포 스냅샷이 흔들리지 않으려면
    // 이 값이 그 시점에 얼어 있어야 한다.
    expect((block?.content as { variants: number[] }).variants).toEqual([640, 1200]);

    // 이력에도 한 줄 남아 04c에서 되돌릴 수 있다.
    expect((await sql<{ count: number }[]>`
      select count(*)::integer as count from revision where block_id = ${placed.blockId}
    `)[0]?.count).toBe(1);
  });
});
