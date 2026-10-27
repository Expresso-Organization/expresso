import { createHash } from "node:crypto";
import { KM_PER_DEGREE_LAT, KOREAN_PLACES_BY_SPECIFICITY, NEARBY_RADIUS_KM, koreanPlace, kmPerDegreeLng, type KoreanPlace, type ListJobPostingsQuery } from "@expresso/contracts";
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
  if (skip !== "location" && query.location) {
    const place = koreanPlace(query.location);
    // 장소면 거리로 건다 — 반경 안이거나, 원문에서 장소를 못 읽은 같은 지역 공고.
    // 필드는 `nearbyStages`가 앞에서 채운다.
    clauses.push(place
      ? { $or: [{ nearbyDistanceKm: { $lte: NEARBY_RADIUS_KM } }, { nearbyPlace: null, locationRegion: place.region }] }
      : { locationRegion: query.location });
  }
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

/** 장소로 찾을 때만 그 장소를 돌려준다. 지역(`경기`)이면 undefined. */
export function nearbyPlaceOf(query: Pick<ListJobPostingsQuery, "location">): KoreanPlace | undefined {
  return query.location ? koreanPlace(query.location) : undefined;
}

/**
 * 장소 검색에 쓸 두 필드를 붙인다 — `nearbyPlace`(원문에서 읽은 장소)와
 * `nearbyDistanceKm`(찾은 장소까지의 거리).
 *
 * **집계 안에서 계산한다.** 쪽을 나눈 뒤 한 쪽 안에서만 다시 정렬하면 2쪽에
 * 더 가까운 공고가 남는다. 공고 문서에 좌표를 저장해 두는 방법도 있지만,
 * 그러려면 수집 · 마이그레이션까지 바꿔야 하고 사전이 바뀔 때마다 다시
 * 채워야 한다. 원문(`location`)은 이미 있고 사전은 60여 개라 매번 읽어도 싸다.
 *
 * 장소 이름은 그 공고의 `location_region`과 지역이 맞을 때만 읽는다 —
 * "부산 강서구"의 강서나 "인천 중구"의 중구를 서울로 읽지 않으려고.
 */
export function nearbyStages(place: KoreanPlace | undefined): Document[] {
  if (!place) return [];
  const location = { $toLower: { $ifNull: ["$location", ""] } };
  const branches = KOREAN_PLACES_BY_SPECIFICITY.map((candidate) => ({
    case: {
      $and: [
        { $eq: ["$locationRegion", candidate.region] },
        { $regexMatch: { input: location, regex: [candidate.name, ...(candidate.aliases ?? [])].join("|") } },
      ],
    },
    then: { name: candidate.name, lat: candidate.lat, lng: candidate.lng },
  }));
  const dy = { $multiply: [{ $subtract: ["$nearbyPlace.lat", place.lat] }, KM_PER_DEGREE_LAT] };
  const dx = { $multiply: [{ $subtract: ["$nearbyPlace.lng", place.lng] }, kmPerDegreeLng(place.lat)] };
  return [
    { $set: { nearbyPlace: { $switch: { branches, default: null } } } },
    { $set: { nearbyDistanceKm: { $cond: [{ $eq: ["$nearbyPlace", null] }, null, { $sqrt: { $add: [{ $multiply: [dy, dy] }, { $multiply: [dx, dx] }] } }] } } },
  ];
}

/**
 * 장소 검색의 순서 — **그 장소 → 가까운 순 → 장소를 못 읽은 공고.**
 *
 * 같은 칸 안에서만 사용자가 고른 정렬(`sortKey`)을 쓴다. "가까운 순"이 일치도
 * 순보다 앞서는 이유는, 장소를 적어 찾은 사람에게 먼저 필요한 것이 거기서
 * 다닐 수 있는 자리이기 때문이다.
 */
export function nearbyRank(place: KoreanPlace): Document {
  return {
    $switch: {
      branches: [
        { case: { $eq: ["$nearbyPlace.name", place.name] }, then: 0 },
        { case: { $ne: ["$nearbyDistanceKm", null] }, then: 1 },
      ],
      default: 2,
    },
  };
}
