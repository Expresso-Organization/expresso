import { randomUUID } from "node:crypto";

import { createConnection, type Connection } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "./migrate.js";
import { MongoClient, Decimal128 } from "mongodb";
import { migrateMongo } from "./mongo-migrate.js";
import { mongoCollections } from "./collections.js";

/**
 * 스키마가 지키는 것을 실제 MySQL 에 올려 확인한다.
 *
 * PostgreSQL 을 쓸 때는 PGlite 로 프로세스 안에서 돌렸지만, MySQL 에는 그런
 * 구현이 없다. `TEST_DATABASE_URL` 이 없으면 건너뛴다.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

const mongoUrl = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
describe.skipIf(!mongoUrl)("MongoDB schema", () => {
  const databaseName = `expresso_test_schema_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(mongoUrl ?? "mongodb://127.0.0.1", { serverSelectionTimeoutMS: 3_000 });
  const mongo = client.db(databaseName);
  const collections = mongoCollections(mongo);
  beforeAll(async () => {
    await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
  }, 60_000);
  afterAll(async () => { try { await mongo.dropDatabase(); } finally { await client.close(); } });

  it("creates every product collection and preserves the seeded IDs and all 30 additional designs", async () => {
    expect(await mongo.listCollections({}, { nameOnly: true }).toArray()).toHaveLength(77);
    expect(await collections.plans.countDocuments()).toBe(3);
    expect((await collections.plans.findOne({ code: "free" }))?._id).toBe("aa09f35f-bde6-4e18-b9cd-7b32759bf43b");
    expect(await collections.careerCategories.countDocuments({ isSystem: true })).toBe(7);
    expect(await collections.scheduledJobDefinitions.countDocuments()).toBe(8);
    expect(await collections.templates.countDocuments()).toBe(33);
    for (let i = 1; i <= 30; i++) {
      expect(await collections.templates.findOne({ _id: `d3510000-0000-4000-8000-${String(i).padStart(12, "0")}` })).not.toBeNull();
    }
  });

  it("reruns without replacing existing seed changes", async () => {
    await collections.plans.updateOne({ code: "free" }, { $set: { generationQuota: 17 } });
    const result = await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
    expect(result.applied).toEqual([]);
    expect(result.existing).toEqual(["0001_initial_collections", "0002_generation_ledger_amount_constraint", "0003_analytics_rate_and_notification_preferences", "0004_job_import_metadata"]);
    expect((await collections.plans.findOne({ code: "free" }))?.generationQuota).toBe(17);
  });

  it("enforces required fields, enums and accent/case insensitive email uniqueness", async () => {
    const user = { _id: randomUUID(), email: "Café@example.com", displayName: "Tester", planId: "aa09f35f-bde6-4e18-b9cd-7b32759bf43b", createdAt: new Date() };
    await collections.users.insertOne(user);
    await expect(collections.users.insertOne({ ...user, _id: randomUUID(), email: "CAFE@example.com" })).rejects.toMatchObject({ code: 11000 });
    await expect(mongo.collection("plans").insertOne({ _id: randomUUID() as never, code: "invalid", generationQuota: 0, features: {}, isPublicListed: true })).rejects.toMatchObject({ code: 121 });
    await expect(mongo.collection("users").insertOne({ _id: randomUUID() as never })).rejects.toMatchObject({ code: 121 });
  });

  it("keeps generation usage ledger amounts as signed integers", async () => {
    const base = { userId: randomUUID(), generationJobId: randomUUID(), reason: "success", createdAt: new Date() };
    await collections.generationUsageLedger.insertOne({ _id: randomUUID(), ...base, amount: 1 });
    await collections.generationUsageLedger.insertOne({ _id: randomUUID(), ...base, generationJobId: randomUUID(), amount: -1 });
    await expect(mongo.collection("generation_usage_ledger").insertOne({ _id: randomUUID() as never, ...base, generationJobId: randomUUID(), amount: 2 })).rejects.toMatchObject({ code: 121 });
    await expect(mongo.collection("generation_usage_ledger").insertOne({ _id: randomUUID() as never, ...base, generationJobId: randomUUID(), amount: "1" })).rejects.toMatchObject({ code: 121 });
  });

  it("distinguishes missing, null and empty values in nullable composite uniqueness", async () => {
    const posting = { companyId: randomUUID(), source: "api" as const, title: "Role", descriptionRaw: "Details", requirements: {}, createdAt: new Date(), duties: [], preferred: [], hiringProcess: [] };
    const insert = (externalId?: string | null) => collections.jobPostings.insertOne({ ...posting, _id: randomUUID(), dedupeHash: randomUUID(), ...(externalId !== undefined ? { externalId } : {}) });
    await insert(); await insert(); await insert(null); await insert(null);
    await insert("");
    await expect(insert("")).rejects.toMatchObject({ code: 11000 });
    await insert("Case"); await insert("case");
  });

  it("enforces system category uniqueness independently of user category keys", async () => {
    const category = await collections.careerCategories.findOne({ key: "experience", isSystem: true });
    expect(category).not.toBeNull();
    await expect(collections.careerCategories.insertOne({ ...category!, _id: randomUUID() })).rejects.toMatchObject({ code: 11000 });
    const userId = randomUUID();
    await collections.careerCategories.insertOne({ ...category!, _id: randomUUID(), isSystem: false, userId });
    await collections.careerCategories.insertOne({ ...category!, _id: randomUUID(), isSystem: false, userId: randomUUID() });
    await expect(collections.careerCategories.insertOne({ ...category!, _id: randomUUID(), isSystem: false, userId })).rejects.toMatchObject({ code: 11000 });
  });

  it("round trips BSON Date and Decimal128 while retaining date-only strings", async () => {
    const metric = { _id: randomUUID(), userId: randomUUID(), deploymentId: randomUUID(), date: "2026-08-29", metricKey: "visit", value: Decimal128.fromString("0.123456"), sampleSize: 1 };
    await collections.metricsDaily.insertOne(metric);
    const loaded = await collections.metricsDaily.findOne({ _id: metric._id });
    expect(loaded?.date).toBe("2026-08-29");
    expect(loaded?.value.toString()).toBe("0.123456");
    const category = await collections.careerCategories.findOne({ key: "experience", isSystem: true });
    expect(category?.updatedAt).toBeInstanceOf(Date);
  });

  it("validates arbitrary record properties and only reserves ranks for selected sources", async () => {
    const record = { _id: randomUUID(), userId: randomUUID(), categoryId: "475106fc-bf88-4a73-9c27-66c648733936", title: "Work", status: "draft" as const, origin: "manual" as const, properties: { organization: "Team", metrics: ["25%"], years: 2 }, bodyMd: "# Work", version: 1, updatedAt: new Date() };
    await collections.careerRecords.insertOne(record);
    await expect(mongo.collection("career_records").updateOne({ _id: record._id as never }, { $set: { properties: [] } })).rejects.toMatchObject({ code: 121 });
    await expect(collections.careerRecords.updateOne({ _id: record._id }, { $set: { version: 0 } })).rejects.toMatchObject({ code: 121 });
    const source = { userId: record.userId, brewId: randomUUID(), rank: 1, selectedBy: "auto" as const, score: 50, reasonText: "Relevant", isSelected: false, excludedReason: "not_selected", updatedAt: new Date() };
    const first = { ...source, _id: randomUUID(), recordId: randomUUID() };
    const second = { ...source, _id: randomUUID(), recordId: randomUUID() };
    await collections.brewSources.insertMany([first, second]);
    await collections.brewSources.updateOne({ _id: first._id }, { $set: { isSelected: true, excludedReason: null } });
    await expect(collections.brewSources.updateOne({ _id: second._id }, { $set: { isSelected: true, excludedReason: null } })).rejects.toMatchObject({ code: 11000 });
    await collections.brewSources.updateOne({ _id: first._id }, { $set: { isSelected: false, excludedReason: "not_selected" } });
    expect(await collections.brewSources.countDocuments({ brewId: source.brewId, isSelected: true })).toBe(0);
  });
});
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ownerScopedTables = [
  "identity_session", "identity_oauth_account", "usage_counter", "notification",
  "notification_preference", "account_deletion_request", "category", "consent",
  "category_view", "company_research_item", "record", "record_link", "recent_search",
  "record_usage", "career_profile", "skill", "skill_evidence", "saved_search",
  "match_score", "media_asset", "media_variant", "generated_page", "interest",
  "job_analysis", "job_analysis_history", "answer_record_change", "recipe_evidence_path",
  "recipe_unused_source", "recipe_revision", "generation_usage_ledger",
  "generation_sentence_evidence", "portfolio_snapshot", "portfolio_edit_proposal",
  "requirement_coverage", "brew", "brew_source", "brew_job", "interview_session",
  "question", "answer", "recipe", "recipe_section", "recipe_item", "generation_job",
  "portfolio", "portfolio_section", "layout_spec", "block", "revision", "deployment",
  "deployment_slug_redirect", "analytics_event_receipt", "export_asset", "export_job",
  "visit_event", "section_view", "conversion_event", "metric_daily", "dashboard_view",
  "widget", "derived_metric", "insight", "annotation",
] as const;

const productTables = [
  "plan", "user", "usage_counter", "notification", "category", "consent", "record",
  "record_link", "record_usage", "skill", "skill_evidence", "company",
  "company_research_item", "job_posting", "saved_search", "match_score", "media_asset",
  "media_variant", "generated_page", "interest", "job_analysis", "job_posting_requirement",
  "requirement_coverage", "brew", "brew_source", "brew_job", "interview_session",
  "question", "answer", "recipe", "recipe_section", "recipe_item", "template",
  "generation_job", "portfolio", "portfolio_section", "layout_spec", "block", "revision",
  "deployment", "export_asset", "visit_event", "section_view", "conversion_event",
  "metric_daily", "dashboard_view", "widget", "derived_metric", "insight", "annotation",
] as const;

let db: Connection;
let planId = "";
let categoryId = "";
let templateId = "";
let jobPostingId = "";

async function rows<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
  const [result] = await db.query(sql, parameters);
  return (Array.isArray(result) ? result : []) as T[];
}

async function one<T>(sql: string, parameters: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(sql, parameters))[0];
}

interface Graph {
  userId: string;
  recordId: string;
  brewId: string;
  recipeSectionId: string;
  portfolioId: string;
  portfolioSectionId: string;
}

/** 한 사람의 기록에서 포트폴리오 섹션까지 한 벌을 만든다. */
async function seedGraph(): Promise<Graph> {
  const userId = randomUUID();
  await db.query(
    "insert into `user` (id, email, display_name, plan_id) values (?, ?, 'Test User', ?)",
    [userId, `${randomUUID()}@example.com`, planId],
  );
  const recordId = randomUUID();
  await db.query(
    "insert into record (id, user_id, category_id, title, origin) values (?, ?, ?, 'Career record', 'manual')",
    [recordId, userId, categoryId],
  );
  const analysisId = randomUUID();
  await db.query(
    "insert into job_analysis (id, user_id, job_posting_id, input_type) values (?, ?, ?, 'url')",
    [analysisId, userId, jobPostingId],
  );
  const brewId = randomUUID();
  await db.query(
    "insert into brew (id, user_id, job_analysis_id, length_preset) values (?, ?, ?, 'single')",
    [brewId, userId, analysisId],
  );
  const recipeId = randomUUID();
  await db.query(
    "insert into recipe (id, user_id, brew_id, version, completeness) values (?, ?, ?, 1, 0)",
    [recipeId, userId, brewId],
  );
  const recipeSectionId = randomUUID();
  await db.query(
    `insert into recipe_section (id, user_id, recipe_id, order_no, title, purpose, target_length)
     values (?, ?, ?, 0, 'Intro', 'Introduce the candidate', 400)`,
    [recipeSectionId, userId, recipeId],
  );
  const portfolioId = randomUUID();
  await db.query(
    "insert into portfolio (id, user_id, brew_id, template_id, title) values (?, ?, ?, ?, 'Portfolio')",
    [portfolioId, userId, brewId, templateId],
  );
  const portfolioSectionId = randomUUID();
  await db.query(
    `insert into portfolio_section (id, user_id, portfolio_id, recipe_section_id, order_no)
     values (?, ?, ?, ?, 0)`,
    [portfolioSectionId, userId, portfolioId, recipeSectionId],
  );
  return { userId, recordId, brewId, recipeSectionId, portfolioId, portfolioSectionId };
}

