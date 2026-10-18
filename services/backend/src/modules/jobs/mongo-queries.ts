import { createHash } from "node:crypto";
import type { ListJobPostingsQuery } from "@expresso/contracts";
import type { Document } from "mongodb";
import { regionsOf } from "./ingest/classify.js";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const postingDedupeHash = (companyName: string, title: string, descriptionRaw: string) => sha256([companyName, title, descriptionRaw].map((value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")).join("\n"));
export const escapeSearch = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function experienceMinYears(note: string | null | undefined, label: string | null | undefined) {
  const text = note ?? label;
  if (text == null) return null;
  if (text.includes("신입")) return 0;
  const match = text.match(/[0-9]+/);
  return match ? Number(match[0]) : null;
}

export type FilterAxis = "category" | "country" | "location" | "experience" | "workType" | "company";
export function jobBoardFilter(query: ListJobPostingsQuery, at: Date, skip?: FilterAxis): Document {
  const clauses: Document[] = [];
  if (query.q) clauses.push({ $or: ["title", "company.name", "descriptionRaw"].map((field) => ({ [field]: { $regex: escapeSearch(query.q!), $options: "i" } })) });
  if (query.technology) {
    const escaped = escapeSearch(query.technology);
    // requirements.technologies는 그 공고를 한 번이라도 분석해야 채워진다 —
    // 대부분의 공고는 아직 비어 있다. 그래서 정리된 값이 없어도 본문·제목에
    // 그 기술 이름이 그대로 적혀 있으면 걸리게 폴백을 둔다. \b로 감싸는 이유는
    // "go"처럼 짧은 이름이 "going"·"good" 안의 일부로 잘못 걸리는 걸 막기
    // 위해서다 — 다만 "golang"처럼 다른 표기로만 적힌 경우는 여전히 못 잡는다.
    clauses.push({
      $or: [
        { "requirements.technologies": { $regex: `^${escaped}$`, $options: "i" } },
        { title: { $regex: `\\b${escaped}\\b`, $options: "i" } },
        { descriptionRaw: { $regex: `\\b${escaped}\\b`, $options: "i" } },
      ],
    });
  }
  if (query.interested !== undefined) clauses.push({ "interest._id": { $exists: query.interested } });
  if (query.stage) clauses.push({ "interest.stage": query.stage });
  if (skip !== "category") {
    if (query.family) clauses.push({ jobFamily: query.family });
    if (query.remote === true) clauses.push({ workType: /리모트/i });
    if (query.remote === false) clauses.push({ workType: { $not: /리모트/i } });
    if (query.deadline === "urgent") clauses.push({ expiresAt: { $gte: at, $lt: new Date(at.getTime() + 7 * 86_400_000) } });
    if (query.deadline === "open") clauses.push({ $or: [{ expiresAt: null }, { expiresAt: { $gte: at } }] });
    if (query.deadline === "always") clauses.push({ expiresAt: null });
  }
  if (skip !== "country" && query.country) clauses.push({ locationRegion: { $in: regionsOf(query.country) } });
  // 지역이 나라보다 더 좁다 — 함께 와도 안전하게 겹친다(경기는 늘 한국 안이다).
  if (skip !== "location" && query.location) clauses.push({ locationRegion: query.location });
  if (skip !== "experience" && query.experience !== undefined) clauses.push({ $or: [{ experienceMinYears: null }, { experienceMinYears: { $lte: query.experience } }] });
  if (skip !== "workType" && query.workType) clauses.push({ workType: { $regex: escapeSearch(query.workType), $options: "i" } });
  if (skip !== "company" && query.company) clauses.push({ companyId: query.company });
  return clauses.length ? { $and: clauses } : {};
}

export function jobBoardJoins(userId: string): Document[] {
  return [
    { $lookup: { from: "companies", localField: "companyId", foreignField: "_id", pipeline: [{ $project: { logoData: 0 } }], as: "company" } }, { $unwind: "$company" },
    ...[["match_scores", "match"], ["interests", "interest"]].flatMap(([from, name]) => [
      { $lookup: { from, localField: "_id", foreignField: "jobPostingId", pipeline: [{ $match: { userId } }], as: name } },
      { $unwind: { path: `$${name}`, preserveNullAndEmptyArrays: true } },
    ]),
  ];
}
