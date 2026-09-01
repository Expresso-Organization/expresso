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

export type FilterAxis = "category" | "country" | "experience" | "workType" | "company";
export function jobBoardFilter(query: ListJobPostingsQuery, at: Date, skip?: FilterAxis): Document {
  const clauses: Document[] = [];
  if (query.q) clauses.push({ $or: ["title", "company.name", "descriptionRaw"].map((field) => ({ [field]: { $regex: escapeSearch(query.q!), $options: "i" } })) });
  if (query.technology) clauses.push({ "requirements.technologies": { $regex: `^${escapeSearch(query.technology)}$`, $options: "i" } });
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
