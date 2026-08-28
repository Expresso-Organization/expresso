import { CompanyResearchError } from "./public.js";
export { CompanyResearchError } from "./public.js";
import {
  CompanyResearchItemSchema,
  type CompanyResearchItem,
  type ReplaceCompanyResearch,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

interface ResearchRow {
  id: string;
  company_id: string;
  kind: "fact" | "signal";
  topic: string;
  statement: string;
  source_url: string | null;
  published_at: Date | null;
  captured_at: Date;
  confidence: "low" | "medium" | "high";
  basis_fact_ids: string[];
}

function toResearchItem(row: ResearchRow): CompanyResearchItem {
  return CompanyResearchItemSchema.parse({
    id: row.id,
    companyId: row.company_id,
    kind: row.kind,
    topic: row.topic,
    statement: row.statement,
    sourceUrl: row.source_url,
    publishedAt: row.published_at?.toISOString() ?? null,
    capturedAt: row.captured_at.toISOString(),
    confidence: row.confidence,
    basisFactIds: row.basis_fact_ids,
  });
}

/** 검색기는 바뀔 수 있지만 정제된 사실이 들어오는 문은 하나다. */
export class CompanyResearchService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  async list(userId: string, brewId: string): Promise<CompanyResearchItem[]> {
    const companyId = await this.#companyId(this.#sql, userId, brewId);
    const rows = await this.#sql<ResearchRow[]>`
      select * from company_research_item
      where user_id = ${userId} and company_id = ${companyId}
      order by kind, captured_at desc, id
    `;
    return rows.map(toResearchItem);
  }

  async replace(
    userId: string,
    brewId: string,
    input: ReplaceCompanyResearch,
  ): Promise<CompanyResearchItem[]> {
    for (const [index, item] of input.items.entries()) {
      if (item.kind === "fact" && !item.sourceUrl) {
        throw new CompanyResearchError(422, `fact ${index + 1} requires sourceUrl`);
      }
      if (item.kind === "fact" && item.basisFactIndexes.length > 0) {
        throw new CompanyResearchError(422, `fact ${index + 1} cannot reference basis facts`);
      }
      if (item.kind === "signal" && item.basisFactIndexes.length === 0) {
        throw new CompanyResearchError(422, `signal ${index + 1} requires basis facts`);
      }
      for (const factIndex of item.basisFactIndexes) {
        if (input.items[factIndex]?.kind !== "fact") {
          throw new CompanyResearchError(422, `signal ${index + 1} references a non-fact item`);
        }
      }
    }

    const companyId = await this.#companyId(this.#sql, userId, brewId);
    await this.#sql.begin(async (transaction) => {
      await transaction`
        delete from company_research_item where user_id = ${userId} and company_id = ${companyId}
      `;

      const factIds = new Map<number, string>();
      for (const [index, item] of input.items.entries()) {
        if (item.kind !== "fact") continue;
        const row = (await transaction<{ id: string }[]>`
          insert into company_research_item (
            user_id, company_id, kind, topic, statement, source_url,
            published_at, confidence, basis_fact_ids
          ) values (
            ${userId}, ${companyId}, 'fact', ${item.topic}, ${item.statement},
            ${item.sourceUrl}, ${item.publishedAt ? new Date(item.publishedAt) : null},
            ${item.confidence}, '[]'
          ) returning id
        `)[0];
        if (!row) throw new Error("company fact was not persisted");
        factIds.set(index, row.id);
      }

      for (const item of input.items) {
        if (item.kind !== "signal") continue;
        const basis = item.basisFactIndexes.flatMap((index) => {
          const id = factIds.get(index);
          return id ? [id] : [];
        });
        await transaction`
          insert into company_research_item (
            user_id, company_id, kind, topic, statement, source_url,
            published_at, confidence, basis_fact_ids
          ) values (
            ${userId}, ${companyId}, 'signal', ${item.topic}, ${item.statement},
            ${item.sourceUrl}, ${item.publishedAt ? new Date(item.publishedAt) : null},
            ${item.confidence}, ${basis}
          )
        `;
      }
    });

    return this.list(userId, brewId);
  }

  async #companyId(sql: SqlTag, userId: string, brewId: string): Promise<string> {
    const row = (await sql<{ company_id: string }[]>`
      select job_posting.company_id
      from brew
      join job_analysis on job_analysis.id = brew.job_analysis_id
        and job_analysis.user_id = brew.user_id
      join job_posting on job_posting.id = job_analysis.job_posting_id
      where brew.user_id = ${userId} and brew.id = ${brewId}
    `)[0];
    if (!row) throw new CompanyResearchError(404, "brew not found");
    return row.company_id;
  }
}
