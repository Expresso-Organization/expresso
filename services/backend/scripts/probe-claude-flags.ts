import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pageKitPrompt, pagePolicyPrompt } from "@expresso/contracts";

/**
 * 첫 조각까지 왜 오래 걸리는가.
 *
 * 실측(2026-08-14, 실제 지면 하나): 전체 307초 중 **첫 126초 동안 조각이 하나도
 * 안 왔다.** 처음에는 에이전트가 도구를 헛짚느라 턴을 버리는 줄 알았는데
 * (haiku + 모호한 과제에서 `Write`·`Artifact`를 시도하는 것을 봤다), 이 프로브가
 * 그걸 **부정했다** — sonnet에 지면 과제를 주면 다섯 변형 전부 앞선 턴 1,
 * 도구 시도 0이다.
 *
 * 침묵은 전부 **생각**이다. `PROBE_TRACE=1`로 돌리면 이벤트가 언제 처음
 * 나오는지 찍히고, 거기서 `thinking_delta`가 3.9초부터 110.9초까지 침묵 전체를
 * 덮는 것이 보인다.
 *
 * 지면 하나를 실제로 뽑으면 한 번에 $0.79라 여기서는 시스템 프롬프트만 진짜로
 * 두고 과제를 작게 준다.
 */

const CLI = process.env["CLAUDE_CLI_PATH"] ?? "/Users/minjaepark/.local/bin/claude";
const MODEL = process.env["PROBE_MODEL"] ?? "sonnet";

const SYSTEM = [
  "너는 이직 지원자의 **포트폴리오 웹페이지 한 장**을 조판한다.",
  "글도 네가 쓰고 구성도 네가 정한다. 다만 **부품은 이미 만들어져 있다.**",
  "",
  pageKitPrompt(),
  "",
  pagePolicyPrompt(),
  "",
  "## 내는 것",
  "- `html` — 몸통. `<!doctype>` · `<html>` · `<head>` · `<body>`는 쓰지 않는다.",
  "- `css` — 이 지면만의 한 장면에 쓰는 것만.",
  "- `rationale` — 이 내용을 보고 내린 판단을 한 문장으로.",
].join("\n");

const PROMPT = [
  "## 근거 1 — 기록",
  "박민재는 결제 파이프라인을 다시 짜서 배치를 220분에서 24분으로 줄였다.",
  "",
  "## 섹션 설계 1개",
  "### 1. 대표 성과",
  "- 목적: 무엇을 얼마나 줄였는지 한눈에",
  "- 분량: 약 200자",
  "",
  "이 사람의 포트폴리오 페이지를 만들어라.",
].join("\n");

const SCHEMA = JSON.stringify({
  type: "object",
  properties: { html: { type: "string" }, css: { type: "string" }, rationale: { type: "string" } },
  required: ["html", "css", "rationale"],
  additionalProperties: false,
});

/** 지금 어댑터가 주는 것. 나머지는 여기서 무엇을 더하고 빼는지로 읽는다. */
const BASE = [
  "-p",
  "--model", MODEL,
  "--output-format", "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--json-schema", SCHEMA,
  "--strict-mcp-config",
  "--mcp-config", '{"mcpServers":{}}',
  "--allowedTools", "",
];

const VARIANTS: { name: string; args: string[] }[] = [
  { name: "지금 그대로", args: [...BASE, "--append-system-prompt", SYSTEM] },
  {
    name: "시끄러운 도구를 지운다",
    args: [...BASE, "--append-system-prompt", SYSTEM,
      "--disallowedTools", "Write,Edit,Read,Bash,Glob,Grep,Artifact,WebFetch,WebSearch,Task,TodoWrite,NotebookEdit"],
  },
  { name: "기본 프롬프트를 갈아 끼운다", args: [...BASE, "--system-prompt", SYSTEM] },
  { name: "생각을 줄인다", args: [...BASE, "--append-system-prompt", SYSTEM, "--effort", "low"] },
  {
    name: "갈아 끼우고 도구도 지운다",
    args: [...BASE, "--system-prompt", SYSTEM,
      "--disallowedTools", "Write,Edit,Read,Bash,Glob,Grep,Artifact,WebFetch,WebSearch,Task,TodoWrite,NotebookEdit"],
  },
];

