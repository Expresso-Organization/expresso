import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ClaudeCodeAiClient } from "./claude-code.js";
import { SOFT_KEYWORDS, toToolSchema, type AiFix } from "./client.js";
import { applyFixes, groupViolations, jsonPointer, zodViolations } from "./fixes.js";

/**
 * 가짜 CLI. 응답 목록을 차례로 내고, 받은 인자를 줄마다 기록합니다. 실제 CLI처럼 `stream-json` 마지막 줄에
 * `result` 봉투를 냅니다.
 */
function fakeCli(responses: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const log = join(dir, "calls.jsonl");
  const script = join(dir, "claude");
  writeFileSync(join(dir, "responses.json"), JSON.stringify(responses));
  writeFileSync(script, `#!/usr/bin/env node
const fs = require("node:fs");
const dir = ${JSON.stringify(dir)};
const calls = fs.existsSync(dir + "/calls.jsonl") ? fs.readFileSync(dir + "/calls.jsonl", "utf8").trim().split("\\n").filter(Boolean).length : 0;
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  fs.appendFileSync(dir + "/calls.jsonl", JSON.stringify({ args: process.argv.slice(2), input }) + "\\n");
  const output = JSON.parse(fs.readFileSync(dir + "/responses.json", "utf8"))[calls];
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, duration_ms: 10, total_cost_usd: 0.01, structured_output: output, usage: { input_tokens: 1, output_tokens: 5 }, modelUsage: { "claude-test": { outputTokens: 5 } } }) + "\\n");
});
`);
  chmodSync(script, 0o755);
  const calls = () => readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; input: string });
  return { cliPath: script, calls };
}

const spec = { contract: "page_fill" as const, system: "칸을 채웁니다.", prompt: "채우세요.", promptVersion: 1 };
const schema = z.object({
  title: z.string().min(1).max(10),
  items: z.array(z.string()).max(2),
});

describe("검사에 걸린 칸은 같은 대화에서 그 칸만 고쳐 받는다", () => {
  it("계약 위반 칸만 경로로 보내고, 고친 값을 넣어 돌려준다 — 처음부터 다시 쓰지 않는다", async () => {
    const cli = fakeCli([
      { title: "열 글자를 훨씬 넘는 제목입니다", items: ["a", "b", "c"] },
      { fixes: [{ path: "/title", value: "짧은 제목" }, { path: "/items", value: ["a", "b"] }] },
    ]);
    const drafts: unknown[] = [];
    const revisions: AiFix[][] = [];
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema, {
      onDraft: (data) => drafts.push(data),
      onRevision: (fixes) => revisions.push([...fixes]),
    });
    expect(result.data).toEqual({ title: "짧은 제목", items: ["a", "b"] });
    const [first, fix] = cli.calls();
    // 고치기는 첫 호출과 같은 세션을 이어 쓰고, 공급자 형식의 경로는 걸린 칸만입니다.
    const session = first!.args[first!.args.indexOf("--session-id") + 1];
    expect(fix!.args[fix!.args.indexOf("--resume") + 1]).toBe(session);
    expect(fix!.input).toContain("/title");
    expect(fix!.input).not.toContain("채우세요.");
    const fixSchemaArg = JSON.parse(fix!.args[fix!.args.indexOf("--json-schema") + 1]!) as { properties: { fixes: { items: { properties: { path: { enum: string[] } } } } } };
    expect(fixSchemaArg.properties.fixes.items.properties.path.enum.sort()).toEqual(["/items", "/title"]);
    // 계약을 못 지킨 첫 출력은 보여 주지 않고, 고친 뒤 처음 통과한 출력을 보여 줍니다.
    expect(drafts).toEqual([{ title: "짧은 제목", items: ["a", "b"] }]);
    expect(result.usage.costUsd).toBeCloseTo(0.02);
  });

  it("업무 규칙 위반은 바로 보여 준 뒤 고쳐 받고, 고친 칸을 알린다", async () => {
    const cli = fakeCli([
      { title: "제목", items: ["근거 없음"] },
      { fixes: [{ path: "/items/0", value: "근거 있음" }] },
    ]);
    const events: string[] = [];
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema, {
      check: (data) => data.items.flatMap((item, index) => (item.includes("없음") ? [{ path: `/items/${index}`, problem: "근거가 없습니다." }] : [])),
      onDraft: (data) => events.push(`draft:${data.items[0]}`),
      onRevision: (fixes) => events.push(`revised:${fixes.map((fix) => fix.path).join(",")}`),
    });
    expect(result.data.items).toEqual(["근거 있음"]);
    expect(events).toEqual(["draft:근거 없음", "revised:/items/0"]);
  });

  it("두 번 고쳐도 남은 업무 규칙 위반은 출력을 그대로 돌려준다", async () => {
    const cli = fakeCli([{ title: "제목", items: ["x"] }, { fixes: [] }, { fixes: [] }]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema, {
      check: () => [{ path: "/items/0", problem: "여전히 맞지 않습니다." }],
    });
    expect(result.data).toEqual({ title: "제목", items: ["x"] });
    expect(cli.calls()).toHaveLength(3);
  });
});

describe("공급자 형식은 모양만", () => {
  it("길이 · 개수 · 형식 · 범위 기준을 떼고 설명 문장으로 옮긴다", () => {
    const tool = toToolSchema(z.object({
      body: z.string().min(2).max(80),
      tags: z.array(z.string().regex(/^#/)).min(1).max(3),
      score: z.number().int().min(0).max(10),
      id: z.uuid(),
      // 칸 이름이 기준 키워드와 같아도 칸은 남습니다.
      pattern: z.string().optional(),
    }));
    const text = JSON.stringify(tool);
    for (const keyword of SOFT_KEYWORDS.filter((keyword) => keyword !== "pattern")) expect(text).not.toContain(`"${keyword}"`);
    expect(text).not.toMatch(/"pattern":"/);
    const properties = (tool as { properties: Record<string, { description?: string }> }).properties;
    expect(properties["body"]?.description).toBe("2자 이상 · 80자 이하");
    expect(properties["tags"]?.description).toBe("1개 이상 · 3개 이하");
    expect(properties["score"]?.description).toContain("0 이상 · 10 이하");
    expect(properties).toHaveProperty("pattern");
    // 선택 칸은 선택 칸으로 둡니다. 빼도 공급자가 거절하지 않습니다.
    expect((tool as { required: string[] }).required).not.toContain("pattern");
  });
});

describe("고치기 도구", () => {
  it("경로를 JSON 포인터로 바꾸고 고친 값을 그 자리에 넣는다", () => {
    expect(jsonPointer(["sections", "a/b", 0])).toBe("/sections/a~1b/0");
    expect(applyFixes({ sections: { "a/b": [{ t: 1 }] } }, [{ path: "/sections/a~1b/0/t", value: 2 }])).toEqual({ sections: { "a/b": [{ t: 2 }] } });
  });
  it("바깥 칸을 고치면 안쪽 칸은 따로 묻지 않는다", () => {
    const grouped = groupViolations([{ path: "/items", problem: "많습니다" }, { path: "/items/3", problem: "깁니다" }, { path: "/title", problem: "깁니다" }]);
    expect([...grouped.keys()]).toEqual(["/items", "/title"]);
  });
  it("Zod 이슈를 칸 경로와 문장으로 바꾼다", () => {
    const parsed = schema.safeParse({ title: "", items: [] });
    expect(parsed.success).toBe(false);
    expect(zodViolations(parsed.error!).map((violation) => violation.path)).toEqual(["/title"]);
  });
});
