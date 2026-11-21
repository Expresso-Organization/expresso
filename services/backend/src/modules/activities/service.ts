import { API_PREFIX, type Activity, type ActivitySource as ActivitySourceName, type ListActivitiesQuery } from "@expresso/contracts";
import { mongoCollections, type ActivityDoc } from "@expresso/database";
import type { Filter } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";
import { daysUntil, seoulDate } from "./dates.js";
import { findDuplicates } from "./dedupe.js";
import { fetchImage, storeActivityPosters, type FetchImage, type PosterResult } from "./posters.js";
import { ActivitySourceError, type ActivitySource } from "./sources/adapter.js";
import { BoottentSource } from "./sources/boottent.js";
import { ContestKoreaSource } from "./sources/contestkorea.js";
import { DevEventSource } from "./sources/devevent.js";
import { LinkareerSource } from "./sources/linkareer.js";
import { WevitySource } from "./sources/wevity.js";

export { daysUntil, seoulDate } from "./dates.js";

/** 출처 하나 이상이 실패한 수집. 성공한 출처의 활동은 이미 저장되어 있다. */
export class ActivityCollectError extends Error {
  override readonly name = "ActivityCollectError";
  constructor(readonly failed: { source: ActivitySourceName; error: string }[]) {
    super(`activity sources failed: ${failed.map(({ source, error }) => `${source} (${error})`).join(", ")}`.slice(0, 500));
  }
}

export interface ActivityCollectResult {
  read: number;
  added: number;
  updated: number;
  /** 다른 활동의 중복으로 묶인 접수 중 활동 수. */
  duplicates: number;
  sources: { source: ActivitySourceName; read: number; error: string | null }[];
  /** 이번 수집에서 새로 받아 보관한 포스터와 받지 못한 포스터. */
  posters: PosterResult;
}

/** 활동 수집이 매일 읽는 출처. 대표를 고르는 순서와는 무관하다(`dedupe.ts`). */
export function defaultActivitySources(): ActivitySource[] {
  return [new WevitySource(), new LinkareerSource(), new ContestKoreaSource(), new DevEventSource(), new BoottentSource()];
}

function activityView(row: ActivityDoc, at: Date): Activity {
  const applyStartOn = row.applyStartOn ?? null;
  return {
    id: row._id,
    source: row.source,
    kind: row.kind,
    title: row.title,
    host: row.host,
    fields: row.fields,
    url: row.url,
    homepageUrl: row.homepageUrl ?? null,
    applyStartOn,
    deadlineOn: row.deadlineOn,
    deadlinePrecision: row.deadlinePrecision ?? "day",
    daysLeft: Math.max(0, daysUntil(row.deadlineOn, at)),
    status: applyStartOn && applyStartOn > seoulDate(at) ? "접수예정" : "접수중",
    startsOn: row.startsOn ?? null,
    eligibility: row.eligibility ?? null,
    prize: row.prize ?? null,
    tuition: row.tuition ?? null,
    nbcardRequired: row.nbcardRequired ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    // 체크섬 앞부분을 주소에 넣는다 — 그림이 바뀌면 주소가 바뀌어, 1년 캐시를 걸어도 새 그림이 보인다.
    poster: row.poster ? { url: `${API_PREFIX}/activities/${encodeURIComponent(row._id)}/poster?v=${row.poster.checksum.slice(0, 16)}`, width: row.poster.width, height: row.poster.height } : null,
  };
}

/**
 * 활동(공모전 · 해커톤 · 부트캠프) 수집과 읽기.
 *
 * 수집은 예약 잡 `activity_collect`가 하루 한 번 부른다. 출처마다 접수 중인 활동을 받아 저장하고(처음 본 활동에는
 * `firstSeenAt`), 출처별 실행 결과를 `activity_sources`에 남긴다. 그다음 접수 중 활동 전체로 같은 활동 묶음을 다시
 * 계산해 대표가 아닌 것에 `duplicateOf`를 적는다.
 *
 * 목록은 대표만, 그리고 그 출처의 마지막 성공 실행에서 본 활동만 보인다 — 출처에서 내려간 활동이 마감일까지 남지 않게.
 */
export class ActivityService {
  readonly #sources: readonly ActivitySource[];
  readonly #fetchImage: FetchImage;

  constructor(readonly context: MongoContext, sources: readonly ActivitySource[] = defaultActivitySources(), fetchPoster: FetchImage = fetchImage) {
    this.#sources = sources;
    this.#fetchImage = fetchPoster;
  }

