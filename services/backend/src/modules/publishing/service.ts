import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  DeploymentSchema,
  DeploymentSummarySchema,
  PublicPortfolioSchema,
  SignedAssetSchema,
  type PublishPortfolio,
  type SubmitExport,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import { EntitlementService } from "../entitlements/service.js";
import { addOutboxEvent } from "../../platform/outbox.js";

interface DeploymentRow {
  id: string;
  portfolio_id: string;
  version: number;
  subdomain: string;
  snapshot: Record<string, unknown>;
  seo: Record<string, unknown>;
  contact_visibility: "public" | "on_request" | "hidden";
  published_at: Date | string;
}

interface ExportJobRow {
  id: string;
  user_id: string;
  portfolio_id: string;
  deployment_id: string | null;
  kind: "pdf" | "deck";
  page_format: "letter" | "a4" | null;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  asset_id: string | null;
  error_code: string | null;
  request_hash: string;
}

interface AssetRow {
  id: string;
  user_id: string;
  portfolio_id: string;
  kind: "pdf" | "deck" | "resume_file";
  file_url: string;
  version: number;
  access_nonce: string;
  revoked_at: Date | string | null;
}

export class PublishingError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PublishingError";
    this.statusCode = statusCode;
  }
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function deploymentDto(row: DeploymentRow) {
  return DeploymentSchema.parse({
    id: row.id,
    portfolioId: row.portfolio_id,
    version: row.version,
    slug: row.subdomain,
    snapshot: row.snapshot,
    seo: row.seo,
    contactVisibility: row.contact_visibility,
    publishedAt: iso(row.published_at),
  });
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class PublishingService {
  readonly #sql: SqlTag;
  readonly #signingSecret: string;

  constructor(sql: SqlTag, signingSecret = "expresso-local-asset-signing-secret") {
    if (signingSecret.length < 16) throw new Error("asset signing secret must be at least 16 characters");
    this.#sql = sql;
    this.#signingSecret = signingSecret;
  }

  async #snapshot(transaction: SqlTag, userId: string, portfolioId: string) {
    const portfolio = (await transaction<{ id: string; title: string; template_id: string }[]>`
      select id, title, template_id from portfolio where id = ${portfolioId} and user_id = ${userId} for update
    `)[0];
    if (!portfolio) throw new PublishingError(404, "portfolio not found");
    const sections = await transaction<{ id: string; order_no: number; visible: boolean }[]>`
      select id, order_no, visible from portfolio_section
      where user_id = ${userId} and portfolio_id = ${portfolioId}
      order by order_no, id
    `;
    const blocks = await transaction<{ id: string; portfolio_section_id: string; kind: string; content: Record<string, unknown>; style: Record<string, unknown>; locked: boolean }[]>`
      select block.id, block.portfolio_section_id, block.kind, block.content, block.style, block.locked
      from block join portfolio_section on portfolio_section.id = block.portfolio_section_id
      where block.user_id = ${userId} and portfolio_section.portfolio_id = ${portfolioId}
      order by portfolio_section.order_no, block.order_no, block.id
    `;
    return {
      portfolioId,
      title: portfolio.title,
      templateId: portfolio.template_id,
      sections: sections.map((section) => ({
        id: section.id,
        order: section.order_no,
        visible: section.visible,
        blocks: blocks.filter((block) => block.portfolio_section_id === section.id).map((block) => ({
          id: block.id,
          kind: block.kind,
          content: block.content,
          style: block.style,
          locked: block.locked,
        })),
      })),
    };
  }

  async publish(userId: string, portfolioId: string, input: PublishPortfolio, at = new Date()) {
    try {
      return await this.#sql.begin(async (transaction) => {
        const snapshot = await this.#snapshot(transaction, userId, portfolioId);
        const current = (await transaction<{ subdomain: string }[]>`
          select deployment.subdomain from portfolio
          left join deployment on deployment.id = portfolio.current_deployment_id
          where portfolio.id = ${portfolioId} and portfolio.user_id = ${userId}
        `)[0];
        const version = Number((await transaction<{ version: number }[]>`
          select coalesce(max(version), 0) + 1 as version
          from deployment where user_id = ${userId} and portfolio_id = ${portfolioId}
        `)[0]?.version ?? 1);
        const row = (await transaction<DeploymentRow[]>`
          insert into deployment (
            user_id, portfolio_id, version, subdomain, seo_indexable,
            contact_visibility, published_at, snapshot, seo
          ) values (
            ${userId}, ${portfolioId}, ${version}, ${input.slug}, ${input.seo.indexable},
            ${input.contactVisibility}, ${at}, ${transaction.json(snapshot as never)}, ${transaction.json(input.seo)}
          ) returning *
        `)[0];
        if (!row) throw new Error("deployment insert failed");
        await transaction`
          update portfolio set current_deployment_id = ${row.id}, status = 'published'
          where id = ${portfolioId} and user_id = ${userId}
        `;
        if (current?.subdomain && current.subdomain !== input.slug) {
          const expiresAt = new Date(at.getTime() + 30 * 24 * 60 * 60 * 1_000);
          await transaction`
            update deployment_slug_redirect set new_slug = ${input.slug}
            where user_id = ${userId} and portfolio_id = ${portfolioId} and expires_at > ${at}
          `;
          await transaction`
            insert into deployment_slug_redirect (user_id, portfolio_id, old_slug, new_slug, created_at, expires_at)
            values (${userId}, ${portfolioId}, ${current.subdomain}, ${input.slug}, ${at}, ${expiresAt})
            as new on duplicate key update new_slug = new.new_slug, created_at = new.created_at, expires_at = new.expires_at
          `;
        }
        return deploymentDto(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new PublishingError(409, "slug is already reserved");
      throw error;
    }
  }

  /**
   * 08b가 읽는 배포 이력.
   *
   * 되돌릴 대상을 고르려면 목록이 있어야 한다. 사본(`snapshot`)은 통째로 무거워서
   * 내보내지 않고, **그 버전이 무엇을 담았는지만** 세어 준다.
   */
  async listDeployments(userId: string, portfolioId: string) {
    const portfolio = (await this.#sql<{ current_deployment_id: string | null }[]>`
      select current_deployment_id from portfolio
      where id = ${portfolioId} and user_id = ${userId}
    `)[0];
    if (!portfolio) throw new PublishingError(404, "portfolio not found");

    const rows = await this.#sql<(DeploymentRow & { seo_indexable: boolean })[]>`
      select * from deployment
      where user_id = ${userId} and portfolio_id = ${portfolioId}
      order by version desc limit 50
    `;
    return rows.map((row) => {
      const sections = (row.snapshot as { sections?: { blocks?: unknown[] }[] }).sections ?? [];
      return DeploymentSummarySchema.parse({
        id: row.id,
        version: row.version,
        slug: row.subdomain,
        publishedAt: iso(row.published_at),
        isCurrent: portfolio.current_deployment_id === row.id,
        seoIndexable: row.seo_indexable,
        contactVisibility: row.contact_visibility,
        sectionCount: sections.length,
        blockCount: sections.reduce((sum, section) => sum + (section.blocks?.length ?? 0), 0),
      });
    });
  }

  async getPublic(slug: string, at = new Date()) {
    const direct = (await this.#sql<DeploymentRow[]>`
      select deployment.* from deployment
      join portfolio on portfolio.current_deployment_id = deployment.id
      where deployment.subdomain = ${slug} and portfolio.status = 'published'
    `)[0];
    if (direct) return PublicPortfolioSchema.parse({ kind: "portfolio", deployment: deploymentDto(direct) });
    const redirect = (await this.#sql<{ old_slug: string; new_slug: string; expires_at: Date | string }[]>`
      select redirect.old_slug, redirect.new_slug, redirect.expires_at
      from deployment_slug_redirect as redirect
      join portfolio on portfolio.id = redirect.portfolio_id and portfolio.user_id = redirect.user_id
      join deployment on deployment.id = portfolio.current_deployment_id
        and deployment.subdomain = redirect.new_slug
      where redirect.old_slug = ${slug} and redirect.expires_at > ${at}
        and portfolio.status = 'published'
    `)[0];
    if (redirect) return PublicPortfolioSchema.parse({
      kind: "redirect", from: redirect.old_slug, to: redirect.new_slug, expiresAt: iso(redirect.expires_at),
    });
    throw new PublishingError(404, "published portfolio not found");
  }

  async unpublish(userId: string, portfolioId: string) {
    const rows = await this.#sql<{ id: string }[]>`
      update portfolio set status = 'unlisted'
      where id = ${portfolioId} and user_id = ${userId} and current_deployment_id is not null
      returning id
    `;
    if (!rows[0]) throw new PublishingError(404, "published portfolio not found");
    return { portfolioId, status: "unlisted" as const };
  }

  async rollback(userId: string, portfolioId: string, deploymentId: string) {
    const row = await this.#sql.begin(async (transaction) => {
      const target = (await transaction<DeploymentRow[]>`
        select * from deployment where id = ${deploymentId} and portfolio_id = ${portfolioId} and user_id = ${userId}
      `)[0];
      if (!target) throw new PublishingError(404, "deployment not found");
      await transaction`
        update portfolio set current_deployment_id = ${deploymentId}, status = 'published'
        where id = ${portfolioId} and user_id = ${userId}
      `;
      return target;
    });
    return deploymentDto(row);
  }

  async submitExport(userId: string, portfolioId: string, key: string, input: SubmitExport) {
    const decision = await new EntitlementService(this.#sql).check(userId, "export.document");
    if (!decision.allowed) throw new PublishingError(403, "document export entitlement required");
    const hash = digest(input);
    const row = await this.#sql.begin(async (transaction) => {
      const portfolio = (await transaction<{ current_deployment_id: string | null }[]>`
        select current_deployment_id from portfolio where id = ${portfolioId} and user_id = ${userId}
      `)[0];
      if (!portfolio) throw new PublishingError(404, "portfolio not found");
      await transaction`
        insert ignore into export_job (user_id, portfolio_id, deployment_id, kind, page_format, idempotency_key, request_hash)
        values (${userId}, ${portfolioId}, ${portfolio.current_deployment_id}, ${input.kind}, ${input.pageFormat}, ${key}, ${hash})
      `;
      const inserted = (await transaction<ExportJobRow[]>`
        select * from export_job where user_id = ${userId} and idempotency_key = ${key}
      `)[0];
      if (!inserted) throw new Error("export job missing");
      if (inserted.request_hash !== hash) throw new PublishingError(409, "idempotency key reused for another export");
      await addOutboxEvent(transaction, {
        topic: "portfolio.export",
        payload: { exportJobId: inserted.id, userId },
        idempotencyKey: `portfolio-export:${inserted.id}`,
      });
      return inserted;
    });
    return this.#exportJobDto(row);
  }

  async getExport(userId: string, id: string) {
    const row = (await this.#sql<ExportJobRow[]>`select * from export_job where id = ${id} and user_id = ${userId}`)[0];
    if (!row) throw new PublishingError(404, "export job not found");
    return this.#exportJobDto(row);
  }

  #exportJobDto(row: ExportJobRow) {
    return {
      id: row.id, portfolioId: row.portfolio_id, kind: row.kind, pageFormat: row.page_format,
      status: row.status, attempts: row.attempts, assetId: row.asset_id, errorCode: row.error_code,
    };
  }

  async processExport(id: string) {
    await this.#sql.begin(async (transaction) => {
      const job = (await transaction<ExportJobRow[]>`select * from export_job where id = ${id} for update`)[0];
      if (!job) throw new PublishingError(404, "export job not found");
      if (job.status === "done") return;
      await transaction`update export_job set status = 'running', attempts = attempts + 1, updated_at = now(6) where id = ${id}`;
      const asset = (await transaction<{ id: string }[]>`
        insert into export_asset (user_id, portfolio_id, kind, file_url, page_format)
        values (${job.user_id}, ${job.portfolio_id}, ${job.kind}, ${`exports/${job.user_id}/${id}.${job.kind}`}, ${job.page_format})
        returning id
      `)[0];
      if (!asset) throw new Error("export asset missing");
      await transaction`update export_job set status = 'done', asset_id = ${asset.id}, error_code = null, updated_at = now(6) where id = ${id}`;
    });
    const row = (await this.#sql<ExportJobRow[]>`select * from export_job where id = ${id}`)[0];
    if (!row) throw new Error("export job missing");
    return this.#exportJobDto(row);
  }

  async replaceResume(userId: string, portfolioId: string, fileUrl: string) {
    const decision = await new EntitlementService(this.#sql).check(userId, "export.document");
    if (!decision.allowed) throw new PublishingError(403, "resume asset entitlement required");
    return this.#sql.begin(async (transaction) => {
      const portfolio = (await transaction<{ id: string }[]>`
        select id from portfolio where id = ${portfolioId} and user_id = ${userId} for update
      `)[0];
      if (!portfolio) throw new PublishingError(404, "portfolio not found");
      const previous = (await transaction<{ version: number }[]>`
        select version from export_asset where user_id = ${userId} and portfolio_id = ${portfolioId}
          and kind = 'resume_file' and revoked_at is null for update
      `)[0];
      await transaction`
        update export_asset set revoked_at = now(6)
        where user_id = ${userId} and portfolio_id = ${portfolioId} and kind = 'resume_file' and revoked_at is null
      `;
      const asset = (await transaction<AssetRow[]>`
        insert into export_asset (user_id, portfolio_id, kind, file_url, version)
        values (${userId}, ${portfolioId}, 'resume_file', ${fileUrl}, ${Number(previous?.version ?? 0) + 1})
        returning *
      `)[0];
      if (!asset) throw new Error("resume asset missing");
      return { id: asset.id, portfolioId, kind: asset.kind, version: asset.version };
    });
  }

  #signature(asset: AssetRow, expiresEpoch: number): string {
    return createHmac("sha256", this.#signingSecret)
      .update(`${asset.id}:${asset.version}:${asset.access_nonce}:${expiresEpoch}`)
      .digest("hex");
  }

  async signAsset(userId: string, assetId: string, ttlSeconds = 300, at = new Date()) {
    const decision = await new EntitlementService(this.#sql).check(userId, "export.document");
    if (!decision.allowed) throw new PublishingError(403, "asset entitlement required");
    const asset = (await this.#sql<AssetRow[]>`
      select * from export_asset where id = ${assetId} and user_id = ${userId} and revoked_at is null
    `)[0];
    if (!asset) throw new PublishingError(404, "asset not found");
    const expiresEpoch = Math.floor(at.getTime() / 1_000) + ttlSeconds;
    const signature = this.#signature(asset, expiresEpoch);
    return SignedAssetSchema.parse({
      assetId,
      url: `/v1/public/assets/${assetId}?version=${asset.version}&expires=${expiresEpoch}&signature=${signature}`,
      expiresAt: new Date(expiresEpoch * 1_000).toISOString(),
    });
  }

  async resolveAsset(assetId: string, version: number, expiresEpoch: number, signature: string, at = new Date()) {
    if (expiresEpoch <= Math.floor(at.getTime() / 1_000)) throw new PublishingError(403, "asset link expired");
    const asset = (await this.#sql<AssetRow[]>`select * from export_asset where id = ${assetId} and revoked_at is null`)[0];
    if (!asset || asset.version !== version) throw new PublishingError(404, "asset not found");
    const expected = this.#signature(asset, expiresEpoch);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new PublishingError(403, "invalid asset signature");
    }
    await this.#sql`update export_asset set download_count = download_count + 1 where id = ${assetId}`;
    return { assetId: asset.id, kind: asset.kind, fileUrl: asset.file_url };
  }
}
