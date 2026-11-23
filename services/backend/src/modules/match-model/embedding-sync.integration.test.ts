import { randomUUID } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import { expect, it, vi } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { syncMatchEmbeddings } from "../../worker/match-embeddings.js";
import { IdentityService } from "../identity/service.js";
import { ConsentService } from "../consent/service.js";
import { CareerService } from "../career/service.js";
import { JobIngestService } from "../jobs/ingest/service.js";
import { MatchModelService } from "./service.js";

it.skipIf(!process.env.TEST_MONGODB_URL)(
  "최초 준비, 저장 직후 동기화, 장애 및 중단 동안의 변경을 추적한다",
  async () => {
    const fixture = await createMongoFixture("embedding-sync");
    const model = new MatchModelService(
      fixture.resource,
      "http://127.0.0.1:4810",
      new ConsentService(fixture.resource),
    );
    const db = mongoCollections(fixture.resource.db);
    let checkpoint: string | null = null;
    const profiles: string[][] = [],
      jobs: string[] = [],
      deleted: string[] = [];
    let failNext = false,
      backfills = 0;
    const errors: unknown[] = [];
    const user = (
      await new IdentityService(fixture.resource).signup({
        email: "sync@example.com",
        displayName: "동기화",
        password: "correct-horse-battery",
      })
    ).user.id;
    let record = "";
    const category = await db.careerCategories.findOne({ userId: user });
    const career = new CareerService(fixture.resource);
    const ingest = new JobIngestService(fixture.resource, [
      {
        provider: "greenhouse",
        fetch: async () => [
          {
            title: "Backend Engineer",
            externalId: "test-1",
            companyName: "테스트",
            descriptionRaw: "서버 개발 직무 및 공고 요건입니다. ".repeat(20),
            sourceUrl: "https://example.com/jobs/1",
            location: "서울",
            employmentType: "정규직",
            experienceLabel: "경력",
            team: "플랫폼",
            expiresAt: null,
          },
        ],
      },
    ]);
    const source = await ingest.addSource({
      provider: "greenhouse",
      token: "sync-test",
      displayName: "수집 시험",
    });
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      switch (url.pathname) {
        case "/v1/checkpoint":
          if (
            "token" in body &&
            (!("expected" in body) || body.expected === checkpoint)
          )
            checkpoint = body.token;
          return Response.json({ token: checkpoint });
        case "/v1/warm-profile":
          profiles.push(
            body.profile.records.map((r: { title: string }) => r.title),
          );
          break;
        case "/v1/warm":
          if (failNext) {
            failNext = false;
            return new Response(null, { status: 503 });
          }
          jobs.push(body.jobs[0].fields.title);
          break;
        case "/v1/owners":
          backfills++;
          return Response.json({ owners: [] });
        case "/v1/member-owners":
          return Response.json({
            owners: body.member === "record/" + record ? ["user/" + user] : [],
          });
        case "/v1/forget":
          deleted.push(body.owner);
          break;
        default:
          throw Error("Unexpected path " + url.pathname);
      }
      return Response.json({});
    });
    const start = () => {
      const ctl = new AbortController();
      const work = syncMatchEmbeddings(model, ctl.signal, (e) =>
        errors.push(e),
      );
      return async () => {
        ctl.abort();
        await work;
      };
    };
    let stop = start();
    try {
      await vi.waitFor(() => expect(checkpoint).toBeTruthy(), {
        timeout: 10000,
      });
      const created = await career.createRecord(user, randomUUID(), {
        categoryId: category!._id,
        title: "첫 기록",
        bodyMd: "본문",
        properties: {},
      });
      record = created.record.id;
      await career.updateRecord(user, record, created.record.version, {
        status: "organized",
      });
      await vi.waitFor(() => expect(profiles.at(-1)).toEqual(["첫 기록"]), {
        timeout: 10000,
      });
      failNext = true;
      await ingest.run(new Date(), [source.id]);
      const job = (await db.jobPostings.findOne({ title: "Backend Engineer" }))!
        ._id;
      await vi.waitFor(() => expect(jobs.at(-1)).toBe("Backend Engineer"), {
        timeout: 12000,
      });
      expect(errors).toHaveLength(1);
      await stop();
      await career.updateRecord(user, record, 2, { title: "오프라인 중 수정" });
      stop = start();
      await vi.waitFor(
        () => expect(profiles.at(-1)).toEqual(["오프라인 중 수정"]),
        { timeout: 10000 },
      );
      await db.careerRecords.deleteOne({ _id: record });
      await vi.waitFor(() => expect(profiles.at(-1)).toEqual([]), {
        timeout: 10000,
      });
      await db.jobPostings.deleteOne({ _id: job });
      await vi.waitFor(() => expect(deleted).toContain("job/" + job), {
        timeout: 10000,
      });
      expect(backfills).toBe(1);
    } finally {
      await stop();
      vi.unstubAllGlobals();
      await fixture.dispose();
    }
  },
  60000,
);