  /** 출처를 모두 읽는다. 실패한 출처가 있어도 나머지를 저장하고, 결과의 `sources`에 실패를 적는다. 던지지 않는다. */
  async collect(at = new Date()): Promise<ActivityCollectResult> {
    const { activities, activitySources } = mongoCollections(this.context.db);
    let read = 0; let added = 0; let updated = 0;
    const sources: ActivityCollectResult["sources"] = [];
    const posters: PosterResult = { stored: 0, failed: 0 };
    for (const source of this.#sources) {
      let rows;
      try {
        rows = await source.fetch(at);
      } catch (error) {
        const message = (error instanceof ActivitySourceError ? error.message : error instanceof Error ? `${error.name}: ${error.message}` : "unknown error").slice(0, 500);
        sources.push({ source: source.name, read: 0, error: message });
        await activitySources.updateOne({ _id: source.name }, { $set: { lastRunAt: at, lastError: message, lastRead: 0 }, $setOnInsert: { lastSucceededAt: null } }, { upsert: true });
        continue;
      }
      for (const row of rows) {
        const { sourceId, posterUrl: _posterUrl, ...fields } = row;
        const result = await activities.updateOne(
          { _id: `${source.name}:${sourceId}` },
          { $set: { ...fields, lastSeenAt: at }, $setOnInsert: { source: source.name, firstSeenAt: at, duplicateOf: null } },
          { upsert: true },
        );
        if (result.upsertedCount) added += 1; else updated += 1;
      }
      read += rows.length;
      sources.push({ source: source.name, read: rows.length, error: null });
      const stored = await storeActivityPosters(this.context.db, rows.map((row) => ({ id: `${source.name}:${row.sourceId}`, posterUrl: row.posterUrl })), this.#fetchImage);
      posters.stored += stored.stored; posters.failed += stored.failed;
      await activitySources.updateOne({ _id: source.name }, { $set: { lastRunAt: at, lastSucceededAt: at, lastError: null, lastRead: rows.length } }, { upsert: true });
    }
    const duplicates = await this.#markDuplicates(at);
    return { read, added, updated, duplicates, sources, posters };
  }

  /** 접수 중 활동 전체로 같은 활동 묶음을 다시 계산한다. */
  async #markDuplicates(at: Date): Promise<number> {
    const { activities } = mongoCollections(this.context.db);
    const open = await activities.find({ ...(await this.#visible()), deadlineOn: { $gte: seoulDate(at) } }, { projection: { _id: 1, source: 1, kind: 1, title: 1, deadlineOn: 1, homepageUrl: 1, duplicateOf: 1 } }).toArray();
    const primary = findDuplicates(open.map((row) => ({ id: row._id, source: row.source, kind: row.kind, title: row.title, deadlineOn: row.deadlineOn, homepageUrl: row.homepageUrl ?? null })));
    const changes = open.filter((row) => (row.duplicateOf ?? null) !== (primary.get(row._id) ?? null));
    if (changes.length) {
      await activities.bulkWrite(changes.map((row) => ({ updateOne: { filter: { _id: row._id }, update: { $set: { duplicateOf: primary.get(row._id) ?? null } } } })));
    }
    return [...primary.values()].filter((value) => value !== null).length;
  }

  /** 출처마다 마지막 성공 실행에서 본 활동만 고르는 조건. 아직 성공한 적이 없는 출처의 활동은 숨기지 않는다. */
  async #visible(): Promise<Filter<ActivityDoc>> {
    const runs = await mongoCollections(this.context.db).activitySources.find({ lastSucceededAt: { $ne: null } }).toArray();
    if (runs.length === 0) return {};
    const known = runs.map((run) => run._id);
    return { $or: [...runs.map((run) => ({ source: run._id, lastSeenAt: { $gte: run.lastSucceededAt! } })), { source: { $nin: known } }] };
  }

  /**
   * 접수가 끝나지 않은 활동(대표만). 기본은 마감이 가까운 순서, `sort: "fresh"`면 처음 본 순서의 역순.
   * `total`은 같은 조건의 전체 수다.
   */
  /** 보관한 포스터 그림. 없으면 null. */
  async poster(id: string): Promise<{ bytes: Buffer; mediaType: string } | null> {
    const doc = await mongoCollections(this.context.db).activityPosters.findOne({ _id: id }, { projection: { data: 1, mediaType: 1 } });
    return doc ? { bytes: Buffer.from(doc.data.buffer), mediaType: doc.mediaType } : null;
  }

  async list(query: Pick<ListActivitiesQuery, "kind" | "limit"> & { offset?: number; sort?: "deadline" | "fresh" }, at = new Date()): Promise<Activity[]> {
    return (await this.page(query, at)).data;
  }

  async page(query: Pick<ListActivitiesQuery, "kind" | "limit"> & { offset?: number; sort?: "deadline" | "fresh" }, at = new Date()): Promise<{ data: Activity[]; total: number }> {
    const activities = mongoCollections(this.context.db).activities;
    const filter: Filter<ActivityDoc> = {
      ...(await this.#visible()),
      ...(query.kind ? { kind: query.kind } : {}),
      deadlineOn: { $gte: seoulDate(at) },
      duplicateOf: { $in: [null] },
    };
    const sort = query.sort === "fresh" ? { firstSeenAt: -1 as const, _id: 1 as const } : { deadlineOn: 1 as const, _id: 1 as const };
    const [rows, total] = await Promise.all([
      activities.find(filter).sort(sort).skip(query.offset ?? 0).limit(query.limit).toArray(),
      activities.countDocuments(filter),
    ]);
    return { data: rows.map((row) => activityView(row, at)), total };
  }
}
