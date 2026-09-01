import { randomUUID } from "node:crypto";

import {
  BrewStateResponseSchema,
  DesignSelectionResponseSchema,
  DesignSystemCatalogResponseSchema,
  DesignSystemRevisionResponseSchema,
} from "@expresso/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mongoCollections } from "@expresso/database";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { buildApi } from "../../api/build-app.js";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { MongoIdentityService } from "../identity/index.js";
import { MongoMaterialsService } from "../materials/index.js";
import { catalogEntries } from "./catalog.js";
import { DesignSystemService } from "./service.js";

const config: RuntimeConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 4_000,
  logLevel: "silent",
  databaseUrl: "mysql://127.0.0.1:1/unused",
  redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000,
  outboxBatchSize: 25,
  outboxMaxAttempts: 5,
  queuePrefix: "expresso-design-systems-test",
};

/** WCAG 2.1 상대 휘도. */
function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as number[];
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** 두 색의 명암비. */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe("design systems catalog", () => {
  it("기본 디자인의 template 연결과 컴파일 hash를 고정한다", () => {
    const entries = catalogEntries();
    // Expresso 기본 3 · Refero 참고 5 · Design Prompts 스타일 30
    expect(entries).toHaveLength(38);
    expect(entries.slice(0, 3).map(({ item }) => item.legacyTemplateId)).toEqual([
      "c42de58e-a0d3-4118-ab68-1a057324f7f1",
      "e1f697a4-ab3a-436a-913e-d214a65be422",
      "a3702f97-24e0-44ad-aff9-af895601dea1",
    ]);
    expect(entries.slice(3, 8).every(({ item }) =>
      item.origin.kind === "reference"
      && item.origin.sourceUrl?.startsWith("https://styles.refero.design/style/")
      && item.legacyTemplateId === null
    )).toBe(true);
    const presets = entries.slice(8);
    expect(presets).toHaveLength(30);
    expect(presets.every(({ item }) =>
      item.origin.kind === "builtin"
      && item.code.startsWith("designprompts-")
      && item.legacyTemplateId !== null
    )).toBe(true);
    // 같은 판 식별자가 두 번 나오면 인스펙터가 엉뚱한 문서를 연다.
    expect(new Set(entries.map(({ item }) => item.revisionId)).size).toBe(entries.length);
    expect(entries.filter(({ item }) => item.recommended)).toHaveLength(1);

    // 글자를 얹는 자리는 모두 WCAG 2.1 본문 기준을 넘는다. 서른여덟 벌 전부다.
    // 예전에는 밝기 임계로 흑 · 백을 갈라서 스물일곱 벌이 이 선 아래에 있었다.
    for (const { item, revision } of entries) {
      const { colors } = revision.spec;
      const pairs: Array<[string, number]> = [
        ["본문", contrast(colors.text.value, colors.canvas.value)],
        ["설명", contrast(colors.muted.value, colors.canvas.value)],
        ["행동 글자", contrast(colors.actionText.value, colors.action.value)],
      ];
      for (const [name, ratio] of pairs) {
        expect(`${item.code} ${name} ${ratio.toFixed(2)}`).toBe(
          `${item.code} ${name} ${Math.max(ratio, 4.5).toFixed(2)}`,
        );
      }
    }

    // 선언한 한글 서체를 문서가 실제로 불러오는지 본다. 이름만 적고 링크에
    // 빠지면 아무 경고 없이 기기의 아무 서체로 그려진다 — 고치기 전 상태다.
    for (const { item, revision } of entries) {
      const link = revision.designHtml.match(/href="(https:\/\/fonts\.googleapis\.com[^"]+)"/)?.[1] ?? "";
      for (const role of ["display", "body"] as const) {
        const korean = revision.spec.typography[role].fallback.split(",")[0]!.trim();
        expect(`${item.code} ${role} ${korean}`).toBe(
          `${item.code} ${role} ${link.includes(korean.replaceAll(" ", "+")) ? korean : "불러오지 않음"}`,
        );
      }
    }

    // 견본은 껍데기가 아니라 그 디자인의 형태를 입는다. 이 두 토큰이 빠지면
    // 서른여덟 벌이 같은 반경 10 · 헤어라인 상자로 되돌아간다.
    for (const { item, revision } of entries) {
      const card = revision.designHtml.match(/\.variant \.card\{[^}]*\}/)?.[0] ?? "";
      expect(`${item.code} ${card.includes("var(--card-radius)")}`).toBe(`${item.code} true`);
      expect(`${item.code} ${card.includes("var(--shadow)")}`).toBe(`${item.code} true`);
      expect(`${item.code} ${card.includes("var(--element-gap)")}`).toBe(`${item.code} true`);
    }

    // 배치와 컴포넌트 어휘가 지면에 실려야 CSS 가 걸 수 있다.
    for (const { item, revision } of entries) {
      const body = revision.designHtml.match(/<body [^>]*>/)![0];
      const kit = revision.spec.componentKit;
      for (const [name, value] of [
        ["layout", revision.spec.composition.layout],
        ["chrome", kit.chrome], ["marker", kit.marker],
        ["emphasis", kit.emphasis], ["divider", kit.divider],
      ] as const) {
        expect(`${item.code} ${name} ${body.includes(`data-${name}="${value}"`)}`)
          .toBe(`${item.code} ${name} true`);
      }
    }

    // 어휘 조합이 겹치면 요소가 같은 골격을 재탕한다.
    const kits = new Set(entries.map(({ revision }) => {
      const k = revision.spec.componentKit;
      return `${k.chrome}/${k.marker}/${k.emphasis}/${k.divider}`;
    }));
    expect(kits.size).toBeGreaterThanOrEqual(20);

    // 형태가 밀도에서만 나오면 Neo Brutalism 과 Claymorphism 이 같은 상자가 된다.
    const shapes = new Set(entries.map(({ revision }) => {
      const s = revision.spec.shape;
      return `${s.cardRadius}/${s.controlRadius}/${s.borderWidth}/${s.shadowStyle}`;
    }));
    expect(shapes.size).toBeGreaterThanOrEqual(18);

    // 서른여덟 벌이 세 벌의 서체를 돌려 쓰면 색만 다른 문서가 된다.
    const typefaces = new Set(entries.map(({ revision }) =>
      `${revision.spec.typography.display.family}/${revision.spec.typography.body.family}`));
    expect(typefaces.size).toBeGreaterThanOrEqual(20);
    // 출처 회사 마크는 참고 디자인에만 붙는다. 모르는 호스트는 null 이다.
    expect(entries.filter(({ item }) => item.preview.mark !== null)
      .map(({ item }) => item.preview.mark))
      .toEqual(["apple", "mercury", "linear", "elevenlabs", "stripe"]);
    for (const { item, revision } of entries) {
      expect(item.markdownSha256).toBe(revision.markdownSha256);
      expect(revision.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(revision.htmlSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe.skipIf(!process.env.TEST_MONGODB_URL)("design selection integration", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let app: ReturnType<typeof buildApi>;
  let ownerToken = "";
  let otherToken = "";
  let ownerBrewId = "";
  let otherBrewId = "";

  /** 브루 하나를 가진 사용자를 만든다. 디자인 선택은 브루에 붙는다. */
  async function seed(label: string) {
    const identity = new MongoIdentityService(fixture.resource);
    const { user, session } = await identity.signup({
      email: `design-${label}-${randomUUID()}@example.com`,
      displayName: `Design ${label}`,
      password: "correct-horse-battery",
    });
    const db = mongoCollections(fixture.resource.db);
    const analysisId = randomUUID();
    const brewId = randomUUID();
    const now = new Date();
    await db.jobAnalyses.insertOne({
      _id: analysisId, userId: user.id, jobPostingId: null, inputType: "free",
      status: "done", progressStage: "done", analyzedAt: now,
      resultVersion: 1, targetVersion: 1, attempts: 0, attachments: [],
    });
    await db.brews.insertOne({
      _id: brewId, userId: user.id, jobAnalysisId: analysisId,
      freeTitle: `${label} portfolio`, freeBrief: "Design test", mode: "solo",
      lengthPreset: "single", status: "draft", createdAt: now, updatedAt: now,
    });
    return { accessToken: session.accessToken, brewId };
  }

  beforeAll(async () => {
    fixture = await createMongoFixture("designsystems");
    app = buildApi({
      config,
      identityService: new MongoIdentityService(fixture.resource),
      materialsService: new MongoMaterialsService(fixture.resource),
      designSystemService: new DesignSystemService(fixture.resource),
    });
    const owner = await seed("owner");
    const other = await seed("other");
    ownerToken = owner.accessToken; ownerBrewId = owner.brewId;
    otherToken = other.accessToken; otherBrewId = other.brewId;
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await fixture?.dispose();
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
    expect(list).toHaveLength(38);

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

    const stored = await mongoCollections(fixture.resource.db).brews.findOne({ _id: ownerBrewId });
    expect(stored).toMatchObject({ designSystemRevisionId: revision.revisionId });
    expect(stored?.referenceLockSnapshot).toEqual(revision.referenceLock);
    expect(stored?.designStyleOverrides).toEqual({ density: "compact", accentStrength: "strong" });
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
    const otherBrew = await mongoCollections(fixture.resource.db).brews.findOne({ _id: otherBrewId });
    expect(otherBrew?.designSystemRevisionId ?? null).toBeNull();

    const otherCanSelectOwn = await app.inject({
      method: "POST",
      url: `/v1/brews/${otherBrewId}/design-selection`,
      headers: auth(otherToken),
      payload: { revisionId: catalogEntries()[0]!.revision.revisionId },
    });
    expect(otherCanSelectOwn.statusCode).toBe(200);
  });
});
