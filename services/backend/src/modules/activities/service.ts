import { type Activity, type ListActivitiesQuery } from "@expresso/contracts";
import { mongoCollections, type ActivityDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { fetchWevityPage, parseWevityRows, WEVITY_FIELDS, type WevityFetcher, type WevityRow } from "./wevity.js";

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

/** 서울 날짜(`YYYY-MM-DD`). 마감일은 날짜로만 다룬다. */
export function seoulDate(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 서울 날짜 `on`까지 남은 날. 지났으면 음수다. */
export function daysUntil(on: string, at: Date): number {
  return Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${seoulDate(at)}T00:00:00Z`)) / DAY_MS);
}

function activityView(row: ActivityDoc, at: Date): Activity {
  return {
    id: row._id,
    kind: row.kind,
    title: row.title,
    host: row.host,
    fields: row.fields,
    url: row.url,
    daysLeft: Math.max(0, daysUntil(row.deadlineOn, at)),
    status: row.status,
    firstSeenAt: row.firstSeenAt.toISOString(),
  };
}

/**
 * 활동(공모전 · 해커톤) 수집과 읽기.
 *
 * 수집은 예약 잡 `activity_collect`가 하루 한 번 부른다. 처음 본 활동에는 `firstSeenAt`을 남겨
 * 능동 제안이 "새로 올라온 것"을 가를 수 있게 한다. 다시 본 활동은 마감일과 상태만 고친다.
 */
export class ActivityService {
  readonly #fetchPage: WevityFetcher;

  constructor(readonly context: MongoContext, fetchPage: WevityFetcher = fetchWevityPage) {
    this.#fetchPage = fetchPage;
  }

  async collect(at = new Date()): Promise<{ read: number; added: number; updated: number }> {
    const rows = new Map<string, WevityRow>();
    for (const field of WEVITY_FIELDS) {
      const html = await this.#fetchPage(field).catch(() => null);
      for (const row of html ? parseWevityRows(html) : []) rows.set(row.id, row);
    }
    const { activities } = mongoCollections(this.context.db);
    let added = 0; let updated = 0;
    for (const row of rows.values()) {
      const deadlineOn = seoulDate(new Date(at.getTime() + row.daysLeft * DAY_MS));
      const result = await activities.updateOne(
        { _id: `wevity:${row.id}` },
        {
          $set: { kind: row.kind, title: row.title, host: row.host, fields: row.fields, url: row.url, deadlineOn, status: row.status, lastSeenAt: at },
          $setOnInsert: { source: "wevity" as const, firstSeenAt: at },
        },
        { upsert: true },
      );
      if (result.upsertedCount) added += 1; else updated += 1;
    }
    return { read: rows.size, added, updated };
  }

  /** 접수가 끝나지 않은 활동. 마감이 가까운 순서. */
  async list(query: Pick<ListActivitiesQuery, "kind" | "limit">, at = new Date()): Promise<Activity[]> {
    const rows = await mongoCollections(this.context.db).activities
      .find({ ...(query.kind ? { kind: query.kind } : {}), deadlineOn: { $gte: seoulDate(at) } })
      .sort({ deadlineOn: 1, _id: 1 })
      .limit(query.limit)
      .toArray();
    return rows.map((row) => activityView(row, at));
  }
}
