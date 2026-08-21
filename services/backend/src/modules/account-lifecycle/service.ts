import { createHash, randomBytes } from "node:crypto";

import { AccountExportSchema, DeletionRequestSchema } from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

export class AccountLifecycleError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.name = "AccountLifecycleError"; this.statusCode = statusCode; }
}

function tokenHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function iso(value: Date | string): string { return new Date(value).toISOString(); }

interface DeletionRow {
  id: string; user_id: string | null; subject_id: string; status: "pending" | "cancelled" | "purged";
  requested_at: Date | string; purge_after: Date | string; restoration: {
    portfolios?: Array<{ id: string; status: string }>;
    assets?: Array<{ id: string }>;
  };
}

export class AccountLifecycleService {
  readonly #sql: SqlTag;
  constructor(sql: SqlTag) { this.#sql = sql; }

  async exportData(userId: string, at = new Date()) {
    const account = (await this.#sql<Record<string, unknown>[]>`
      select id, email, display_name, created_at from \`user\` where id = ${userId}
    `)[0];
    if (!account) throw new AccountLifecycleError(404, "account not found");
    const [categories, records, skills, analyses, savedSearches, interests, brews, recipes, portfolios, deployments, assets, metrics, insights] = await Promise.all([
      this.#sql<Record<string, unknown>[]>`select id, \`key\`, name, property_schema, sort_order from category where user_id = ${userId} order by sort_order, id`,
      this.#sql<Record<string, unknown>[]>`select id, category_id, title, status, origin, properties, body_md, period, updated_at, deleted_at from record where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, name, level, evidence_count, last_used_at, strength from skill where user_id = ${userId} order by name, id`,
      this.#sql<Record<string, unknown>[]>`select id, job_posting_id, input_type, status, analyzed_at from job_analysis where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, query_text, filters, notify, last_run_at from saved_search where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, job_posting_id, stage, deadline_at, memo from interest where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, job_analysis_id, mode, length_preset, status, deadline_at, updated_at from brew where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, brew_id, version, status, completeness from recipe where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, brew_id, template_id, current_deployment_id, title, status from portfolio where user_id = ${userId} order by id`,
      this.#sql<Record<string, unknown>[]>`select id, portfolio_id, version, subdomain, contact_visibility, published_at, snapshot, seo from deployment where user_id = ${userId} order by portfolio_id, version`,
      this.#sql<Record<string, unknown>[]>`select id, portfolio_id, kind, file_url, page_format, version, revoked_at, created_at from export_asset where user_id = ${userId} order by created_at, id`,
      this.#sql<Record<string, unknown>[]>`select deployment_id, date, metric_key, value, sample_size from metric_daily where user_id = ${userId} order by date, metric_key`,
      this.#sql<Record<string, unknown>[]>`select deployment_id, period, narrative, evidence_metrics, suggestions, generated_at from insight where user_id = ${userId} order by generated_at, id`,
    ]);
    return AccountExportSchema.parse(JSON.parse(JSON.stringify({
      schemaVersion: 1, generatedAt: at.toISOString(), account,
      career: { categories, records, skills }, jobs: { analyses, savedSearches, interests },
      brewing: { brews, recipes }, publishing: { portfolios, deployments, assets }, analytics: { metrics, insights },
    })));
  }

  async requestDeletion(userId: string, at = new Date()) {
    const cancellationToken = randomBytes(32).toString("base64url");
    const row = await this.#sql.begin(async (transaction) => {
      const account = (await transaction<{ id: string; deletion_requested_at: Date | string | null }[]>`
        select id, deletion_requested_at from \`user\` where id = ${userId} for update
      `)[0];
      if (!account) throw new AccountLifecycleError(404, "account not found");
      if (account.deletion_requested_at) throw new AccountLifecycleError(409, "account deletion already requested");
      const portfolios = await transaction<{ id: string; status: string }[]>`select id, status from portfolio where user_id = ${userId} order by id`;
      const assets = await transaction<{ id: string }[]>`select id from export_asset where user_id = ${userId} and revoked_at is null order by id`;
      const purgeAfter = new Date(at.getTime() + 30 * 24 * 60 * 60 * 1_000);
      const request = (await transaction<DeletionRow[]>`
        insert into account_deletion_request (
          user_id, subject_id, status, requested_at, purge_after, cancellation_token_hash, restoration
        ) values (
          ${userId}, ${userId}, 'pending', ${at}, ${purgeAfter}, ${tokenHash(cancellationToken)},
          ${transaction.json({ portfolios, assets } as never)}
        ) returning *
      `)[0];
      if (!request) throw new Error("deletion request missing");
      await transaction`update \`user\` set deletion_requested_at = ${at} where id = ${userId}`;
      await transaction`update portfolio set status = 'unlisted' where user_id = ${userId} and status = 'published'`;
      await transaction`update export_asset set revoked_at = ${at} where user_id = ${userId} and revoked_at is null`;
      await transaction`insert into account_deletion_event (request_id, phase, affected_rows, occurred_at) values (${request.id}, 'access_revoked', ${portfolios.length + assets.length}, ${at})`;
      return request;
    });
    return DeletionRequestSchema.parse({ requestId: row.id, status: row.status, requestedAt: iso(row.requested_at), purgeAfter: iso(row.purge_after), cancellationToken });
  }

  async cancelDeletion(cancellationToken: string, at = new Date()) {
    const row = await this.#sql.begin(async (transaction) => {
      const request = (await transaction<DeletionRow[]>`
        select * from account_deletion_request where cancellation_token_hash = ${tokenHash(cancellationToken)} and status = 'pending' for update
      `)[0];
      if (!request || !request.user_id) throw new AccountLifecycleError(404, "pending deletion request not found");
      if (new Date(request.purge_after) <= at) throw new AccountLifecycleError(409, "deletion grace period expired");
      await transaction`update \`user\` set deletion_requested_at = null where id = ${request.user_id}`;
      for (const portfolio of request.restoration.portfolios ?? []) await transaction`
        update portfolio set status = ${portfolio.status} where id = ${portfolio.id} and user_id = ${request.user_id}
      `;
      const assetIds = (request.restoration.assets ?? []).map(({ id }) => id);
      if (assetIds.length > 0) await transaction`
        update export_asset set revoked_at = null, access_nonce = gen_random_uuid()
        where user_id = ${request.user_id} and id in ${transaction(assetIds)}
      `;
      await transaction`update account_deletion_request set status = 'cancelled', cancelled_at = ${at}, phase = 'cancelled' where id = ${request.id}`;
      await transaction`insert into account_deletion_event (request_id, phase, occurred_at) values (${request.id}, 'cancelled', ${at})`;
      return { ...request, status: "cancelled" as const };
    });
    return DeletionRequestSchema.parse({ requestId: row.id, status: "cancelled", requestedAt: iso(row.requested_at), purgeAfter: iso(row.purge_after) });
  }

  async purgeExpired(at = new Date(), limit = 100) {
    const ids = await this.#sql<{ id: string }[]>`
      select id from account_deletion_request where status = 'pending' and purge_after <= ${at}
      order by purge_after, id limit ${limit}
    `;
    const purged: string[] = [];
    for (const { id } of ids) {
      const didPurge = await this.#sql.begin(async (transaction) => {
        const request = (await transaction<DeletionRow[]>`select * from account_deletion_request where id = ${id} and status = 'pending' and purge_after <= ${at} for update`)[0];
        if (!request || !request.user_id) return false;
        const rawCount = Number((await transaction<{ count: number }[]>`select count(*) as count from analytics_event_receipt where user_id = ${request.user_id}`)[0]?.count ?? 0);
        await transaction`delete from analytics_event_receipt where user_id = ${request.user_id}`;
        await transaction`delete from visit_event where user_id = ${request.user_id}`;
        await transaction`insert ignore into account_deletion_event (request_id, phase, affected_rows, occurred_at) values (${id}, 'analytics_raw_purged', ${rawCount}, ${at})   `;
        const aggregateCount = Number((await transaction<{ count: number }[]>`
          select (select count(*) from metric_daily where user_id = ${request.user_id})
            + (select count(*) from insight where user_id = ${request.user_id}) as count
        `)[0]?.count ?? 0);
        await transaction`delete from metric_daily where user_id = ${request.user_id}`;
        await transaction`delete from insight where user_id = ${request.user_id}`;
        await transaction`insert ignore into account_deletion_event (request_id, phase, affected_rows, occurred_at) values (${id}, 'analytics_aggregate_purged', ${aggregateCount}, ${at})   `;
        await transaction`delete from \`user\` where id = ${request.user_id}`;
        await transaction`update account_deletion_request set status = 'purged', purged_at = ${at}, phase = 'complete' where id = ${id}`;
        await transaction`insert ignore into account_deletion_event (request_id, phase, affected_rows, occurred_at) values (${id}, 'account_purged', 1, ${at})   `;
        return true;
      });
      if (didPurge) purged.push(id);
    }
    return { purged };
  }
}