beforeAll(async () => {
  if (!databaseUrl) return;
  await migrate({ databaseUrl });
  db = await createConnection({ uri: databaseUrl, timezone: "Z", multipleStatements: true });

  planId = (await one<{ id: string }>("select id from plan where code = 'free'"))?.id ?? "";
  categoryId = (await one<{ id: string }>(
    "select id from category where `key` = 'experience' and is_system = 1",
  ))?.id ?? "";
  templateId = randomUUID();
  await db.query(
    "insert into template (id, code, name, plan_required) values (?, ?, 'Classic', 'free')",
    [templateId, `classic-${templateId.slice(0, 8)}`],
  );
  const companyId = randomUUID();
  await db.query(
    "insert into company (id, name, domain, dedupe_key) values (?, 'Example', 'example.com', ?)",
    [companyId, companyId],
  );
  jobPostingId = randomUUID();
  await db.query(
    `insert into job_posting (id, company_id, source, external_id, title, description_raw, dedupe_hash)
     values (?, ?, 'api', ?, 'Engineer', 'Original source', ?)`,
    [jobPostingId, companyId, `job-${jobPostingId.slice(0, 8)}`, jobPostingId],
  );
});

afterAll(async () => {
  if (db) await db.end();
});

describeWithDatabase("Expresso 스키마", () => {
  it("제품 표를 모두 만든다", async () => {
    const found = await rows<{ table_name: string }>(
      `select table_name as table_name from information_schema.tables
       where table_schema = database() and table_type = 'BASE TABLE'
       order by table_name`,
    );
    const names = found.map(({ table_name }) => table_name);
    for (const table of productTables) expect(names).toContain(table);
    expect(names).toContain("platform_outbox");
    expect(names).toContain("identity_session");
  });

  it("사용자 소유 표에는 user_id 가 직접 붙어 있다", async () => {
    const found = await rows<{ table_name: string }>(
      `select table_name as table_name from information_schema.columns
       where table_schema = database() and column_name = 'user_id'
       order by table_name`,
    );
    expect(found.map(({ table_name }) => table_name)).toEqual([...ownerScopedTables].sort());
  });

  it("이메일은 대소문자를 가리지 않는다", async () => {
    const email = `${randomUUID()}@example.com`;
    await db.query("insert into `user` (id, email, display_name, plan_id) values (?, ?, 'First', ?)", [randomUUID(), email, planId]);
    await expect(
      db.query("insert into `user` (id, email, display_name, plan_id) values (?, ?, 'Second', ?)", [randomUUID(), email.toUpperCase(), planId]),
    ).rejects.toThrow();
  });

  it("레시피 항목의 근거는 배열이기만 하면 된다", async () => {
    const graph = await seedGraph();
    // 근거는 사용자가 검토할 메타데이터지 항목을 버릴 이유가 아니다 —
    // 비어 있어도 받는다(0013_recipe_advisory_evidence).
    await expect(
      db.query(
        `insert into recipe_item (id, user_id, recipe_section_id, order_no, point_text, evidence, edited_by)
         values (?, ?, ?, 0, 'Unsupported claim', '[]', 'ai')`,
        [randomUUID(), graph.userId, graph.recipeSectionId],
      ),
    ).resolves.toBeDefined();
    // 모양은 여전히 지킨다 — 배열이 아닌 것은 막는다.
    await expect(
      db.query(
        `insert into recipe_item (id, user_id, recipe_section_id, order_no, point_text, evidence, edited_by)
         values (?, ?, ?, 1, 'Malformed evidence', '{}', 'ai')`,
        [randomUUID(), graph.userId, graph.recipeSectionId],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into recipe_item (id, user_id, recipe_section_id, order_no, point_text, evidence, edited_by)
         values (?, ?, ?, 2, 'Supported claim', ?, 'ai')`,
        [randomUUID(), graph.userId, graph.recipeSectionId,
          JSON.stringify([{ record_id: graph.recordId, quote: "Evidence" }])],
      ),
    ).resolves.toBeDefined();
  });

  it("남의 것을 가리키지 못한다", async () => {
    const first = await seedGraph();
    const second = await seedGraph();
    await expect(
      db.query(
        `insert into record_link (id, user_id, from_record_id, to_record_id, relation, created_by)
         values (?, ?, ?, ?, 'related', 'user')`,
        [randomUUID(), first.userId, first.recordId, second.recordId],
      ),
    ).rejects.toThrow();
  });

  it("공고 원문은 고쳐지지 않는다", async () => {
    await expect(
      db.query("update job_posting set description_raw = 'Changed' where id = ?", [jobPostingId]),
    ).rejects.toThrow(/immutable/);
  });

  it("인용 없는 원본을 지우면 블록이 떨어져 나온다", async () => {
    const graph = await seedGraph();
    const blockId = randomUUID();
    await db.query(
      `insert into block (id, user_id, portfolio_section_id, kind, content, source_record_id)
       values (?, ?, ?, 'paragraph', '{"text":"Example"}', ?)`,
      [blockId, graph.userId, graph.portfolioSectionId, graph.recordId],
    );
    await db.query("delete from record where id = ?", [graph.recordId]);
    const block = await one<{ source_record_id: string | null; sync_state: string }>(
      "select source_record_id, sync_state from block where id = ?", [blockId],
    );
    expect(block).toEqual({ source_record_id: null, sync_state: "detached" });
  });

  it("인용이 남아 있으면 원본을 지우지 못한다", async () => {
    const graph = await seedGraph();
    const blockId = randomUUID();
    await db.query(
      `insert into block (id, user_id, portfolio_section_id, kind, content, source_record_id)
       values (?, ?, ?, 'paragraph', '{"text":"Quoted"}', ?)`,
      [blockId, graph.userId, graph.portfolioSectionId, graph.recordId],
    );
    await db.query(
      "insert into record_usage (id, user_id, record_id, block_id, quoted_text) values (?, ?, ?, ?, 'Quoted')",
      [randomUUID(), graph.userId, graph.recordId, blockId],
    );
    await expect(db.query("delete from record where id = ?", [graph.recordId])).rejects.toThrow();
    const left = await one<{ count: number }>("select count(*) as count from record where id = ?", [graph.recordId]);
    expect(left?.count).toBe(1);
  });

  it("지금 배포는 같은 포트폴리오의 것만 가리킨다", async () => {
    const graph = await seedGraph();
    const otherPortfolioId = randomUUID();
    await db.query(
      "insert into portfolio (id, user_id, brew_id, template_id, title) values (?, ?, ?, ?, 'Other portfolio')",
      [otherPortfolioId, graph.userId, graph.brewId, templateId],
    );
    const deploymentId = randomUUID();
    await db.query(
      "insert into deployment (id, user_id, portfolio_id, version, subdomain) values (?, ?, ?, 1, ?)",
      [deploymentId, graph.userId, graph.portfolioId, `portfolio-${randomUUID().slice(0, 8)}`],
    );
    await expect(
      db.query("update portfolio set current_deployment_id = ? where id = ?", [deploymentId, otherPortfolioId]),
    ).rejects.toThrow(/same portfolio/);
  });

  it("계약이 받는 길이를 열이 담는다", async () => {
    // MySQL 의 text 는 65,535 바이트에서 끊긴다 — 한글이면 21,845자다. 계약이 그보다
    // 긴 값을 통과시키는 자리는 열도 그만큼 넓어야 검증을 지난 값이 거절되지 않는다.
    const narrow = await rows<{ table_name: string; column_name: string }>(
      `select table_name as table_name, column_name as column_name
       from information_schema.columns
       where table_schema = database() and data_type = 'text'
         and (table_name, column_name) in (
           ('record', 'body_md'), ('answer', 'transcript'),
           ('answer_record_change', 'source_quote'), ('job_posting', 'description_raw'),
           ('generated_page', 'html'), ('generated_page', 'css'))`,
    );
    expect(narrow.map(({ table_name, column_name }) => `${table_name}.${column_name}`)).toEqual([]);
  });

  it("트리거 본문은 세미콜론으로 끝나지 않는다", async () => {
    // 세미콜론이 본문에 남으면 mysqldump 가 받은 백업이 그 줄에서 복원을 멈춘다.
    // 문장 하나짜리 본문은 begin · end 로 감싸야 그 일이 없다.
    const leaking = await rows<{ trigger_name: string }>(
      `select trigger_name as trigger_name from information_schema.triggers
       where trigger_schema = database() and action_statement like '%;'`,
    );
    expect(leaking.map(({ trigger_name }) => trigger_name)).toEqual([]);
  });

  it("요건의 근거 구간은 공고 원문 그대로여야 한다", async () => {
    await expect(db.query(
      `insert into job_posting_requirement (id, job_posting_id, order_no, label, kind, source_span)
       values (?, ?, 0, 'tampered', 'must', ?)`,
      [randomUUID(), jobPostingId, JSON.stringify({ start: 0, end: 9, quote: "not-source" })],
    )).rejects.toThrow(/does not match immutable posting source/);
    await db.query(
      `insert into job_posting_requirement (id, job_posting_id, order_no, label, kind, source_span)
       values (?, ?, 1, 'exact', 'must', ?)`,
      [randomUUID(), jobPostingId, JSON.stringify({ start: 0, end: 8, quote: "Original" })],
    );
  });

  it("기록 속성은 분류가 정의한 것만, 정의한 타입으로만 받는다", async () => {
    const graph = await seedGraph();
    const ownCategoryId = randomUUID();
    await db.query(
      `insert into category (id, user_id, \`key\`, name, icon, default_view, is_system, property_schema, sort_order)
       values (?, ?, 'probe', 'Probe', 'star', 'list', 0, ?, 0)`,
      [ownCategoryId, graph.userId, JSON.stringify({
        role: { type: "text" }, tags: { type: "tags" }, years: { type: "number", required: true },
      })],
    );
    const insertRecord = (properties: unknown) => db.query(
      `insert into record (id, user_id, category_id, title, origin, properties)
       values (?, ?, ?, 'Probe record', 'manual', ?)`,
      [randomUUID(), graph.userId, ownCategoryId, JSON.stringify(properties)],
    );
    await expect(insertRecord({ nope: "x", years: 1 })).rejects.toThrow(/not defined by the category/);
    await expect(insertRecord({ role: 5, years: 1 })).rejects.toThrow(/does not match type text/);
    await expect(insertRecord({ tags: ["a", 3], years: 1 })).rejects.toThrow(/does not match type tags/);
    await expect(insertRecord({ role: "a" })).rejects.toThrow(/required property years is missing/);
    await insertRecord({ role: "a", tags: ["x"], years: 3 });
  });

  it("값이 남아 있는 속성 정의는 지우지 못한다", async () => {
    const graph = await seedGraph();
    const ownCategoryId = randomUUID();
    await db.query(
      `insert into category (id, user_id, \`key\`, name, icon, default_view, is_system, property_schema, sort_order)
       values (?, ?, 'probe', 'Probe', 'star', 'list', 0, ?, 0)`,
      [ownCategoryId, graph.userId, JSON.stringify({ role: { type: "text" }, note: { type: "text" } })],
    );
    await db.query(
      `insert into record (id, user_id, category_id, title, origin, properties)
       values (?, ?, ?, 'Probe record', 'manual', ?)`,
      [randomUUID(), graph.userId, ownCategoryId, JSON.stringify({ role: "backend" })],
    );
    await expect(db.query(
      "update category set property_schema = ? where id = ?",
      [JSON.stringify({ note: { type: "text" } }), ownCategoryId],
    )).rejects.toThrow(/property role still has record values/);
    // 값을 넣은 적 없는 정의는 지워진다.
    await db.query(
      "update category set property_schema = ? where id = ?",
      [JSON.stringify({ role: { type: "text" } }), ownCategoryId],
    );
  });

  it("대시보드 뷰는 포트폴리오마다 여섯 개까지", async () => {
    const graph = await seedGraph();
    for (let index = 0; index < 6; index += 1) {
      await db.query(
        "insert into dashboard_view (id, user_id, portfolio_id, name, period) values (?, ?, ?, ?, '30d')",
        [randomUUID(), graph.userId, graph.portfolioId, `View ${index}`],
      );
    }
    await expect(
      db.query(
        "insert into dashboard_view (id, user_id, portfolio_id, name, period) values (?, ?, ?, 'View 7', '30d')",
        [randomUUID(), graph.userId, graph.portfolioId],
      ),
    ).rejects.toThrow(/at most 6/);
  });
});
