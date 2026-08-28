import type { z } from "zod";
type JobBrewState = z.infer<typeof JobBrewStateSchema>;
import { API_PREFIX, JobPostingDetailSchema, JobPostingListResponseSchema, JobPostingMatchSchema, JobRequirementsSchema, ListJobPostingsQuerySchema, RecentJobSearchListResponseSchema, JobBrewStateSchema, type ListJobPostingsQuery } from "@expresso/contracts";
import { mongoCollections, type CompanyDoc, type InterestDoc, type JobPostingDoc, type MatchScoreDoc, type JobPostingRequirementDoc, type RequirementCoverageDoc } from "@expresso/database";
import type { Document } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import type { JobBoardApi } from "./index.js";
import { JobMarketError } from "./errors.js";
import { countryOf } from "./ingest/classify.js";
import { jobBoardFilter, jobBoardJoins, type FilterAxis } from "./mongo-queries.js";

type BoardRow = JobPostingDoc & { company: CompanyDoc; match?: MatchScoreDoc; interest?: InterestDoc };
type Facet = { label: string; count: number };
const experienceLevels = [0, 3, 5, 7, 10, 15];
const workTypes = ["재택", "하이브리드", "출근"];
const ratio = <T extends { count: number }>(rows: T[], denominator = rows.reduce((sum, row) => sum + row.count, 0)) => rows.map((row) => ({ ...row, ratio: denominator ? row.count / denominator : 0 }));
const overlapping = (rows: Facet[]) => ratio(rows.filter((row) => row.count > 0), Math.max(0, ...rows.map((row) => row.count)));

function summary(row: BoardRow, brew: JobBrewState | undefined, at: Date) {
  const requirements = JobRequirementsSchema.parse(row.requirements);
  const axes = row.match ? JobPostingMatchSchema.shape.axes.parse(row.match.axes) : null;
  const match = row.match && axes ? { total: Math.round(Number(row.match.total.toString())), covered: Object.values(axes).reduce((sum, axis) => sum + axis.covered, 0), required: Object.values(axes).reduce((sum, axis) => sum + axis.required, 0), axes, reason: row.match.reasonText, nextAction: row.match.nextAction, computedAt: row.match.computedAt.toISOString() } : null;
  const company = row.company;
  return {
    id: row._id, title: row.title,
    company: { id: company._id, name: company.name, domain: company.domain ?? null, industry: company.industry ?? null, toneSummary: company.toneSummary ?? null, initial: company.initial ?? null, avatarBackground: company.avatarBackground ?? null, avatarColor: company.avatarColor ?? null, logoUrl: company.logoChecksum ? `${API_PREFIX}/companies/${company._id}/logo?v=${company.logoChecksum.slice(0, 16)}` : null },
    source: row.source, sourceUrl: row.sourceUrl ?? null, sourceBoard: row.sourceBoard ?? null, team: row.team ?? null, location: row.location ?? null, workType: row.workType ?? null, experienceLabel: row.experienceNote ?? row.experienceLabel ?? null, family: row.jobFamily ?? null,
    technologies: requirements.technologies.map((name) => ({ name, matched: match ? match.axes.technology.matched.includes(name) : null })),
    expiresAt: row.expiresAt?.toISOString() ?? null, daysLeft: row.expiresAt ? Math.floor(row.expiresAt.getTime() / 86_400_000) - Math.floor(at.getTime() / 86_400_000) : null, deadlineNote: row.deadlineNote ?? null, match,
    interest: row.interest ? { id: row.interest._id, stage: row.interest.stage, deadlineAt: row.interest.deadlineAt?.toISOString() ?? null, memo: row.interest.memo ?? null, updatedAt: row.interest.updatedAt.toISOString() } : null,
    brew: brew ?? null, createdAt: row.createdAt.toISOString(),
  };
}

export class MongoJobBoardService implements JobBoardApi {
  constructor(readonly context: MongoContext) {}

