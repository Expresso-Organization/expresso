import { API_PREFIX, HomeReadModelSchema, type NotificationKind, type UnifiedSearchQuery } from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import { addOutboxEvent } from "../../platform/outbox.js";

interface NotificationRow {
  id: string; user_id: string; kind: NotificationKind; target_url: string;
  read_at: Date | string | null; delivery_status: "queued" | "sending" | "sent" | "failed" | "suppressed";
  attempts: number; created_at: Date | string;
}
interface SearchRow { id: string; resource_type: "record" | "portfolio" | "job"; title: string; subtitle: string; sort_title: string }

export interface NotificationDeliveryProvider {
  send(notification: { id: string; userId: string; kind: NotificationKind; targetUrl: string }): Promise<void>;
}

export class EngagementError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.name = "EngagementError"; this.statusCode = statusCode; }
}

function iso(value: Date | string): string { return new Date(value).toISOString(); }
function kstDate(at: Date): string { return new Date(at.getTime() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10); }
function notificationDto(row: NotificationRow) {
  return { id: row.id, kind: row.kind, targetUrl: row.target_url, readAt: row.read_at ? iso(row.read_at) : null, deliveryStatus: row.delivery_status, attempts: row.attempts, createdAt: iso(row.created_at) };
}

function decodeCursor(cursor: string | undefined): { title: string; type: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.title !== "string" || typeof parsed.type !== "string" || typeof parsed.id !== "string") throw new Error();
    return { title: parsed.title, type: parsed.type, id: parsed.id };
  } catch {
    throw new EngagementError(400, "invalid search cursor");
  }
}

function encodeCursor(row: SearchRow): string {
  return Buffer.from(JSON.stringify({ title: row.sort_title, type: row.resource_type, id: row.id })).toString("base64url");
}

