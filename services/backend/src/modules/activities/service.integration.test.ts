import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { ActivityService, daysUntil, seoulDate } from "./service.js";

const page = (rows: [id: string, title: string, day: string][]) => rows.map(([id, title, day]) => `
  <li ><div class="tit"><a href="?c=find&s=1&gub=1&cidx=20&gbn=view&gp=1&ix=${id}">${title}</a>
  <div class="sub-tit">분야 : 웹/모바일/IT</div></div><div class="organ">주최</div>
  <div class="day">${day} <span class="dday ing">접수중</span></div></li>`).join("");

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("활동 수집", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  beforeAll(async () => { fixture = await createMongoFixture("activities"); }, 60000);
  afterAll(async () => { await fixture?.dispose(); });

  it("처음 본 활동에 처음 본 때를 남기고, 다시 보면 마감일만 고친다", async () => {
    const first = new Date("2026-11-15T03:00:00Z");
    let pages: Record<number, string | null> = { 20: page([["1", "앱 개발 공모전", "D-3"], ["2", "바이브코딩 해커톤", "D-10"]]), 21: null };
    // 첫 쪽만 접수 중이다. 둘째 쪽부터는 접수가 끝난 줄뿐이라 읽기를 멈춘다.
    const asked: string[] = [];
    const service = new ActivityService(fixture.resource, async (field, at) => { asked.push(`${field}:${at}`); return at === 1 ? pages[field] ?? null : page([["9", "지난 공모전", "D+3"]]); });

    expect(await service.collect(first)).toEqual({ read: 2, added: 2, updated: 0 });
    expect(asked).toEqual(["20:1", "20:2", "21:1"]);

    const second = new Date("2026-11-16T03:00:00Z");
    pages = { 20: page([["1", "앱 개발 공모전", "D-2"], ["3", "새 공모전", "D-20"]]), 21: null };
    expect(await service.collect(second)).toEqual({ read: 2, added: 1, updated: 1 });

    const contests = await service.list({ kind: "contest", limit: 50 }, second);
    expect(contests.map(({ id, daysLeft }) => [id, daysLeft])).toEqual([["wevity:1", 2], ["wevity:3", 20]]);
    expect(contests[0]?.firstSeenAt).toBe(first.toISOString());
    expect(contests[1]?.firstSeenAt).toBe(second.toISOString());
    expect((await service.list({ kind: "hackathon", limit: 50 }, second)).map(({ id }) => id)).toEqual(["wevity:2"]);
  });

  it("읽히는 줄이 없으면 저장분을 그대로 두고, 접수가 끝난 활동은 목록에서 빠진다", async () => {
    const service = new ActivityService(fixture.resource, async () => "<html>점검 중</html>");
    const at = new Date("2026-11-17T03:00:00Z");
    expect(await service.collect(at)).toEqual({ read: 0, added: 0, updated: 0 });
    // 「앱 개발 공모전」은 11-18 마감이라 남고, 11-19에는 빠진다.
    expect((await service.list({ limit: 50 }, at)).some(({ id }) => id === "wevity:1")).toBe(true);
    expect((await service.list({ limit: 50 }, new Date("2026-11-19T03:00:00Z"))).some(({ id }) => id === "wevity:1")).toBe(false);
  });

  it("남은 날은 서울 날짜로 센다", () => {
    // UTC로는 11-15지만 서울은 이미 11-16이다.
    expect(seoulDate(new Date("2026-11-15T16:00:00Z"))).toBe("2026-11-16");
    expect(daysUntil("2026-11-18", new Date("2026-11-15T16:00:00Z"))).toBe(2);
  });
});