  async #brews(userId: string, postingIds: string[]): Promise<Map<string, JobBrewState>> {
    if (!postingIds.length) return new Map();
    const rows = await mongoCollections(this.context.db).brews.aggregate<{ _id: string; brew: { _id: string; status: JobBrewState["status"] }; counts: { answered: number; questionCount: number }[]; portfolios: { _id: string }[] }>([
      { $match: { userId } },
      { $lookup: { from: "job_analyses", localField: "jobAnalysisId", foreignField: "_id", pipeline: [{ $match: { userId, jobPostingId: { $in: postingIds } } }], as: "analysis" } }, { $unwind: "$analysis" },
      { $sort: { updatedAt: -1, _id: -1 } }, { $group: { _id: "$analysis.jobPostingId", brew: { $first: "$$ROOT" } } },
      { $lookup: { from: "interview_sessions", localField: "brew._id", foreignField: "brewId", pipeline: [{ $match: { userId } }, { $group: { _id: null, answered: { $sum: "$answeredCount" }, questionCount: { $sum: "$questionCount" } } }], as: "counts" } },
      { $lookup: { from: "portfolios", localField: "brew._id", foreignField: "brewId", pipeline: [{ $match: { userId } }, { $sort: { createdAt: -1, _id: -1 } }, { $limit: 1 }, { $project: { _id: 1 } }], as: "portfolios" } },
    ]).toArray();
    return new Map(rows.map((row) => [row._id, { id: row.brew._id, status: row.brew.status, answered: row.counts[0]?.answered ?? 0, questionCount: row.counts[0]?.questionCount ?? 0, portfolioId: row.portfolios[0]?._id ?? null }]));
  }

  async list(userId: string, input: ListJobPostingsQuery) {
    const query = ListJobPostingsQuerySchema.parse({ ...input, ...(input.interested === undefined ? {} : { interested: String(input.interested) }), ...(input.remote === undefined ? {} : { remote: String(input.remote) }) });
    const at = new Date();
    const filter = (skip?: FilterAxis): Document => ({ $match: jobBoardFilter(query, at, skip) });
    const group = (field: string): Document[] => [{ $match: { [field]: { $type: "string" } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $project: { _id: 0, label: "$_id", count: 1 } }];
    const technologies = (field: string, limit: number): Document[] => [filter(), { $unwind: `$${field}` }, ...group(field), { $limit: limit }];
    const countIf = (condition: Document) => ({ $sum: { $cond: [condition, 1, 0] } });
    const remote = { $regexMatch: { input: { $ifNull: ["$workType", ""] }, regex: "리모트", options: "i" } };
    const urgent = { $and: [{ $gte: ["$expiresAt", at] }, { $lt: ["$expiresAt", new Date(at.getTime() + 7 * 86_400_000)] }] };
    const direction = query.sort === "deadline" ? 1 : -1;
    const sortKey = query.sort === "match" ? { $ifNull: ["$match.total", -1] } : query.sort === "deadline" ? { $ifNull: ["$expiresAt", new Date("9999-12-31T00:00:00Z")] } : "$createdAt";
    const [result] = await mongoCollections(this.context.db).jobPostings.aggregate<{
      data: BoardRow[]; total: { count: number }[]; categories: { total: number; remote: number; urgent: number }[];
      families: Facet[]; regions: Facet[]; companies: { key: string; label: string; count: number }[];
      levels: Record<string, number>[]; workTypes: Record<string, number>[]; common: Facet[]; missing: Facet[];
    }>([...jobBoardJoins(userId), { $facet: {
      data: [filter(), { $set: { sortKey } }, { $sort: { sortKey: direction, _id: direction } }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
      total: [filter(), { $count: "count" }],
      categories: [filter("category"), { $group: { _id: null, total: { $sum: 1 }, remote: countIf(remote), urgent: countIf(urgent) } }],
      families: [filter("category"), ...group("jobFamily")], regions: [filter("country"), ...group("locationRegion")],
      companies: [filter("company"), { $group: { _id: "$companyId", label: { $first: "$company.name" }, count: { $sum: 1 } } }, { $sort: { count: -1, label: 1, _id: 1 } }, { $project: { _id: 0, key: "$_id", label: 1, count: 1 } }],
      levels: [filter("experience"), { $group: { _id: null, ...Object.fromEntries(experienceLevels.map((years) => [`y${years}`, countIf({ $lte: [{ $ifNull: ["$experienceMinYears", 0] }, years] })])) } }],
      workTypes: [filter("workType"), { $group: { _id: null, ...Object.fromEntries(workTypes.map((label, index) => [`w${index}`, countIf({ $regexMatch: { input: { $ifNull: ["$workType", ""] }, regex: label } })])) } }],
      common: technologies("requirements.technologies", 8), missing: technologies("match.axes.technology.missing", 5),
    } }]).toArray();
    if (!result) throw new Error("job board facet did not return a result");
    const total = result.total[0]?.count ?? 0;
    const byCountry = new Map<string, number>();
    for (const region of result.regions) { const label = countryOf(region.label); byCountry.set(label, (byCountry.get(label) ?? 0) + region.count); }
    const countries = [...byCountry].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const brews = await this.#brews(userId, result.data.map((row) => row._id));
    const chips = result.categories[0];
    const totalPages = Math.ceil(total / query.limit);
    return JobPostingListResponseSchema.parse({ data: result.data.map((row) => summary(row, brews.get(row._id), at)), summary: {
      total, categories: [{ key: "all", label: "전체", count: chips?.total ?? 0 }, ...result.families.map((row) => ({ key: `family:${row.label}`, label: row.label, count: row.count })), { key: "remote", label: "리모트", count: chips?.remote ?? 0 }, { key: "urgent", label: "마감 임박", count: chips?.urgent ?? 0 }],
      commonTechnologies: ratio(result.common, total), missingTechnologies: ratio(result.missing, total), countries: ratio(countries), companies: ratio(result.companies),
      experienceLevels: overlapping(experienceLevels.map((years) => ({ label: years === 0 ? "신입" : `${years}년`, count: result.levels[0]?.[`y${years}`] ?? 0 }))),
      workTypes: overlapping(workTypes.map((label, index) => ({ label, count: result.workTypes[0]?.[`w${index}`] ?? 0 }))),
    }, page: { page: query.page, pageSize: query.limit, totalPages, hasPrevPage: query.page > 1, hasNextPage: query.page < totalPages } });
  }

  async get(userId: string, jobPostingId: string) {
    const db = mongoCollections(this.context.db);
    const [posting] = await db.jobPostings.aggregate<BoardRow>([{ $match: { _id: jobPostingId } }, ...jobBoardJoins(userId)]).toArray();
    if (!posting) throw new JobMarketError(404, "job posting not found");
    const [analysis, requirements, brews] = await Promise.all([
      db.jobAnalyses.findOne({ userId, jobPostingId }, { sort: { analyzedAt: -1, _id: -1 } }),
      db.jobPostingRequirements.aggregate<JobPostingRequirementDoc & { coverage?: RequirementCoverageDoc }>([
        { $match: { jobPostingId } },
        { $set: { kindOrder: { $switch: { branches: [{ case: { $eq: ["$kind", "must"] }, then: 0 }, { case: { $eq: ["$kind", "nice"] }, then: 1 }], default: 2 } } } },
        { $sort: { kindOrder: 1, orderNo: 1, _id: 1 } },
        { $lookup: { from: "requirement_coverages", localField: "_id", foreignField: "requirementId", pipeline: [{ $match: { userId } }], as: "coverage" } },
        { $unwind: { path: "$coverage", preserveNullAndEmptyArrays: true } },
      ]).toArray(), this.#brews(userId, [jobPostingId]),
    ]);
    const coveredIds = requirements.flatMap((row) => Array.isArray(row.coverage?.coveredBy) ? row.coverage.coveredBy.filter((id): id is string => typeof id === "string") : []);
    const records = await db.careerRecords.find({ userId, _id: { $in: [...new Set(coveredIds)] } }).toArray();
    const titles = new Map(records.map((row) => [row._id, row.title]));
    const counts = new Map<string, number>();
    for (const id of coveredIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const topRecords = records.filter((row) => !row.deletedAt).sort((a, b) => (counts.get(b._id) ?? 0) - (counts.get(a._id) ?? 0) || a.title.localeCompare(b.title) || a._id.localeCompare(b._id)).slice(0, 3).map((row) => ({ id: row._id, title: row.title }));
    const rank = posting.match ? { position: 1 + await db.matchScores.countDocuments({ userId, total: { $gt: posting.match.total } }), total: await db.matchScores.countDocuments({ userId }) } : null;
    const mapped = summary(posting, brews.get(jobPostingId), new Date());
    const niceCoverage = new Map(requirements.filter((row) => row.kind === "nice").map((row) => [row.label, row.coverage?.coverage ?? null]));
    return JobPostingDetailSchema.parse({ ...mapped, company: { ...mapped.company, brandColors: posting.company.brandColors, tonePalette: posting.company.tonePalette ?? null, toneImpression: posting.company.toneImpression ?? null },
      descriptionRaw: posting.descriptionRaw, employmentType: posting.employmentType ?? null, salaryNote: posting.salaryNote ?? null, duties: posting.duties, preferred: posting.preferred.map((label) => ({ label, coverage: typeof label === "string" ? niceCoverage.get(label) ?? null : null })), hiringProcess: posting.hiringProcess.map((label) => ({ label })), processNote: posting.processNote ?? null, notice: posting.notice ?? null,
      requirements: JobRequirementsSchema.parse(posting.requirements),
      criteria: requirements.map((row) => ({ id: row._id, orderNo: row.orderNo, label: row.label, kind: row.kind, coverage: row.coverage?.coverage ?? null, coveredBy: (Array.isArray(row.coverage?.coveredBy) ? row.coverage.coveredBy : []).flatMap((id) => typeof id === "string" && titles.get(id) ? [{ id, title: titles.get(id)! }] : []), sourceSpan: row.sourceSpan })),
      analysis: analysis ? { id: analysis._id, status: analysis.status, progressStage: analysis.progressStage, analyzedAt: analysis.analyzedAt?.toISOString() ?? null } : null, rank, topRecords,
    });
  }

  async recentSearches(userId: string, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("recent search limit must be positive");
    const rows = await mongoCollections(this.context.db).recentSearches.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
    return RecentJobSearchListResponseSchema.parse({ data: rows.map((row) => ({ id: row._id, query: row.queryText, conditions: row.conditions, resultCount: row.resultCount, createdAt: row.createdAt.toISOString() })) });
  }

  async logo(companyId: string): Promise<{ bytes: Buffer; mediaType: string } | null> {
    const company = await mongoCollections(this.context.db).companies.findOne({ _id: companyId });
    return company?.logoData && company.logoMediaType ? { bytes: Buffer.from(company.logoData.buffer), mediaType: company.logoMediaType } : null;
  }
}
