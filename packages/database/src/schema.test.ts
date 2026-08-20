import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadMigrations } from "./migrations.js";

interface IdRow {
  id: string;
}

interface SeededGraph {
  userId: string;
  recordId: string;
  brewId: string;
  recipeId: string;
  recipeSectionId: string;
  portfolioId: string;
  portfolioSectionId: string;
}

const ownerScopedTables = [
  "identity_session",
  "identity_oauth_account",
  "usage_counter",
  "notification",
  "notification_preference",
  "account_deletion_request",
  "category",
  "consent",
  "category_view",
  "company_research_item",
  "record",
  "record_link",
  "recent_search",
  "record_usage",
  "career_profile",
  "skill",
  "skill_evidence",
  "saved_search",
  "match_score",
  "media_asset",
  "media_variant",
  "generated_page",
  "interest",
  "job_analysis",
      "job_analysis_history",
      "answer_record_change",
      "recipe_evidence_path",
      "recipe_unused_source",
      "recipe_revision",
      "generation_usage_ledger",
      "generation_sentence_evidence",
      "portfolio_snapshot",
      "portfolio_edit_proposal",
  "requirement_coverage",
  "brew",
  "brew_source",
  "brew_job",
  "interview_session",
  "question",
  "answer",
  "recipe",
  "recipe_section",
  "recipe_item",
  "generation_job",
  "portfolio",
  "portfolio_section",
  "layout_spec",
  "block",
  "revision",
  "deployment",
  "deployment_slug_redirect",
  "analytics_event_receipt",
  "export_asset",
  "export_job",
  "visit_event",
  "section_view",
  "conversion_event",
  "metric_daily",
  "dashboard_view",
  "widget",
  "derived_metric",
  "insight",
  "annotation",
] as const;

const productTables = [
  "plan",
  "user",
  "usage_counter",
  "notification",
  "category",
  "consent",
  "record",
  "record_link",
  "record_usage",
  "skill",
  "skill_evidence",
  "company",
  "company_research_item",
  "job_posting",
  "saved_search",
  "match_score",
  "media_asset",
  "media_variant",
  "generated_page",
  "interest",
  "job_analysis",
  "job_posting_requirement",
  "requirement_coverage",
  "brew",
  "brew_source",
  "brew_job",
  "interview_session",
  "question",
  "answer",
  "recipe",
  "recipe_section",
  "recipe_item",
  "template",
  "generation_job",
  "portfolio",
  "portfolio_section",
  "layout_spec",
  "block",
  "revision",
  "deployment",
  "export_asset",
  "visit_event",
  "section_view",
  "conversion_event",
  "metric_daily",
  "dashboard_view",
  "widget",
  "derived_metric",
  "insight",
  "annotation",
] as const;

let database: PGlite;
let planId: string;
let categoryId: string;
let jobPostingId: string;
let templateId: string;

async function oneId(sql: string, parameters: unknown[]): Promise<string> {
  const result = await database.query<IdRow>(sql, parameters);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Expected an inserted id");
  return id;
}

