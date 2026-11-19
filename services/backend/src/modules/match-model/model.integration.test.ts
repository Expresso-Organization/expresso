import { randomUUID } from "node:crypto";
import { mongoCollections, type JobPostingDoc } from "@expresso/database";
import {
  CONSENT_POLICY_VERSION,
  type ModelWireRequest,
} from "@expresso/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { IdentityService } from "../identity/service.js";
import { ConsentService } from "../consent/service.js";
import { MatchModelService } from "./service.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)(
  "공고 추천의 데이터 범위와 전역 순위",
  () => {
    let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
    let service: MatchModelService;
    let userId: string;
    const recordId = randomUUID(),
      foreignRecord = randomUUID(),
      privateJob = randomUUID();

    beforeAll(async () => {
      fixture = await createMongoFixture("match-model");
      const db = mongoCollections(fixture.resource.db);
      userId = (
        await new IdentityService(fixture.resource).signup({
          email: "match@example.com",
          displayName: "모델 시험",
          password: "correct-horse-battery",
        })
      ).user.id;
      const category = await db.careerCategories.findOne({ userId });
      const record = {
        userId,
        categoryId: category!._id,
        title: "경력",
        bodyMd: "운영 기록",
        properties: {},
        origin: "manual" as const,
        version: 1,
        updatedAt: new Date(),
      };
      await db.careerRecords.insertMany([
        { ...record, _id: recordId, status: "organized" },
        { ...record, _id: randomUUID(), status: "draft" },
        {
          ...record,
          _id: foreignRecord,
          userId: randomUUID(),
          status: "verified",
        },
      ]);
      const base = {
        companyId: randomUUID(),
        source: "api" as const,
        descriptionRaw: "공고 요건",
        requirements: [],
        duties: [],
        preferred: [],
        hiringProcess: [],
        createdAt: new Date(),
      };
      const posting = (i: number): JobPostingDoc => ({
        ...base,
        _id: randomUUID(),
        title: String(i),
        dedupeHash: randomUUID(),
      });
      await db.jobPostings.insertMany([
        ...Array.from({ length: 36 }, (_, i) => posting(i)),
        { ...posting(90), _id: privateJob, source: "user_input" },
        { ...posting(99), expiresAt: new Date(0) },
      ]);
      service = new MatchModelService(
        fixture.resource,
        "http://127.0.0.1:4810",
        new ConsentService(fixture.resource),
      );
    });
    afterEach(() => vi.unstubAllGlobals());
    afterAll(async () => {
      await fixture?.dispose();
    });

    function inference() {
      const calls: ModelWireRequest[] = [];
      vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
        if (url.pathname === "/health")
          return Response.json({ available: true, decisions: true });
        const input = JSON.parse(String(init.body)) as ModelWireRequest;
        calls.push(input);
        const jobs = input.jobs
          .map((j) => ({
            jobId: j.jobId,
            localScore: Number(j.fields.title),
            decisionScore: null,
            evidence: [
              {
                requirementId: "q1",
                label: "요건",
                recordIds: [recordId, foreignRecord],
              },
            ],
          }))
          .sort((a, b) => b.localScore - a.localScore)
          .slice(0, input.limit);
        return Response.json({
          eligible: input.jobs.length,
          source: input.mode === "rerank" ? "decisions" : "local",
          jobs,
        });
      });
      return calls;
    }

    it("두 배치에서 모집 중인 공개 공고만 선별하고 본인 기록만 반환한다", async () => {
      const calls = inference();
      const view = await service.view(userId, false);
      expect(calls.map((c) => c.jobs.length)).toEqual([32, 4]);
      expect(
        calls.every(
          (c) =>
            c.profile.records.length === 1 &&
            c.profile.records[0]?.recordId === recordId,
        ),
      ).toBe(true);
      expect(view.jobs.map((j) => j.localScore)).toEqual([
        35, 34, 33, 32, 31, 30, 29, 28, 27, 26,
      ]);
      expect(view.examined).toBe(36);
      expect(view.jobs[0]?.evidence[0]?.records.map((r) => r.recordId)).toEqual(
        [recordId],
      );
      await expect(
        service.view(userId, false, privateJob),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
    it("공개 공고 분석과 기록 전송 동의가 모두 있어야 외부 모델에 요청한다", async () => {
      const calls = inference();
      await expect(service.view(userId, true)).rejects.toMatchObject({
        statusCode: 403,
      });
      const consent = new ConsentService(fixture.resource);
      await consent.grant(userId, ["career_records"], CONSENT_POLICY_VERSION);
      await expect(service.view(userId, true)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(calls.every((c) => c.mode === "local")).toBe(true);
      await consent.grant(
        userId,
        ["job_posting_analysis"],
        CONSENT_POLICY_VERSION,
      );
      expect((await service.view(userId, true)).source).toBe("decisions");
      const reranks = calls.filter((c) => c.mode === "rerank");
      expect(reranks).toHaveLength(1);
      expect(reranks[0]?.jobs.map((j) => Number(j.fields.title))).toEqual([
        35, 34, 33, 32, 31, 30, 29, 28, 27, 26,
      ]);
    });
    it("두 번째 배치 실패 시 불완전한 순위를 숨긴다", async () => {
      const calls = inference();
      const invoke = globalThis.fetch;
      vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) =>
        calls.length ? new Response(null, { status: 503 }) : invoke(...args),
      );
      expect(await service.view(userId, false)).toMatchObject({
        status: "unavailable",
        jobs: [],
      });
    });
  },
);
