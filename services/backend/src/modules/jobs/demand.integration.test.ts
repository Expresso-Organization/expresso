import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { DEMAND_PER_COMPANY, GoalDemandService } from "./demand.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("목표의 요건 집계 (mongodb)", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let service: GoalDemandService;
  const userId = randomUUID(); const other = randomUUID();
  const now = new Date("2026-11-20T03:00:00Z");
  let serial = 0;
  const add = async (companyId: string, input: { title?: string; family?: string; body: string; years?: number | null; expired?: boolean }) => {
    const id = randomUUID(); serial += 1;
    await mongoCollections(fixture.resource.db).jobPostings.insertOne({ _id: id, companyId, source: "user_input", title: input.title ?? `백엔드 엔지니어 ${serial}`, descriptionRaw: `${input.body} ${"충분히 긴 설명. ".repeat(10)}`, requirements: {}, dedupeHash: `demand-${serial}`, createdAt: new Date(now.getTime() - serial * 60_000), location: "서울", jobFamily: input.family ?? "백엔드", experienceMinYears: input.years ?? null, expiresAt: input.expired ? new Date(now.getTime() - 86_400_000) : null, duties: [], preferred: [], hiringProcess: [] } as never);
    return id;
  };
  let big: string; let small: string; let expiredInterest: string;
  beforeAll(async () => {
    fixture = await createMongoFixture("goaldemand");
    service = new GoalDemandService(fixture.resource);
    const db = mongoCollections(fixture.resource.db);
    big = randomUUID(); small = randomUUID();
    for (const [id, name] of [[big, "큰회사"], [small, "작은회사"]] as const) await db.companies.insertOne({ _id: id, name, brandColors: [] });
    // 큰 회사는 공고가 14건이다. 모두 Java · Kafka를 적었고 경력 6년이다.
    for (let index = 0; index < 14; index += 1) await add(big, { body: "Java, Kafka 기반 대용량 트래픽 처리", years: 6 });
    // 작은 회사는 5건이다. Kotlin을 적었고 신입도 받는다.
    for (let index = 0; index < 5; index += 1) await add(small, { body: "Kotlin 서버 개발, 코드 리뷰", years: 0 });
    await add(small, { family: "프론트엔드", title: "프론트엔드 엔지니어", body: "React와 TypeScript" });
    await add(small, { body: "마감한 공고 Rust", expired: true });
    expiredInterest = await add(small, { body: "관심 표시한 마감 공고 Kotlin, Redis", expired: true });
    await db.interests.insertOne({ _id: randomUUID(), userId, jobPostingId: expiredInterest, stage: "saved", updatedAt: now } as never);
  }, 60_000);
  afterAll(async () => fixture?.dispose());

  it("목표와 같은 직군의 열린 공고를 세고, 한 회사의 공고는 정해진 수까지만 넣는다", async () => {
    const demand = await service.forGoal(other, { work: "백엔드 개발자" }, now);
    expect(demand).toMatchObject({ work: "백엔드 개발자", family: "백엔드", basis: "family", focus: null, level: null, sampleSize: DEMAND_PER_COMPANY + 5, companyCount: 2, interestedCount: 0, small: false });
    const count = (id: string) => demand.items.find(item => item.id === id)?.count;
    expect(count("technology:java")).toBe(DEMAND_PER_COMPANY);
    expect(count("technology:kotlin")).toBe(5);
    expect(count("experience:scale")).toBe(DEMAND_PER_COMPANY);
    expect(count("career:5-7")).toBe(DEMAND_PER_COMPANY);
    // 다른 직군과 마감한 공고는 표본이 아니다.
    expect(count("technology:react")).toBeUndefined();
    expect(count("technology:rust")).toBeUndefined();
  });
  it("관심 표시한 공고는 마감했어도 표본에 넣는다. 남의 관심 공고는 넣지 않는다", async () => {
    const mine = await service.forGoal(userId, { work: "백엔드 개발자" }, now);
    expect(mine).toMatchObject({ sampleSize: DEMAND_PER_COMPANY + 6, interestedCount: 1 });
    expect(mine.items.find(item => item.id === "technology:kotlin")?.count).toBe(6);
    expect((await service.forGoal(other, { work: "백엔드 개발자" }, now)).interestedCount).toBe(0);
  });
  it("신입을 향한 목표는 경력 2년 이하이거나 연차를 적지 않은 공고로 좁힌다", async () => {
    const demand = await service.forGoal(other, { work: "백엔드 개발자", timing: "내년 2월 졸업, 신입으로 지원" }, now);
    expect(demand).toMatchObject({ level: "entry", sampleSize: 5, companyCount: 1, small: false });
    expect(demand.items.map(item => item.id)).toContain("career:0");
    expect(demand.items.map(item => item.id)).not.toContain("technology:java");
  });
  it("목표에 기술 이름이 있으면 그 기술이 나온 공고로 좁힌다. 좁혀서 다섯 건이 안 되면 좁히지 않는다", async () => {
    const java = await service.forGoal(other, { work: "Java 백엔드 개발자" }, now);
    expect(java).toMatchObject({ focus: "Java", sampleSize: DEMAND_PER_COMPANY, companyCount: 1 });
    // Rust는 마감한 공고에만 있다.
    const rust = await service.forGoal(other, { work: "Rust 백엔드 개발자" }, now);
    expect(rust).toMatchObject({ focus: null, sampleSize: DEMAND_PER_COMPANY + 5 });
  });
  it("직군으로 분류되지 않는 목표는 목표의 글로 찾고, 찾은 것이 적으면 표본이 적다고 낸다", async () => {
    const none = await service.forGoal(other, { work: "마케터" }, now);
    expect(none).toMatchObject({ family: null, basis: "keyword", sampleSize: 0, small: true, items: [] });
    // 두 글자 영문은 다른 낱말 안에서 잡히므로 찾지 않는다.
    expect(await service.forGoal(other, { work: "PM" }, now)).toMatchObject({ sampleSize: 0, small: true });
  });
});