async function seedGraph(): Promise<SeededGraph> {
  const userId = await oneId(
    `insert into "user" (email, display_name, plan_id)
     values ($1, 'Test User', $2)
     returning id`,
    [`${randomUUID()}@example.com`, planId],
  );
  const recordId = await oneId(
    `insert into record (user_id, category_id, title, origin)
     values ($1, $2, 'Career record', 'manual')
     returning id`,
    [userId, categoryId],
  );
  const jobAnalysisId = await oneId(
    `insert into job_analysis (user_id, job_posting_id, input_type)
     values ($1, $2, 'url')
     returning id`,
    [userId, jobPostingId],
  );
  const brewId = await oneId(
    `insert into brew (user_id, job_analysis_id, length_preset)
     values ($1, $2, 'single')
     returning id`,
    [userId, jobAnalysisId],
  );
  const recipeId = await oneId(
    `insert into recipe (user_id, brew_id, version, completeness)
     values ($1, $2, 1, 0)
     returning id`,
    [userId, brewId],
  );
  const recipeSectionId = await oneId(
    `insert into recipe_section
       (user_id, recipe_id, order_no, title, purpose, target_length)
     values ($1, $2, 0, 'Intro', 'Introduce the candidate', 400)
     returning id`,
    [userId, recipeId],
  );
  const portfolioId = await oneId(
    `insert into portfolio (user_id, brew_id, template_id, title)
     values ($1, $2, $3, 'Portfolio')
     returning id`,
    [userId, brewId, templateId],
  );
  const portfolioSectionId = await oneId(
    `insert into portfolio_section
       (user_id, portfolio_id, recipe_section_id, order_no)
     values ($1, $2, $3, 0)
     returning id`,
    [userId, portfolioId, recipeSectionId],
  );

  return {
    userId,
    recordId,
    brewId,
    recipeId,
    recipeSectionId,
    portfolioId,
    portfolioSectionId,
  };
}

beforeAll(async () => {
  database = new PGlite({ extensions: { citext } });

  for (const migration of await loadMigrations()) {
    await database.exec(migration.sql);
  }

  planId = await oneId(
    `insert into plan (code, generation_quota)
     values ('free', 3)
     on conflict (code) do update
       set generation_quota = plan.generation_quota
     returning id`,
    [],
  );
  categoryId = await oneId(
    `select id from category
     where key = 'experience' and is_system = true`,
    [],
  );
  const companyId = await oneId(
    `insert into company (name, domain)
     values ('Example', 'example.com')
     returning id`,
    [],
  );
  jobPostingId = await oneId(
    `insert into job_posting
       (company_id, source, external_id, title, description_raw, dedupe_hash)
     values ($1, 'api', 'job-1', 'Engineer', 'Original source', 'hash-1')
     returning id`,
    [companyId],
  );
  templateId = await oneId(
    `insert into template (code, name, plan_required)
     values ('classic', 'Classic', 'free')
     returning id`,
    [],
  );
});

afterAll(async () => {
  await database.close();
});

