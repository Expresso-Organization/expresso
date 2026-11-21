#!/usr/bin/env node
// 한국어 공고 평가 세트의 공고 원천. 서비스 DB의 공고를 내보내고 서비스 요건 추출기로 요건을 붙인다.
//
//   MONGODB_URL=... node ko_postings.mjs export --out jobs.jsonl [--database expresso]
//     본문이 한국어 위주인 공고만 쓴다. 한국어 위주 = 본문의 한글 글자 수가 라틴 글자 수보다 많다.
//   AI_PROVIDER=claude-code node ko_postings.mjs requirements --in jobs.jsonl --out jobs-req.jsonl --cache dir [--concurrency 2]
//     서비스와 같은 AiRequirementExtractor(백엔드 dist)로 descriptionRaw를 분해한다. 결과의 normalized가
//     서비스가 job_postings.requirements에 저장하고 일치도 계산(calculateExplainableMatch)이 읽는 값이다.
//     공고마다 캐시 파일을 남겨 다시 실행하면 이어서 돈다. 먼저 `pnpm --filter "@expresso/backend..." build`.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const backend = new URL("../../services/backend/", import.meta.url);

export function isKoreanMajor(text) {
  const value = String(text ?? "");
  const hangul = (value.match(/[가-힣]/gu) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  return hangul > latin;
}

export function toRow(doc) {
  return {
    jobId: String(doc._id),
    title: String(doc.title ?? ""),
    sourceBoard: doc.sourceBoard ?? null,
    jobFamily: doc.jobFamily ?? null,
    descriptionRaw: String(doc.descriptionRaw ?? ""),
  };
}

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  renameSync(temporary, path);
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function exportPostings(args) {
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error("MONGODB_URL이 비어 있다");
  const out = option(args, "--out");
  const { MongoClient } = createRequire(new URL("package.json", backend))("mongodb");
  const client = new MongoClient(url);
  await client.connect();
  try {
    const docs = await client.db(option(args, "--database", "expresso")).collection("job_postings")
      .find({}, { projection: { title: 1, sourceBoard: 1, jobFamily: 1, descriptionRaw: 1 } })
      .sort({ _id: 1 })
      .toArray();
    const rows = docs.filter((doc) => isKoreanMajor(doc.descriptionRaw)).map(toRow);
    writeJsonl(out, rows);
    const families = {};
    for (const row of rows) families[row.jobFamily] = (families[row.jobFamily] ?? 0) + 1;
    const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
    return { total: docs.length, korean: rows.length, families, out, sha256 };
  } finally {
    await client.close();
  }
}

async function extractRequirements(args) {
  const rows = readJsonl(option(args, "--in"));
  const out = option(args, "--out");
  const cache = option(args, "--cache");
  const concurrency = Number(option(args, "--concurrency", "2"));
  const dist = new URL("dist/", backend);
  const { loadRuntimeConfig } = await import(new URL("config/runtime-config.js", dist));
  const { createAiClient } = await import(new URL("platform/ai/create-client.js", dist));
  const { AiRequirementExtractor, JOB_ANALYSIS_PROMPT_VERSION } = await import(new URL("modules/job-analysis/ai-extractor.js", dist));
  const ai = createAiClient(loadRuntimeConfig(process.env));
  if (!ai) throw new Error("AI_PROVIDER가 off다. AI_PROVIDER=claude-code로 돌린다");
  const extractor = new AiRequirementExtractor(ai);
  mkdirSync(cache, { recursive: true });
  let next = 0;
  let extracted = 0;
  let failed = 0;
  const results = new Array(rows.length);
  async function worker() {
    while (next < rows.length) {
      const index = next++;
      const row = rows[index];
      const path = join(cache, `${row.jobId}.json`);
      if (existsSync(path)) {
        results[index] = JSON.parse(readFileSync(path, "utf8"));
        continue;
      }
      try {
        // 서비스와 같이 사용자 없이(공고 공용) 분해한다.
        const extraction = await extractor.extract(row.descriptionRaw, null);
        results[index] = { requirements: extraction.normalized, labels: extraction.requirements.map((item) => item.label), promptVersion: JOB_ANALYSIS_PROMPT_VERSION };
        writeFileSync(`${path}.tmp`, JSON.stringify(results[index]));
        renameSync(`${path}.tmp`, path);
        extracted += 1;
      } catch (error) {
        // 실패는 캐시하지 않는다. 다시 실행하면 그 공고만 다시 부른다.
        results[index] = { requirements: null, error: String(error?.message ?? error).slice(0, 300) };
        failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  // requirementLabels는 서비스가 재료 순위(rankMaterials)에 넘기는 요건 문구다(materials/service.ts).
  writeJsonl(out, rows.map((row, index) => ({ ...row, requirements: results[index].requirements, requirementLabels: results[index].labels ?? null, requirementError: results[index].error ?? null })));
  return { rows: rows.length, extracted, cached: rows.length - extracted - failed, failed, out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  const commands = { export: exportPostings, requirements: extractRequirements };
  if (!commands[command]) {
    console.error("usage: node ko_postings.mjs <export|requirements> ...");
    process.exit(2);
  }
  console.log(JSON.stringify(await commands[command](args), null, 2));
}