export class EngagementService {
  readonly #sql: SqlTag;
  constructor(sql: SqlTag) { this.#sql = sql; }

  async setPreference(userId: string, kind: NotificationKind, enabled: boolean) {
    const user = (await this.#sql<{ id: string }[]>`select id from \`user\` where id = ${userId} and deletion_requested_at is null`)[0];
    if (!user) throw new EngagementError(404, "user not found");
    await this.#sql`
      insert into notification_preference (user_id, kind, enabled)
      values (${userId}, ${kind}, ${enabled})
      as new on duplicate key update enabled = new.enabled, updated_at = now(6)
    `;
    return { kind, enabled };
  }

  async preferences(userId: string) {
    const rows = await this.#sql<{ kind: NotificationKind; enabled: boolean }[]>`
      select kinds.kind, coalesce(preference.enabled, true) as enabled
      from unnest(array['deadline','saved_search','generation','traffic'][]) as kinds(kind)
      left join notification_preference as preference on preference.user_id = ${userId} and preference.kind = kinds.kind
      order by kinds.kind
    `;
    return rows;
  }

  async notify(userId: string, kind: NotificationKind, targetUrl: string, dedupeKey: string, at = new Date()) {
    return this.#sql.begin(async (transaction) => {
      const enabled = (await transaction<{ enabled: boolean }[]>`
        select coalesce((select enabled from notification_preference where user_id = ${userId} and kind = ${kind}), true) as enabled
      `)[0]?.enabled ?? true;
      if (!enabled) return { created: false, reason: "PREFERENCE_DISABLED" as const, notification: null };
      const date = kstDate(at);
      const row = (await transaction<(NotificationRow & { inserted: boolean })[]>`
        with inserted as (
          insert ignore into notification (user_id, kind, target_url, dedupe_key, dedupe_date, created_at, next_attempt_at)
          values (${userId}, ${kind}, ${targetUrl}, ${dedupeKey}, ${date}, ${at}, ${at})
            
          returning *, true as inserted
        )
        select * from inserted
        union all
        select notification.*, false as inserted from notification
        where user_id = ${userId} and dedupe_key = ${dedupeKey} and dedupe_date = ${date}
          and not exists (select 1 from inserted)
        limit 1
      `)[0];
      if (!row) throw new Error("notification missing");
      if (row.inserted) await addOutboxEvent(transaction, {
        topic: "notification.deliver", payload: { notificationId: row.id, userId }, idempotencyKey: `notification-deliver:${row.id}`,
      });
      return { created: row.inserted, reason: row.inserted ? "CREATED" as const : "DUPLICATE" as const, notification: notificationDto(row) };
    });
  }

  async deliver(notificationId: string, provider: NotificationDeliveryProvider, at = new Date()) {
    const claimed = await this.#sql.begin(async (transaction) => {
      const row = (await transaction<NotificationRow[]>`select * from notification where id = ${notificationId} for update`)[0];
      if (!row) throw new EngagementError(404, "notification not found");
      if (row.delivery_status === "sent" || row.delivery_status === "suppressed") return null;
      const enabled = (await transaction<{ enabled: boolean }[]>`
        select coalesce((select enabled from notification_preference where user_id = ${row.user_id} and kind = ${row.kind}), true) as enabled
      `)[0]?.enabled ?? true;
      if (!enabled) {
        await transaction`update notification set delivery_status = 'suppressed' where id = ${notificationId}`;
        return null;
      }
      const ready = (await transaction<{ ready: boolean }[]>`select next_attempt_at <= ${at} as ready from notification where id = ${notificationId}`)[0]?.ready;
      if (!ready || row.delivery_status === "sending") return null;
      await transaction`update notification set delivery_status = 'sending', attempts = attempts + 1 where id = ${notificationId}`;
      return { ...row, attempts: row.attempts + 1 };
    });
    if (!claimed) return this.getNotificationById(notificationId);
    try {
      await provider.send({ id: claimed.id, userId: claimed.user_id, kind: claimed.kind, targetUrl: claimed.target_url });
      await this.#sql`update notification set delivery_status = 'sent', delivered_at = ${at}, last_error = null where id = ${notificationId} and delivery_status = 'sending'`;
    } catch (error) {
      const delaySeconds = Math.min(2 ** claimed.attempts, 300);
      const summary = error instanceof Error ? error.name.slice(0, 100) : "UnknownError";
      await this.#sql`
        update notification set delivery_status = 'failed', last_error = ${summary},
          next_attempt_at = ${new Date(at.getTime() + delaySeconds * 1_000)}
        where id = ${notificationId} and delivery_status = 'sending'
      `;
      throw error;
    }
    return this.getNotificationById(notificationId);
  }

  async getNotificationById(id: string) {
    const row = (await this.#sql<NotificationRow[]>`select * from notification where id = ${id}`)[0];
    if (!row) throw new EngagementError(404, "notification not found");
    return notificationDto(row);
  }

  async listNotifications(userId: string) {
    const rows = await this.#sql<NotificationRow[]>`select * from notification where user_id = ${userId} order by created_at desc, id desc limit 100`;
    return rows.map(notificationDto);
  }

  async home(userId: string) {
    const [brews, portfolios, jobs, metrics] = await Promise.all([
      this.#sql<{ id: string; status: string; updated_at: Date | string }[]>`
        select id, status, updated_at from brew where user_id = ${userId} and status <> 'done' order by updated_at desc, id desc limit 5
      `,
      this.#sql<{ id: string; title: string; status: string }[]>`
        select id, title, status from portfolio where user_id = ${userId} order by title, id limit 10
      `,
      this.#sql<{
        id: string; title: string; company: string; score: string | number;
        company_id: string; logo_checksum: string | null;
      }[]>`
        select posting.id, posting.title, company.name as company, score.total as score,
               company.id as company_id, company.logo_checksum
        from match_score as score join job_posting as posting on posting.id = score.job_posting_id
        join company on company.id = posting.company_id
        where score.user_id = ${userId} order by score.total desc, posting.id limit 5
      `,
      this.#sql<{ key: string; value: string | number }[]>`
        select metric.metric_key as key, sum(metric.value) as value
        from metric_daily as metric join portfolio on portfolio.current_deployment_id = metric.deployment_id
        where portfolio.user_id = ${userId} group by metric.metric_key order by metric.metric_key
      `,
    ]);
    return HomeReadModelSchema.parse({
      activeBrews: brews.map((brew) => ({ id: brew.id, status: brew.status, updatedAt: iso(brew.updated_at) })),
      portfolios,
      recommendedJobs: jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        score: Number(job.score),
        companyLogoUrl: job.logo_checksum === null
          ? null
          : `${API_PREFIX}/companies/${job.company_id}/logo?v=${job.logo_checksum.slice(0, 16)}`,
      })),
      keyMetrics: metrics.map((metric) => ({ key: metric.key, value: Number(metric.value) })),
      empty: { brews: brews.length === 0, portfolios: portfolios.length === 0, recommendations: jobs.length === 0, metrics: metrics.length === 0 },
    });
  }

  async search(userId: string, input: UnifiedSearchQuery) {
    const cursor = decodeCursor(input.cursor);
    const pattern = `%${input.q}%`;
    const rows = await this.#sql<SearchRow[]>`
      with resources as (
        select record.id, 'record' as resource_type, record.title, record.status as subtitle, lower(record.title) as sort_title
        from record where record.user_id = ${userId} and record.deleted_at is null
        union all
        select portfolio.id, 'portfolio', portfolio.title, portfolio.status, lower(portfolio.title)
        from portfolio where portfolio.user_id = ${userId}
        union all
        select posting.id, 'job', posting.title, company.name, lower(posting.title)
        from job_posting as posting join company on company.id = posting.company_id
        where exists (select 1 from match_score where match_score.user_id = ${userId} and match_score.job_posting_id = posting.id)
      )
      select id, resource_type, title, subtitle, sort_title from resources
      where title ilike ${pattern}
        and (${cursor === null} or (sort_title, resource_type, id) > (${cursor?.title ?? ""}, ${cursor?.type ?? ""}, ${cursor?.id ?? "00000000-0000-0000-0000-000000000000"}))
      order by sort_title, resource_type, id
      limit ${input.limit + 1}
    `;
    const hasNextPage = rows.length > input.limit;
    const dataRows = rows.slice(0, input.limit);
    return {
      data: dataRows.map((row) => ({ id: row.id, type: row.resource_type, title: row.title, subtitle: row.subtitle })),
      page: { hasNextPage, nextCursor: hasNextPage && dataRows.at(-1) ? encodeCursor(dataRows.at(-1)!) : null },
    };
  }
}

