import { mongoCollections } from "@expresso/database";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { ActivityService, daysUntil, seoulDate } from "./service.js";
import { ActivitySourceError, type ActivityRow, type ActivitySource } from "./sources/adapter.js";

const row = (sourceId: string, title: string, deadlineOn: string, extra: Partial<ActivityRow> = {}): ActivityRow => ({
  sourceId, kind: "contest", title, host: "주최", fields: ["웹/모바일/IT"], url: `https://example.com/${sourceId}`, homepageUrl: null,
  applyStartOn: null, deadlineOn, deadlinePrecision: "day", startsOn: null, eligibility: null, prize: null, tuition: null, nbcardRequired: null, status: "접수중", posterUrl: null, ...extra,
});

/** 시험용 출처 — `rows`를 바꿔 가며 돌리고, `fail`이면 던진다. */
const source = (name: ActivitySource["name"]) => {
  const state: { rows: ActivityRow[]; fail: boolean } = { rows: [], fail: false };
  const adapter: ActivitySource = { name, fetch: async () => { if (state.fail) throw new ActivitySourceError(`${name}: no rows`); return state.rows; } };
  return { adapter, state };
};

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("활동 수집", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  beforeAll(async () => { fixture = await createMongoFixture("activities"); }, 60000);
  afterAll(async () => { await fixture?.dispose(); });

  it("처음 본 활동에 처음 본 때를 남기고, 다시 보면 칸만 고친다", async () => {
    const wevity = source("wevity");
    const service = new ActivityService(fixture.resource, [wevity.adapter]);
    const first = new Date("2026-11-15T03:00:00Z");
    wevity.state.rows = [row("1", "앱 개발 공모전", "2026-11-18"), row("2", "바이브코딩 해커톤", "2026-11-25", { kind: "hackathon", applyStartOn: "2026-11-20" })];
    expect(await service.collect(first)).toMatchObject({ read: 2, added: 2, updated: 0, sources: [{ source: "wevity", read: 2, error: null }] });

    const second = new Date("2026-11-16T03:00:00Z");
    wevity.state.rows = [row("1", "앱 개발 공모전", "2026-11-18", { prize: "총 500만원" }), row("2", "바이브코딩 해커톤", "2026-11-25", { kind: "hackathon", applyStartOn: "2026-11-20" }), row("3", "새 공모전", "2026-12-05")];
    expect(await service.collect(second)).toMatchObject({ read: 3, added: 1, updated: 2 });

    const contests = await service.page({ kind: "contest", limit: 50 }, second);
    expect(contests.total).toBe(2);
    expect(contests.data.map(({ id, daysLeft, prize }) => [id, daysLeft, prize])).toEqual([["wevity:1", 2, "총 500만원"], ["wevity:3", 19, null]]);
    expect(contests.data[0]?.firstSeenAt).toBe(first.toISOString());
    const [hackathon] = await service.list({ kind: "hackathon", limit: 50 }, second);
    expect(hackathon).toMatchObject({ id: "wevity:2", status: "접수예정", applyStartOn: "2026-11-20", source: "wevity" });
    expect((await service.list({ limit: 50, sort: "fresh" }, second))[0]?.id).toBe("wevity:3");
  });

  it("포스터를 폭 480 webp로 줄여 보관하고, 같은 주소는 다시 받지 않으며, 주소가 없어지면 있던 포스터를 둔다", async () => {
    const linkareer = source("linkareer");
    // 출처 그림 대신 만든 세로 그림(1000×1400 PNG). 받은 주소를 센다.
    const png = await sharp({ create: { width: 1000, height: 1400, channels: 3, background: "#d97757" } }).png().toBuffer();
    const fetched: string[] = [];
    const service = new ActivityService(fixture.resource, [linkareer.adapter], async (url) => {
      fetched.push(url);
      if (url.endsWith("/broken")) throw new Error("poster 404");
      return { bytes: png, mediaType: "image/png" };
    });
    const at = new Date("2026-11-19T03:00:00Z");
    linkareer.state.rows = [
      row("p1", "포스터 공모전", "2026-12-01", { posterUrl: "https://cdn.example.com/p1.jpg" }),
      row("p2", "그림 없는 공모전", "2026-12-02"),
      row("p3", "깨진 그림 공모전", "2026-12-03", { posterUrl: "https://cdn.example.com/broken" }),
    ];
    expect((await service.collect(at)).posters).toEqual({ stored: 1, failed: 1 });
    const [withPoster, plain, broken] = (await service.list({ kind: "contest", limit: 50 }, at)).filter(({ id }) => id.startsWith("linkareer:p"));
    expect(withPoster?.poster).toMatchObject({ width: 480, height: 672 });
    expect(withPoster?.poster?.url).toMatch(/^\/v1\/activities\/linkareer%3Ap1\/poster\?v=[0-9a-f]{16}$/);
    expect(plain?.poster).toBeNull();
    expect(broken?.poster).toBeNull();
    const stored = await service.poster("linkareer:p1");
    expect(stored?.mediaType).toBe("image/webp");
    expect((await sharp(stored!.bytes).metadata()).format).toBe("webp");

    // 다음 수집: 같은 주소는 받지 않는다. 출처가 그림을 주지 않게 되어도 있던 포스터는 남는다.
    fetched.length = 0;
    linkareer.state.rows = [row("p1", "포스터 공모전", "2026-12-01", { posterUrl: null }), row("p3", "깨진 그림 공모전", "2026-12-03", { posterUrl: "https://cdn.example.com/broken" })];
    await service.collect(new Date("2026-11-20T03:00:00Z"));
    expect(fetched).toEqual(["https://cdn.example.com/broken"]);
    expect((await service.list({ kind: "contest", limit: 50 }, new Date("2026-11-20T03:00:00Z"))).find(({ id }) => id === "linkareer:p1")?.poster?.width).toBe(480);
  });

  it("출처가 실패하면 나머지를 저장하고 실패를 남긴다. 실패한 출처의 활동은 그대로 보인다", async () => {
    const devevent = source("devevent"); const boottent = source("boottent");
    const service = new ActivityService(fixture.resource, [devevent.adapter, boottent.adapter]);
    const at = new Date("2026-11-17T03:00:00Z");
    devevent.state.rows = [row("d1", "데이터 해커톤", "2026-11-30", { kind: "hackathon" })];
    boottent.state.rows = [row("b1", "백엔드 과정 3기", "2026-12-10", { kind: "bootcamp", tuition: 0, nbcardRequired: true })];
    await service.collect(at);

    boottent.state.fail = true;
    const later = new Date("2026-11-18T03:00:00Z");
    const result = await service.collect(later);
    expect(result.sources).toEqual([{ source: "devevent", read: 1, error: null }, { source: "boottent", read: 0, error: "boottent: no rows" }]);
    expect(await mongoCollections(fixture.resource.db).activitySources.findOne({ _id: "boottent" })).toMatchObject({ lastSucceededAt: at, lastError: "boottent: no rows", lastRead: 0 });
    expect((await service.list({ kind: "bootcamp", limit: 50 }, later)).map(({ id, tuition }) => [id, tuition])).toEqual([["boottent:b1", 0]]);
  });

  it("출처의 성공한 실행에서 보이지 않은 활동은 목록에서 빠진다", async () => {
    const contestkorea = source("contestkorea");
    const service = new ActivityService(fixture.resource, [contestkorea.adapter]);
    contestkorea.state.rows = [row("c1", "남는 공모전", "2026-12-20"), row("c2", "내려간 공모전", "2026-12-20")];
    await service.collect(new Date("2026-11-17T03:00:00Z"));
    contestkorea.state.rows = [row("c1", "남는 공모전", "2026-12-20")];
    const at = new Date("2026-11-18T03:00:00Z");
    await service.collect(at);
    const ids = (await service.list({ limit: 100 }, at)).map(({ id }) => id);
    expect(ids).toContain("contestkorea:c1");
    expect(ids).not.toContain("contestkorea:c2");
  });

  it("여러 출처의 같은 활동은 대표 하나만 보인다", async () => {
    const wevity = source("wevity"); const linkareer = source("linkareer");
    const service = new ActivityService(fixture.resource, [wevity.adapter, linkareer.adapter]);
    wevity.state.rows = [row("w9", "2026 서울관광 프롬프톤", "2026-11-29", { kind: "hackathon", homepageUrl: "https://sto.or.kr/notice/1" })];
    linkareer.state.rows = [
      row("l1", "[2026 서울관광 프롬프톤] 참가자모집", "2026-11-29", { kind: "hackathon" }),
      row("l2", "2026 서울관광 프롬프톤 (Seoul Tourism Prompt-thon)", "2026-11-29", { kind: "hackathon", homepageUrl: "https://prompt2026.sto.or.kr/" }),
    ];
    const at = new Date("2026-11-19T03:00:00Z");
    expect((await service.collect(at)).duplicates).toBeGreaterThanOrEqual(2);
    const hackathons = await service.list({ kind: "hackathon", limit: 100 }, at);
    expect(hackathons.filter(({ title }) => title.includes("프롬프톤")).map(({ id }) => id)).toEqual(["wevity:w9"]);
    expect((await mongoCollections(fixture.resource.db).activities.findOne({ _id: "linkareer:l2" }))?.duplicateOf).toBe("wevity:w9");
  });

  it("남은 날은 서울 날짜로 센다", () => {
    // UTC로는 11-15지만 서울은 이미 11-16이다.
    expect(seoulDate(new Date("2026-11-15T16:00:00Z"))).toBe("2026-11-16");
    expect(daysUntil("2026-11-18", new Date("2026-11-15T16:00:00Z"))).toBe(2);
  });
});
