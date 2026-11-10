import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AGENT_EVALUATION_CASES, evaluateAgentTrace } from "../platform/agent/evaluation.js";
const Trace = z.strictObject({ caseId: z.string(), answer: z.string(), tools: z.array(z.string()), quotes: z.array(z.string()), committedActions: z.array(z.string()) });
const path = process.argv[2];
if (!path) throw new Error("Usage: node --import tsx src/cli/agent-evaluate.ts traces.json");
const traces = z.array(Trace).parse(JSON.parse(await readFile(path, "utf8")));
const results = AGENT_EVALUATION_CASES.map(test => {
  const matches = traces.filter(trace => trace.caseId === test.id);
  return { id: test.id, issues: matches.length === 1 ? evaluateAgentTrace(test, matches[0]!) : ["평가 응답 누락 또는 중복"] };
});
for (const trace of traces) if (!AGENT_EVALUATION_CASES.some(test => test.id === trace.caseId)) results.push({ id: trace.caseId, issues: ["알 수 없는 평가 항목"] });
console.log(JSON.stringify({ passed: results.filter(row => !row.issues.length).length, total: results.length, results }, null, 2));
if (results.some(row => row.issues.length)) process.exitCode = 1;
