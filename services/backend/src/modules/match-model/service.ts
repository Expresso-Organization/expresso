import {
  ModelAccessSchema,
  ModelWireResultSchema,
  type ModelJob,
  type ModelProfile,
  type ModelView,
  type ModelWireRequest,
  type ModelWireResult,
} from "@expresso/contracts";
import { mongoCollections, type JobPostingDoc } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { HttpStatusError } from "../../api/plugins/auth-context.js";
import { readableCareerProperties } from "../career/record-text.js";
import type { ConsentService } from "../consent/service.js";

const LIMIT = 10;
const BATCH = 32;
const empty = (status: ModelView["status"], examined = 0): ModelView => ({
  status,
  source: "local",
  examined,
  eligible: 0,
  jobs: [],
});
type Row = ModelWireResult["jobs"][number];
type Candidate = { job: ModelJob; row: Row };

export class MatchModelService {
  constructor(
    readonly context: MongoContext,
    readonly url: string | undefined,
    readonly consent: Pick<ConsentService, "requireScope">,
  ) {}

  private async call(path: string, data?: unknown) {
    if (!this.url) throw new Error("Model offline");
    const response = await fetch(new URL(path, this.url), {
      method: data ? "POST" : "GET",
      ...(data
        ? {
            body: JSON.stringify(data),
            headers: { "content-type": "application/json" },
          }
        : {}),
      signal: AbortSignal.timeout(data ? 180000 : 2500),
    });
    if (!response.ok) throw new Error("Model request failed");
    return response.json();
  }

  async access() {
    try {
      return ModelAccessSchema.parse(await this.call("/health"));
    } catch {
      return { available: false, decisions: false };
    }
  }

  private async project(postings: JobPostingDoc[]): Promise<ModelJob[]> {
    const db = mongoCollections(this.context.db);
    const requirements = await db.jobPostingRequirements
      .find({
        jobPostingId: { $in: postings.map((p) => p._id) },
        kind: { $in: ["must", "nice"] },
      })
      .sort({ orderNo: 1, _id: 1 })
      .toArray();
    return postings.map((p) => {
      const fixed: ModelJob["requirementsFixed"] = requirements
        .filter((r) => r.jobPostingId === p._id && r.label.trim())
        .map((r) => ({
          id: r._id,
          kind: r.kind === "must" ? "must" : "preferred",
          criterion: r.label.trim(),
        }));
      const structured: ModelJob["requirementsFixed"] = [];
      const labels = new Set(fixed.map((r) => r.criterion));
      const must = Array.isArray(p.requirements)
        ? p.requirements
        : p.requirements && typeof p.requirements === "object"
          ? ["technologies", "impacts", "roles", "conditions"].flatMap(
              (key) => {
                const values = p.requirements as Record<string, unknown>;
                return Array.isArray(values[key]) ? values[key] : [];
              },
            )
          : [];
      const duties = (p.duties ?? []).flatMap((group) =>
        group &&
        typeof group === "object" &&
        !Array.isArray(group) &&
        Array.isArray(group.items)
          ? group.items
          : [group],
      );
      for (const [kind, texts] of [
        ["must", must],
        ["responsibility", duties],
        ["preferred", p.preferred],
      ] as const) {
        if (!Array.isArray(texts)) continue;
        for (const [i, value] of texts.entries()) {
          if (
            typeof value !== "string" ||
            !value.trim() ||
            !p.descriptionRaw?.includes(value.trim()) ||
            labels.has(value.trim())
          )
            continue;
          structured.push({
            id: kind + "-" + i,
            kind,
            criterion: value.trim(),
          });
          labels.add(value.trim());
        }
      }
      return {
        jobId: p._id,
        fields: {
          title: p.title,
          description: p.descriptionRaw,
          job_category: p.jobFamily ?? "",
        },
        requirementsFixed: fixed,
        structuredCriteria: structured,
      };
    });
  }

  async warmAnalysis(analysisId: string) {
    if (!this.url) return;
    const db = mongoCollections(this.context.db);
    const analysis = await db.jobAnalyses.findOne({
      _id: analysisId,
      status: "done",
    });
    if (!analysis?.jobPostingId) return;
    const posting = await db.jobPostings.findOne({
      _id: analysis.jobPostingId,
      source: { $in: ["api", "partner"] },
    });
    if (posting)
      await this.call("/v1/warm", { jobs: await this.project([posting]) });
  }