describe("initial Expresso schema", () => {
  it("creates the 43 documented product tables", async () => {
    const result = await database.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `);

    const allTables = result.rows.map(({ table_name }) => table_name);
    const actualProductTables = allTables.filter((tableName) =>
      productTables.some((productTable) => productTable === tableName),
    );

    expect(actualProductTables).toEqual([...productTables].sort());
    expect(allTables).toContain("platform_outbox");
    expect(allTables).toContain("identity_session");
  });

  it("puts user_id directly on every owner-scoped table", async () => {
    const result = await database.query<{ table_name: string }>(`
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'
      order by table_name
    `);

    expect(result.rows.map(({ table_name }) => table_name)).toEqual(
      [...ownerScopedTables].sort(),
    );
  });

  it("treats email addresses case-insensitively", async () => {
    const email = `${randomUUID()}@example.com`;
    await database.query(
      `insert into "user" (email, display_name, plan_id) values ($1, 'First', $2)`,
      [email, planId],
    );

    await expect(
      database.query(
        `insert into "user" (email, display_name, plan_id) values ($1, 'Second', $2)`,
        [email.toUpperCase(), planId],
      ),
    ).rejects.toThrow();
  });

  it("rejects recipe items without evidence", async () => {
    const graph = await seedGraph();

    await expect(
      database.query(
        `insert into recipe_item
           (user_id, recipe_section_id, order_no, point_text, evidence, edited_by)
         values ($1, $2, 0, 'Unsupported claim', '[]'::jsonb, 'ai')`,
        [graph.userId, graph.recipeSectionId],
      ),
    ).rejects.toThrow();

    await expect(
      database.query(
        `insert into recipe_item
           (user_id, recipe_section_id, order_no, point_text, evidence, edited_by)
         values ($1, $2, 0, 'Supported claim', $3::jsonb, 'ai')`,
        [
          graph.userId,
          graph.recipeSectionId,
          JSON.stringify([{ record_id: graph.recordId, quote: "Evidence" }]),
        ],
      ),
    ).resolves.toBeDefined();
  });

  it("rejects cross-owner references", async () => {
    const first = await seedGraph();
    const second = await seedGraph();

    await expect(
      database.query(
        `insert into record_link
           (user_id, from_record_id, to_record_id, relation, created_by)
         values ($1, $2, $3, 'related', 'user')`,
        [first.userId, first.recordId, second.recordId],
      ),
    ).rejects.toThrow();
  });

  it("keeps job posting source text immutable", async () => {
    await expect(
      database.query(
        `update job_posting set description_raw = 'Changed' where id = $1`,
        [jobPostingId],
      ),
    ).rejects.toThrow(/immutable/);
  });

  it("detaches blocks when an unquoted source record is deleted", async () => {
    const graph = await seedGraph();
    const blockId = await oneId(
      `insert into block
         (user_id, portfolio_section_id, kind, content, source_record_id)
       values ($1, $2, 'paragraph', '{"text":"Example"}'::jsonb, $3)
       returning id`,
      [graph.userId, graph.portfolioSectionId, graph.recordId],
    );

    await database.query(`delete from record where id = $1`, [graph.recordId]);
    const result = await database.query<{
      source_record_id: string | null;
      sync_state: string;
    }>(`select source_record_id, sync_state from block where id = $1`, [blockId]);

    expect(result.rows[0]).toEqual({
      source_record_id: null,
      sync_state: "detached",
    });
  });

  it("restricts deletion while a record quotation remains", async () => {
    const graph = await seedGraph();
    const blockId = await oneId(
      `insert into block
         (user_id, portfolio_section_id, kind, content, source_record_id)
       values ($1, $2, 'paragraph', '{"text":"Quoted"}'::jsonb, $3)
       returning id`,
      [graph.userId, graph.portfolioSectionId, graph.recordId],
    );
    await database.query(
      `insert into record_usage (user_id, record_id, block_id, quoted_text)
       values ($1, $2, $3, 'Quoted')`,
      [graph.userId, graph.recordId, blockId],
    );

    await expect(
      database.query(`delete from record where id = $1`, [graph.recordId]),
    ).rejects.toThrow();

    const result = await database.query<{ count: number }>(
      `select count(*)::int as count from record where id = $1`,
      [graph.recordId],
    );
    expect(result.rows[0]?.count).toBe(1);
  });

  it("only accepts a current deployment from the same portfolio", async () => {
    const graph = await seedGraph();
    const otherPortfolioId = await oneId(
      `insert into portfolio (user_id, brew_id, template_id, title)
       values ($1, $2, $3, 'Other portfolio')
       returning id`,
      [graph.userId, graph.brewId, templateId],
    );
    const deploymentId = await oneId(
      `insert into deployment
         (user_id, portfolio_id, version, subdomain)
       values ($1, $2, 1, $3)
       returning id`,
      [graph.userId, graph.portfolioId, `portfolio-${randomUUID()}`],
    );

    await expect(
      database.query(
        `update portfolio set current_deployment_id = $1 where id = $2`,
        [deploymentId, otherPortfolioId],
      ),
    ).rejects.toThrow(/same portfolio/);
  });

  it("limits dashboard views to six per portfolio", async () => {
    const graph = await seedGraph();

    for (let index = 0; index < 6; index += 1) {
      await database.query(
        `insert into dashboard_view
           (user_id, portfolio_id, name, period)
         values ($1, $2, $3, '30d')`,
        [graph.userId, graph.portfolioId, `View ${index}`],
      );
    }

    await expect(
      database.query(
        `insert into dashboard_view
           (user_id, portfolio_id, name, period)
         values ($1, $2, 'View 7', '30d')`,
        [graph.userId, graph.portfolioId],
      ),
    ).rejects.toThrow(/at most 6/);
  });
});
