#!/usr/bin/env node
// 서비스의 규칙 함수를 그대로 불러 학습 데이터 쌍을 채점한다. 설계서 9.2의 규칙 baseline이다.
// Python으로 옮기지 않는다 — 서비스와 갈라지면 baseline이 서비스 성능을 대표하지 못한다.
//
//   node rule_baselines.mjs match <요청.jsonl> <결과.jsonl>
//     요청: {"id", "requirements": JobRequirements, "recordText", "careerYears"}
//     결과: {"id", "score": 0–100 | null}  (null = 요건을 하나도 읽지 못한 공고)
//   node rule_baselines.mjs materials <요청.jsonl> <결과.jsonl>
//     요청: {"id", "records": [{"id","title","status","text"}], "requirementLabels": [..]}
//     결과: {"id", "ranked": [{"id","score"}]}  (rankMaterials()가 정한 순서 그대로)
//
// match 모드는 @expresso/contracts의 dist를 읽는다. 먼저 `pnpm --filter @expresso/contracts build`.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const modules = new URL("../../services/backend/src/modules/", import.meta.url);

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

export async function scoreMatches(requests) {
  const { calculateExplainableMatch } = await import(new URL("jobs/match-score.ts", modules));
  const computedAt = new Date(0);
  return requests.map((request) => {
    // 공고 ID는 계약(UUID)을 지키기 위한 자리이고 점수에 쓰이지 않는다.
    const match = calculateExplainableMatch(randomUUID(), request.requirements, request.recordText, computedAt, request.careerYears ?? 0);
    return { id: request.id, score: match ? match.total : null };
  });
}

export async function rankRecords(requests) {
  const { rankMaterials } = await import(new URL("materials/ranking.ts", modules));
  return requests.map((request) => ({
    id: request.id,
    ranked: rankMaterials(request.records, request.requirementLabels).map((record) => ({ id: record.id, score: record.score })),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, input, output] = process.argv.slice(2);
  if (!input || !output || !["match", "materials"].includes(mode)) {
    console.error("usage: node rule_baselines.mjs <match|materials> <요청.jsonl> <결과.jsonl>");
    process.exit(2);
  }
  const requests = readJsonl(input);
  const rows = mode === "match" ? await scoreMatches(requests) : await rankRecords(requests);
  writeJsonl(output, rows);
  console.log(JSON.stringify({ mode, rows: rows.length }));
}