  async view(
    userId: string,
    external: boolean,
    postingId?: string,
  ): Promise<ModelView> {
    if (!this.url) return empty("unavailable");
    const db = mongoCollections(this.context.db);
    const user = await db.users.findOne({ _id: userId });
    if (!user) throw new HttpStatusError(404, "user not found");
    const [records, categories] = await Promise.all([
      db.careerRecords
        .find({
          userId,
          deletedAt: null,
          status: { $in: ["organized", "verified"] },
        })
        .sort({ _id: 1 })
        .toArray(),
      db.careerCategories.find({ userId }).toArray(),
    ]);
    const defs = new Map(categories.map((c) => [c._id, c.propertySchemaV2]));
    const profile: ModelProfile = {
      profileId: userId,
      experienceYears: user.profile?.experienceYears ?? null,
      records: records
        .filter((r) => r.title.trim() || r.bodyMd.trim())
        .map((r) => ({
          recordId: r._id,
          title: r.title,
          bodyMd: r.bodyMd,
          properties: readableCareerProperties(
            r.properties,
            defs.get(r.categoryId) ?? [],
          ),
        })),
    };
    if (!profile.records.length) return empty("insufficient_records");
    const publicSource = {
      $in: ["api", "partner"] as JobPostingDoc["source"][],
    };
    const own =
      postingId &&
      (await db.jobAnalyses.findOne({ userId, jobPostingId: postingId }));
    const cursor = db.jobPostings
      .find(
        postingId
          ? { _id: postingId, ...(own ? {} : { source: publicSource }) }
          : {
              source: publicSource,
              $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
            },
      )
      .sort({ _id: 1 });
    let examined = 0,
      eligible = 0;
    let top: Candidate[] = [];
    let source: ModelView["source"] = "local";
    const score = async (jobs: ModelJob[], mode: ModelWireRequest["mode"]) => {
      const response = ModelWireResultSchema.parse(
        await this.call("/v1/rank", {
          profile,
          jobs,
          mode,
          limit: LIMIT,
        } satisfies ModelWireRequest),
      );
      const byId = new Map(jobs.map((j) => [j.jobId, j]));
      if (
        response.eligible > jobs.length ||
        response.jobs.length !== Math.min(LIMIT, response.eligible) ||
        response.jobs.some((r) => !byId.has(r.jobId)) ||
        new Set(response.jobs.map((r) => r.jobId)).size !== response.jobs.length
      )
        throw new Error("Model job IDs mismatch");
      return {
        ...response,
        candidates: response.jobs.map((row) => ({
          job: byId.get(row.jobId)!,
          row,
        })),
      };
    };
    const add = async (batch: JobPostingDoc[]) => {
      const res = await score(
        await this.project(batch),
        postingId ? "evidence" : "local",
      );
      eligible += res.eligible;
      top = [...top, ...res.candidates]
        .sort(
          (a, b) =>
            b.row.localScore - a.row.localScore ||
            a.job.jobId.localeCompare(b.job.jobId),
        )
        .slice(0, LIMIT);
    };
    try {
      let batch: JobPostingDoc[] = [];
      for await (const posting of cursor) {
        examined++;
        batch.push(posting);
        if (batch.length === BATCH) {
          await add(batch);
          batch = [];
        }
      }
      if (batch.length) await add(batch);
    } catch {
      return empty("unavailable", examined);
    } finally {
      await cursor.close();
    }
    if (postingId && !examined)
      throw new HttpStatusError(404, "job posting not found");
    if (!eligible) return empty("no_requirements", examined);
    if (external && top.length) {
      if ((await this.access()).decisions) {
        await this.consent.requireScope(userId, "career_records");
        await this.consent.requireScope(userId, "job_posting_analysis");
        try {
          const result = await score(
            top.map((c) => c.job),
            postingId ? "verify" : "rerank",
          );
          if (result.candidates.length !== top.length)
            throw new Error("Incomplete shortlist");
          top = result.candidates;
          source = result.source;
        } catch {
          source = "fallback";
        }
      } else source = "fallback";
    }
    const titles = new Map(profile.records.map((r) => [r.recordId, r.title]));
    return {
      status: "ok",
      source,
      examined,
      eligible,
      jobs: top.map(({ row, job }) => ({
        jobId: job.jobId,
        title: job.fields.title,
        localScore: row.localScore,
        decisionScore: row.decisionScore,
        evidence: row.evidence.map((e) => ({
          label: e.label,
          records: e.recordIds.flatMap((recordId) =>
            titles.has(recordId)
              ? [{ recordId, title: titles.get(recordId)! }]
              : [],
          ),
        })),
      })),
    };
  }
}
