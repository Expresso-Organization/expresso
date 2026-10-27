import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoJobBoardService } from "./board-service.js";

/**
 * 장소로 찾으면 그 장소 → 가까운 순 → 장소를 못 읽은 같은 지역 순으로 온다.
 *
 * 정렬은 집계 안에서 해야 한다 — 한 쪽만 받아 다시 정렬하면 2쪽에 더 가까운
 * 공고가 남는다. 그래서 쪽을 나눠서도 본다.
 */
describe.skipIf(!process.env.TEST_MONGODB_URL)("장소 검색 (mongodb)", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: MongoJobBoardService;
  const userId = randomUUID();
  const postings: [title: string, location: string, region: string][] = [
    ["평택", "경기도 평택시 고덕동", "경기"],
    ["미상 경기", "경기 지역 근무", "경기"],
    ["강남", "서울 강남구 테헤란로", "서울"],
    ["판교", "판교 오피스", "경기"],
    ["분당", "경기도 성남시 분당구 불정로 90", "경기"],
    ["마포", "서울 마포구 월드컵북로", "서울"],
    ["부산 강서", "부산 강서구", "부산"],
  ];

  beforeAll(async () => {
    fixture = await createMongoFixture("nearby");
    service = new MongoJobBoardService(fixture.resource);
    const db = mongoCollections(fixture.resource.db);
    const companyId = randomUUID();
    await db.companies.insertOne({ _id: companyId, name: "장소회사", brandColors: [] });
    for (const [index, [title, location, locationRegion]] of postings.entries()) {
      await db.jobPostings.insertOne({ _id: randomUUID(), companyId, source: "user_input", title, descriptionRaw: `장소 시험 본문 ${index}. ${"충분히 긴 설명. ".repeat(10)}`, requirements: {}, dedupeHash: `nearby-${index}`, createdAt: new Date(Date.now() - index * 60_000), location, locationRegion, jobFamily: "백엔드", duties: [], preferred: [], hiringProcess: [] });
    }
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it("판교 → 가까운 순(서울 강남 포함) → 장소를 못 읽은 경기 공고", async () => {
    const result = await service.list(userId, { location: "판교", sort: "recent", page: 1, limit: 20 });

    // 평택(반경 밖) · 마포(반경 밖) · 부산은 빠진다.
    expect(result.data.map((job) => job.title)).toEqual(["판교", "분당", "강남", "미상 경기"]);
    expect(result.summary.total).toBe(4);
    expect(result.data[0]?.nearby).toEqual({ place: "판교", distanceKm: 0 });
    expect(result.data[2]?.nearby?.place).toBe("강남");
    expect(result.data[2]?.nearby?.distanceKm).toBeGreaterThan(10);
    expect(result.data[3]?.nearby).toBeNull();
  });

  it("쪽을 나눠도 순서가 이어진다", async () => {
    const pages = await Promise.all([1, 2].map((page) => service.list(userId, { location: "판교", sort: "recent", page, limit: 2 })));
    expect(pages.flatMap((page) => page.data.map((job) => job.title))).toEqual(["판교", "분당", "강남", "미상 경기"]);
  });

  it("지역으로 찾으면 예전 그대로 그 지역 전체다", async () => {
    const result = await service.list(userId, { location: "경기", sort: "recent", page: 1, limit: 20 });
    expect(result.data.map((job) => job.title).sort()).toEqual(["미상 경기", "분당", "판교", "평택"].sort());
    expect(result.data.every((job) => job.nearby === null)).toBe(true);
  });
});
