/**
 * 본문 읽기 모델을 나란히 돌려 본다.
 *
 * **같은 공고를 두 모델에 순서대로 먹인다.** 속도를 재려면 겹쳐 돌리면 안 되고,
 * 산출물을 비교하려면 입력이 같아야 한다.
 *
 * DB에는 아무것도 쓰지 않는다 — 고르려고 돌려 보는 것이지 채우려는 것이 아니다.
 *
 *   DATABASE_URL=… CODEX_CLI_PATH=… node --import tsx scripts/compare-facts-models.ts [건수]
 */
import postgres from "postgres";
import type { z } from "zod";

import { AiFactsReader } from "../src/modules/jobs/ingest/facts.js";
import type { AiCallSpec, AiClient, AiResult, AiUsage } from "../src/platform/ai/client.js";
import { CodexAiClient } from "../src/platform/ai/codex.js";

const MODELS = ["gpt-5.6-terra", "gpt-5.6-luna"] as const;
const COUNT = Number(process.argv[2] ?? 10);

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");

/** 어댑터를 그대로 두고 사용량만 받아 적는다. 프롬프트는 진짜 코드가 만든다. */
class Metered implements AiClient {
  readonly usages: AiUsage[] = [];
  constructor(private readonly inner: AiClient) {}
  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>): Promise<AiResult<T>> {
    // 스키마를 반드시 함께 넘긴다. 빠뜨리면 어댑터가 도구 스키마를 못 만든다.
    const result = await this.inner.complete<T>(spec, schema);
    this.usages.push(result.usage);
    return result;
  }
}

interface Attempt {
  postingId: string;
  title: string;
  ok: boolean;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  salary: string | null;
  experience: string | null;
  workType: string | null;
  error?: string;
}

const sql = postgres(databaseUrl, { max: 2 });

const postings = await sql<{ id: string; title: string; description_raw: string }[]>`
  select id, title, description_raw
  from job_posting
  where facts_read_at is null
  order by created_at, id
  limit ${COUNT}
`;
if (postings.length === 0) throw new Error("아직 안 읽은 공고가 없다");
console.info(`대상 ${postings.length}건\n`);

const results = new Map<string, Attempt[]>();

for (const model of MODELS) {
  const metered = new Metered(
    new CodexAiClient({
      ...(process.env["CODEX_CLI_PATH"] ? { cliPath: process.env["CODEX_CLI_PATH"] } : {}),
      timeoutMs: Number(process.env["AI_TIMEOUT_MS"] ?? 600_000),
      models: { job_facts: model },
    }),
  );
  const reader = new AiFactsReader(metered);
  const attempts: Attempt[] = [];

  for (const [index, posting] of postings.entries()) {
    const started = Date.now();
    const before = metered.usages.length;
    try {
      const facts = await reader.read(posting.description_raw);
      const usage = metered.usages[before];
      attempts.push({
        postingId: posting.id,
        title: posting.title,
        ok: true,
        ms: Date.now() - started,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        salary: facts.salaryNote,
        experience: facts.experienceNote,
        workType: facts.workType,
      });
    } catch (error) {
      attempts.push({
        postingId: posting.id,
        title: posting.title,
        ok: false,
        ms: Date.now() - started,
        inputTokens: 0,
        outputTokens: 0,
        salary: null,
        experience: null,
        workType: null,
        error: error instanceof Error
          ? `${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(1, 4).join("\n")}`
          : "unknown",
      });
    }
    process.stderr.write(`  ${model} ${index + 1}/${postings.length}\r`);
  }
  results.set(model, attempts);
  process.stderr.write(`  ${model} 완료${" ".repeat(20)}\n`);
}

console.info(JSON.stringify(Object.fromEntries(results), null, 1));
await sql.end({ timeout: 5 });