interface Measured {
  name: string;
  firstDeltaMs: number | null;
  totalMs: number;
  /** 구조화 출력이 시작되기 전에 지나간 어시스턴트 메시지 수. */
  turnsBefore: number;
  /** 그 사이에 손댄 도구들. 처음의 가설이었고, 재 보니 비어 있었다. */
  toolsTried: string[];
  costUsd: number | null;
  ok: boolean;
}

async function run(name: string, args: string[]): Promise<Measured> {
  const cwd = mkdtempSync(join(tmpdir(), "expresso-probe-"));
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(CLI, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => undefined);
    child.stdin.end(PROMPT, "utf8");

    let pending = "";
    let firstDeltaMs: number | null = null;
    let turnsBefore = 0;
    let structuredIndex: number | null = null;
    const toolsTried: string[] = [];
    let costUsd: number | null = null;
    let ok = false;
    const trace = new Map<string, [number, number]>();

    const onLine = (line: string) => {
      if (!line.startsWith("{")) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      if (process.env["PROBE_TRACE"]) {
        const inner = event["event"] as Record<string, unknown> | undefined;
        const kind = event["type"] === "stream_event"
          ? `stream:${String(inner?.["type"])}:${String((inner?.["delta"] as { type?: string } | undefined)?.type ?? (inner?.["content_block"] as { type?: string } | undefined)?.type ?? "")}`
          : `${String(event["type"])}:${String(event["subtype"] ?? "")}`;
        trace.set(kind, [(trace.get(kind)?.[0] ?? 0) + 1, trace.get(kind)?.[1] ?? Date.now() - started]);
      }
      if (event["type"] === "assistant" && structuredIndex === null) turnsBefore += 1;
      if (event["type"] === "result") {
        ok = event["is_error"] === false;
        costUsd = typeof event["total_cost_usd"] === "number" ? event["total_cost_usd"] : null;
      }
      if (event["type"] !== "stream_event") return;
      const inner = event["event"] as Record<string, unknown>;
      if (inner["type"] === "content_block_start") {
        const block = inner["content_block"] as { type?: string; name?: string } | undefined;
        if (block?.type !== "tool_use") return;
        if (block.name === "StructuredOutput") structuredIndex = inner["index"] as number;
        else toolsTried.push(block.name ?? "?");
        return;
      }
      if (inner["type"] === "content_block_delta" && inner["index"] === structuredIndex) {
        const delta = inner["delta"] as { type?: string } | undefined;
        if (delta?.type === "input_json_delta") firstDeltaMs ??= Date.now() - started;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onLine(line);
    });
    child.stderr.on("data", () => undefined);
    child.on("close", () => {
      if (process.env["PROBE_TRACE"]) {
        for (const [kind, [count, firstMs]] of [...trace].sort((a, b) => a[1][1] - b[1][1])) {
          process.stdout.write(`     ${(firstMs / 1000).toFixed(1)}s  ${String(count).padStart(4)}회  ${kind}\n`);
        }
      }
      resolve({
        name, firstDeltaMs, totalMs: Date.now() - started,
        turnsBefore, toolsTried, costUsd, ok,
      });
    });
  });
}

const only = process.argv[2];
const results: Measured[] = [];
for (const variant of VARIANTS) {
  if (only && !variant.name.includes(only)) continue;
  process.stdout.write(`… ${variant.name}\n`);
  const measured = await run(variant.name, variant.args);
  results.push(measured);
  process.stdout.write(
    `   첫 조각 ${measured.firstDeltaMs ?? "없음"}ms · 전체 ${measured.totalMs}ms`
    + ` · 앞선 턴 ${measured.turnsBefore} · 도구 [${measured.toolsTried.join(", ")}]`
    + ` · $${measured.costUsd?.toFixed(4) ?? "?"} · ${measured.ok ? "성공" : "실패"}\n`,
  );
}

console.log("\n| 변형 | 첫 조각 | 전체 | 앞선 턴 | 버린 도구 | 값 |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const r of results) {
  console.log(
    `| ${r.name} | ${r.firstDeltaMs ? `${(r.firstDeltaMs / 1000).toFixed(1)}s` : "—"}`
    + ` | ${(r.totalMs / 1000).toFixed(1)}s | ${r.turnsBefore} | ${r.toolsTried.join(" ") || "없음"}`
    + ` | $${r.costUsd?.toFixed(4) ?? "?"} |`,
  );
}
