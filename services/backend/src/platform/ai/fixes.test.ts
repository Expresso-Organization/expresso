import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  GenerationDraftSchema,
  InterviewQuestionDraftListSchema,
  InterviewQuestionRewriteSchema,
  JobAnalysisAiOutputSchema,
  JobFactsAiOutputSchema,
  LayoutDraftCandidatesSchema,
  LayoutDraftSchema,
  PageDraftSchema,
  PortfolioEditDraftSchema,
  RecipeDraftSchema,
  RecordCleanupSchema,
  SearchInterpretAiOutputSchema,
  StructuredContentModelSchema,
} from "@expresso/contracts";

import { ClaudeCodeAiClient } from "./claude-code.js";
import { SOFT_KEYWORDS, toToolSchema, type AiFix } from "./client.js";
import { applyFixes, groupViolations, jsonPointer, runWithFixes, zodViolations } from "./fixes.js";

// Windows는 확장자 없는 shebang 파일을 실행하지 않습니다. 이 시험의 가짜 CLI만 Node로 실행합니다.
// 실제 자식 프로세스·표준 입출력·종료와 시간 제한은 그대로 검증하며 제품 CLI 경로는 바꾸지 않습니다.
vi.mock("node:child_process",async importOriginal=>{
  const actual=await importOriginal<typeof import("node:child_process")>();
  return {...actual,spawn(command:string,args:readonly string[],options:import("node:child_process").SpawnOptions){
    return process.platform === "win32" && /[\\/]fake-claude-[^\\/]+[\\/]claude$/.test(command)
      ? actual.spawn(process.execPath,[command,...args],options)
      : actual.spawn(command,args,options);
  }};
});

/**
 * 가짜 CLI. 응답 목록을 차례로 내고, 받은 인자를 줄마다 기록합니다. 실제 CLI처럼 `stream-json` 마지막 줄에
 * `result` 봉투를 내고, 답은 글(`result`)입니다(`--json-schema`를 쓰지 않으므로 `structured_output`이 없다).
 * 응답이 문자열이면 그 글을 그대로, 아니면 JSON으로 적은 글을 냅니다. `{ delayMs, beats }`를 주면 그 간격으로 출력
 * 줄을 `beats`번 흘린 뒤 답합니다(출력이 흐르는 긴 호출). `{ text, stop }`을 주면 그 글과 끝낸 이유(`stop_reason`)를 냅니다.
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
  const response = JSON.parse(fs.readFileSync(dir + "/responses.json", "utf8"))[calls];
  const pace = response && typeof response === "object" && "beats" in response ? response : null;
  const stopped = response && typeof response === "object" && "stop" in response ? response : null;
  const output = pace ? pace.output : stopped ? stopped.text : response;
  const stop = stopped ? stopped.stop : "end_turn";
  const finish = () => process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, duration_ms: 10, total_cost_usd: 0.01, stop_reason: stop, result: typeof output === "string" ? output : JSON.stringify(output), usage: { input_tokens: 1, output_tokens: 5 }, modelUsage: { "claude-test": { outputTokens: 5 } } }) + "\\n");
  if (!pace) return finish();
  let beat = 0;
  const timer = setInterval(() => {
    process.stdout.write(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "" } } }) + "\\n");
    if (++beat >= pace.beats) { clearInterval(timer); finish(); }
  }, pace.delayMs);
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
    // 고칠 수 있는 경로는 출력 형식 절의 설명으로 가고, 받은 뒤 계약(열거형)이 봅니다.
    expect(fix!.input).toMatch(/값: \\"\/(title|items)\\" \| \\"\/(title|items)\\"/);
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

  it("고쳐도 걸린 칸이 줄지 않으면 멈추고, 업무 규칙 위반만 남은 출력은 그대로 돌려준다", async () => {
    const cli = fakeCli([{ title: "제목", items: ["x"] }, { fixes: [] }, { fixes: [] }]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema, {
      check: () => [{ path: "/items/0", problem: "여전히 맞지 않습니다." }],
    });
    expect(result.data).toEqual({ title: "제목", items: ["x"] });
    expect(cli.calls()).toHaveLength(2);
  });

  it("걸린 칸이 줄어드는 동안은 두 번을 넘어서도 계속 고쳐 받는다", async () => {
    const cli = fakeCli([
      { title: "제목", items: ["x", "y"] },
      { fixes: [{ path: "/items/0", value: "ok" }] },
      { fixes: [{ path: "/items/1", value: "ok" }] },
    ]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema, {
      check: (data) => data.items.flatMap((item, index) => (item === "ok" ? [] : [{ path: `/items/${index}`, problem: "아직입니다." }])),
    });
    expect(result.data.items).toEqual(["ok", "ok"]);
    expect(cli.calls()).toHaveLength(3);
  });
});

describe("걸린 수가 줄지 않아도 모델이 값을 바꾸는 동안", () => {
  const usage = (durationMs: number) => ({ model: "m", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs });
  const run = (firstMs: number, values: string[]) => {
    let fixes = 0;
    return runWithFixes({
      contract: "page_fill",
      schema,
      options: { check: (data) => (data.title === "맞음" ? [] : [{ path: "/title", problem: "아직 맞지 않습니다." }]) },
      first: async () => ({ text: JSON.stringify({ title: "처음", items: [] }), usage: usage(firstMs) }),
      fix: async () => ({ output: { fixes: [{ path: "/title", value: values[fixes++] ?? "그대로" }] }, usage: usage(10) }),
    }).then((result) => ({ result, fixes }));
  };

  it("고치기에 쓴 시간이 첫 호출 시간보다 짧은 동안은 계속 고쳐 받는다", async () => {
    const { result, fixes } = await run(100, ["둘째", "셋째", "맞음"]);
    expect(result.data.title).toBe("맞음");
    expect(fixes).toBe(3);
  });

  it("첫 호출 시간을 다 쓰면 멈추고 출력을 그대로 돌려준다 — 그보다 오래 고치면 다시 쓰는 편이 싸다", async () => {
    const { result, fixes } = await run(20, ["둘째", "셋째", "넷째", "맞음"]);
    expect(fixes).toBe(2);
    expect(result.data.title).toBe("셋째");
  });

  it("값을 바꾸지 않았으면 시간이 남아도 멈춘다", async () => {
    const { fixes } = await run(1_000, ["처음"]);
    expect(fixes).toBe(1);
  });
});

describe("출력 전체를 고칠 때", () => {
  it("모델에게는 출력 전체를 / 로 보이고, / 로 온 고치기를 출력 전체로 받는다", async () => {
    const cli = fakeCli([{ title: "제목", items: [] }, { fixes: [{ path: "/", value: { title: "새 제목", items: ["a"] } }] }]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema, {
      check: (data) => (data.items.length ? [] : [{ path: "", problem: "지면이 그대로입니다." }]),
    });
    expect(result.data).toEqual({ title: "새 제목", items: ["a"] });
    const fix = cli.calls()[1]!;
    expect(fix.input).toContain('값: \\"/\\"');
    expect(fix.input).toContain("- /: 지면이 그대로입니다.");
  });
});

describe("CLI에 출력 검증을 맡기지 않는다", () => {
  it("어느 호출에도 --json-schema를 넘기지 않고 내장 도구를 모두 끈다", async () => {
    const cli = fakeCli([{ title: "열 글자를 훨씬 넘는 제목입니다", items: [] }, { fixes: [{ path: "/title", value: "짧은 제목" }] }]);
    await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema);
    for (const call of cli.calls()) {
      expect(call.args).not.toContain("--json-schema");
      expect(call.args[call.args.indexOf("--tools") + 1]).toBe("");
    }
    // 출력 모양은 프롬프트 끝의 출력 형식 절로 갑니다.
    expect(cli.calls()[0]!.input).toContain("## 출력 형식");
  });

  it("JSON 앞뒤의 설명 글과 코드 블록 표시는 읽지 않는다", async () => {
    const cli = fakeCli(['다음은 결과입니다.\n```json\n{"title":"제목","items":["a"]}\n```\n이상입니다.']);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema);
    expect(result.data).toEqual({ title: "제목", items: ["a"] });
    expect(cli.calls()).toHaveLength(1);
  });

  it("문법이 깨진 출력은 깨진 자리만 같은 세션에서 고쳐 받는다 — 처음부터 다시 쓰지 않는다", async () => {
    const cli = fakeCli([
      '{"title":"제목","items":["a" "b"]}',
      { edits: [{ find: '"a" "b"', replace: '"a", "b"' }] },
    ]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema);
    expect(result.data).toEqual({ title: "제목", items: ["a", "b"] });
    const [first, fix] = cli.calls();
    expect(fix!.args[fix!.args.indexOf("--resume") + 1]).toBe(first!.args[first!.args.indexOf("--session-id") + 1]);
    expect(fix!.input).toContain("문법이 깨져");
    expect(fix!.input).toContain("⟪여기⟫");
    expect(fix!.input).not.toContain("채우세요.");
  });

  it("출력 한도에 닿아 끊긴 출력은 끊긴 곳 다음부터 이어 받는다", async () => {
    const cli = fakeCli([{ text: '{"title":"제목","items":["a"', stop: "max_tokens" }, ',"b"]}']);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema);
    expect(result.data).toEqual({ title: "제목", items: ["a", "b"] });
    expect(cli.calls()[1]!.input).toContain("이어서 쓰세요");
  });

  it("다 썼는데 끝에서 막혔으면(닫는 괄호가 빠짐) 이어 쓰기가 아니라 끝부분 조각을 고쳐 받는다", async () => {
    const cli = fakeCli(['{"title":"제목","items":["a"]', { edits: [{ find: '["a"]', replace: '["a"]}' }] }]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema);
    expect(result.data).toEqual({ title: "제목", items: ["a"] });
    expect(cli.calls()[1]!.input).toContain("문법이 깨져");
    expect(cli.calls()[1]!.input).not.toContain("이어서 쓰세요");
  });

  it("고쳐도 같은 자리에서 막히면 멈춘다", async () => {
    const cli = fakeCli(['{"title":"제목","items":["a" "b"]}', { edits: [{ find: "원문에 없는 조각", replace: "x" }] }]);
    await expect(new ClaudeCodeAiClient({ cliPath: cli.cliPath }).complete(spec, schema)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(cli.calls()).toHaveLength(2);
  });
});

// 상한은 가짜 CLI가 뜨는 시간(테스트를 함께 돌리면 수백 ms)보다 넉넉해야 한다. 400ms에서는 첫 출력 전에 끊긴 적이 있다.
describe("시간 상한은 출력이 멈춘 시간이다", () => {
  it("출력이 계속 흐르면 상한을 넘겨도 끝까지 받는다", { timeout: 15_000 }, async () => {
    const cli = fakeCli([{ delayMs: 300, beats: 10, output: { title: "제목", items: [] } }]);
    const result = await new ClaudeCodeAiClient({ cliPath: cli.cliPath, timeoutMs: 1_500 }).complete(spec, schema);
    expect(result.data.title).toBe("제목");
  });

  it("출력이 상한보다 오래 멈추면 끊는다", { timeout: 15_000 }, async () => {
    const cli = fakeCli([{ delayMs: 5_000, beats: 1, output: { title: "제목", items: [] } }]);
    await expect(new ClaudeCodeAiClient({ cliPath: cli.cliPath, timeoutMs: 1_500 }).complete(spec, schema)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
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
    // 필수 칸도 공급자가 거절하지 않도록 설명으로만 갑니다. 선택 칸은 그 목록에 없습니다.
    expect((tool as { required?: string[] }).required).toBeUndefined();
    expect((tool as { description: string }).description).toBe("꼭 쓰는 칸: body, tags, score, id");
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
    // 안쪽 칸의 이유는 바깥 칸의 이유에 경로와 함께 남습니다.
    expect(grouped.get("/items")).toEqual(["많습니다", "/3: 깁니다"]);
  });
  it("Zod 이슈를 칸 경로와 문장으로 바꾼다", () => {
    const parsed = schema.safeParse({ title: "", items: [] });
    expect(parsed.success).toBe(false);
    expect(zodViolations(parsed.error!).map((violation) => violation.path)).toEqual(["/title"]);
  });
});

/** 스키마 노드에 남은 기준 키워드를 찾습니다. 칸 이름(`properties` · `$defs`의 키)은 기준이 아니므로 건너뜁니다. */
function softKeywords(node: unknown, at = ""): string[] {
  if (Array.isArray(node)) return node.flatMap((item, index) => softKeywords(item, `${at}/${index}`));
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
    if (key === "properties" || key === "$defs")
      return Object.entries(value as Record<string, unknown>).flatMap(([name, child]) => softKeywords(child, `${at}/${key}/${name}`));
    return [...((SOFT_KEYWORDS as readonly string[]).includes(key) ? [`${at}/${key}`] : []), ...softKeywords(value, `${at}/${key}`)];
  });
}

describe("규칙: 공급자 형식에 글자 수 · 개수 · 형식 기준을 넘기지 않는다", () => {
  // 기준을 넘기면 공급자가 조금만 어긴 출력도 통째로 돌려보내 처음부터 다시 쓴다(AGENTS.md 「지키는 선」).
  const contracts = {
    GenerationDraftSchema, InterviewQuestionDraftListSchema, InterviewQuestionRewriteSchema, JobAnalysisAiOutputSchema,
    JobFactsAiOutputSchema, LayoutDraftCandidatesSchema, LayoutDraftSchema, PageDraftSchema, PortfolioEditDraftSchema,
    RecipeDraftSchema, RecordCleanupSchema, SearchInterpretAiOutputSchema, StructuredContentModelSchema,
  };
  for (const [name, schema] of Object.entries(contracts))
    it(`${name}`, () => {
      expect(softKeywords(toToolSchema(schema))).toEqual([]);
    });
});
