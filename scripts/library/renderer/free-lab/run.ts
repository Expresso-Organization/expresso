// 자유 생성 실험의 조건별 실제 생성입니다. 저장된 결과는 덮어쓰지 않습니다.
//
// 조건(arm)
//   base       지금의 자유 생성(AiPageGenerator) 그대로. 디자인 시스템을 고른 문맥은 키트 부품으로 조판한다
//   plain      키트 없이 모델이 CSS 전체를 쓰는 자유 생성(정제 · 지침 없음)
//   refine     자료 정리본만
//   skill      디자인 지침만
//   both       정리본 + 디자인 지침
//   tokens     both에서 스타일을 색 · 서체 · 밀도만 넘김(배치는 지면 호출이 정함)
//   spec       both에 디자인 시스템 스펙의 시각 규칙을 더함
//   structured 구조화 생성(기준)
//
//   node --import ./services/backend/node_modules/tsx/dist/loader.mjs scripts/library/renderer/free-lab/run.ts \
//     --run free-lab-2026-11-15 --cells pilot --generate
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { pageDocument } from "../../../../packages/contracts/src/page.js";
import { ClaudeCodeAiClient } from "../../../../services/backend/src/platform/ai/claude-code.js";
import type { AiCallOptions, AiCallSpec, AiClient, AiResult, AiUsage } from "../../../../services/backend/src/platform/ai/client.js";
import { AiPageGenerator, type GeneratedPageResult, type PageGenerationContext } from "../../../../services/backend/src/modules/page/generator.js";
import { BriefedPageGenerator, type BriefedPageResult } from "../../../../services/backend/src/modules/page/briefed-generator.js";
import { refinePageBrief, type PageBrief } from "../../../../services/backend/src/modules/page/page-brief.js";
import { StructuredPageGenerator } from "../../../../services/backend/src/modules/page/structured-generator.js";
import { PAGE_PROMPT_VERSION } from "../../../../packages/contracts/src/page.js";

type Arm = "base" | "plain" | "refine" | "skill" | "both" | "tokens" | "spec" | "structured";
interface Cell { input: string; arm: Arm; rep: number }

const FREE: Arm[] = ["base", "plain", "refine", "skill", "both", "tokens", "spec"];
/** 시험 실행: 한 인물 × 자유 생성 조건. */
const PILOT: Cell[] = FREE.map((arm) => ({ input: "yun-clarity", arm, rep: 1 }));
const FULL: Cell[] = [
  ...["moon-clarity", "bae-clarity"].flatMap((input) => FREE.map((arm) => ({ input, arm, rep: 1 }))),
  // 실행마다의 차이를 보려고 한 인물의 키트 없는 자유 생성과 둘 다를 한 번씩 더 만듭니다.
  { input: "yun-clarity", arm: "plain", rep: 2 },
  { input: "yun-clarity", arm: "both", rep: 2 },
  // 같은 인물 · 다른 디자인. 고른 디자인이 지면에 드러나는지 봅니다.
  ...["yun-refero-linear-midnight", "yun-editorial"].flatMap((input) => (["both", "spec"] as const).map((arm) => ({ input, arm, rep: 1 }))),
  ...["yun-clarity", "moon-clarity", "bae-clarity"].map((input) => ({ input, arm: "structured" as const, rep: 1 })),
];

const arg = (name: string) => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? undefined : process.argv[at + 1]; };
const run = arg("run");
if (!run || !/^[a-zA-Z0-9-]+$/.test(run)) throw new Error("실행 식별자가 필요합니다: --run <이름>");
if (!process.argv.includes("--generate")) throw new Error("실제 모델 호출입니다. --generate를 붙여 실행합니다.");
const set = arg("cells") ?? "pilot";
const only = arg("only");
const cells = (only
  ? only.split(",").map((item) => { const [input, arm, rep] = item.split(":"); return { input: input!, arm: arm as Arm, rep: Number(rep ?? 1) }; })
  : set === "pilot" ? PILOT : set === "full" ? FULL : [...PILOT, ...FULL]);
const parallel = Number(arg("parallel") ?? 3);
const skillPath = arg("skill") ?? path.join(os.homedir(), ".claude/skills/frontend-design/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf8");

const root = path.join(process.cwd(), "docs/library/previews/portfolio/runs", run);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); };
const input = (name: string) => JSON.parse(fs.readFileSync(path.join(root, "inputs", `${name}.json`), "utf8")) as { persona: string; design: string; context: PageGenerationContext };

// 제품과 같은 옵션으로 CLI를 부릅니다(도구 끔 · 빈 작업 폴더 · 프로젝트 설정만). 세션 저장을 끄지 않습니다 — 고치기가 같은 세션을 이어 씁니다.
const provider = new ClaudeCodeAiClient({ timeoutMs: 600_000 });

/** 호출마다 요청과 사용량을 남깁니다. */
class Traced implements AiClient {
  readonly calls: { contract: string; system: string; prompt: string; modelTier?: string; usage: AiUsage }[] = [];
  readonly streams = false;
  async complete<T>(spec: AiCallSpec, schema: z.ZodType<T>, options: AiCallOptions<T> = {}): Promise<AiResult<T>> {
    const result = await provider.complete(spec, schema, options);
    this.calls.push({ contract: spec.contract, system: spec.system, prompt: spec.prompt, ...(spec.modelTier ? { modelTier: spec.modelTier } : {}), usage: result.usage });
    return result;
  }
}

/** 정리본은 입력마다 한 번 만들고, 정제를 쓰는 조건이 함께 씁니다. */
type SavedBrief = { brief: PageBrief; usage: AiUsage };
const briefs = new Map<string, Promise<SavedBrief>>();
function briefFor(name: string, context: PageGenerationContext): Promise<SavedBrief> {
  const cached = briefs.get(name);
  if (cached) return cached;
  // 정리본은 디자인과 상관없이 같은 자료에서 나오므로 인물마다 하나만 둡니다.
  const file = path.join(root, "briefs", `${name.split("-")[0]}.json`);
  const made = (async () => {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as SavedBrief;
    console.log(`${name}: 정리본 만들기`);
    const { brief, usage, prompt } = await refinePageBrief(provider, context, PAGE_PROMPT_VERSION);
    write(file, { input: name, usage, promptSha256: sha(prompt), brief });
    write(file.replace(/\.json$/, ".request.txt"), prompt);
    return { brief, usage };
  })();
  briefs.set(name, made);
  return made;
}

async function runCell(cell: Cell) {
  const label = `${cell.input}__${cell.arm}__r${cell.rep}`;
  const dir = path.join(root, "cells", label);
  if (fs.existsSync(path.join(dir, "result.json"))) { console.log(`${label}: 저장된 결과 유지`); return; }
  const { context, persona, design } = input(cell.input);
  const ai = new Traced();
  let briefUsage: AiUsage | null = null;
  const started = Date.now();
  console.log(`${label}: 시작`);
  try {
    let result: GeneratedPageResult | BriefedPageResult;
    if (cell.arm === "base") result = await new AiPageGenerator(ai).generate(context);
    else if (cell.arm === "structured") result = await new StructuredPageGenerator(ai, null).generate({ ...context, pageFormat: "json-render" });
    else {
      const refine = cell.arm !== "plain" && cell.arm !== "skill";
      if (refine) briefUsage = (await briefFor(cell.input, context)).usage;
      result = await new BriefedPageGenerator(ai, {
        refine,
        designSkill: cell.arm === "plain" || cell.arm === "refine" ? null : skill,
        brief: refine ? (await briefFor(cell.input, context)).brief : null,
        styleMode: cell.arm === "tokens" ? "tokens" : cell.arm === "spec" ? "spec" : "grammar",
      }).generate(context);
    }
    const title = `${context.author?.name ?? persona} 포트폴리오`;
    // 키트로 조판한 지면(기준 · 구조화)에만 키트 CSS를 싣습니다. 모델이 CSS 전체를 쓴 지면에 키트를 실으면 두 규칙이 부딪힙니다.
    const kit = (cell.arm === "base" && context.useKit) || cell.arm === "structured";
    write(path.join(dir, "page.html"), pageDocument({ html: result.html, css: result.css, title, description: result.rationale, ...(kit && context.style ? { grammar: context.style } : {}) }));
    write(path.join(dir, "draft.json"), { html: result.html, css: result.css });
    write(path.join(dir, "calls.json"), ai.calls);
    const total = (key: "costUsd" | "outputTokens" | "inputTokens" | "durationMs") => ai.calls.reduce((sum, call) => sum + (call.usage[key] ?? 0), 0);
    write(path.join(dir, "result.json"), {
      label, input: cell.input, persona, design, arm: cell.arm, rep: cell.rep,
      startedAt: new Date(started).toISOString(), wallMs: Date.now() - started,
      model: result.usage.model, calls: ai.calls.length,
      costUsd: Number(total("costUsd").toFixed(4)), outputTokens: total("outputTokens"), inputTokens: total("inputTokens"), aiMs: total("durationMs"),
      // 정리본은 같은 인물의 여러 조건이 함께 쓰지만, 제품에서는 지면 한 장마다 한 번 듭니다. 지면 한 장의 값은 둘을 더한 것입니다.
      briefCostUsd: briefUsage ? Number((briefUsage.costUsd ?? 0).toFixed(4)) : 0, briefMs: briefUsage?.durationMs ?? 0,
      rationale: result.rationale, plan: "plan" in result ? result.plan : null,
      ungrounded: result.ungrounded, removed: result.removed, blockedTags: "blockedTags" in result ? result.blockedTags : null,
      qa: result.qaReport.status, htmlBytes: Buffer.byteLength(result.html), cssBytes: Buffer.byteLength(result.css),
      promptHash: result.manifest.promptHash, skillSha256: "plan" in result && result.plan ? sha(skill) : null,
    });
    console.log(`${label}: 완료 ${Math.round((Date.now() - started) / 1000)}초 · $${total("costUsd").toFixed(2)}`);
  } catch (error) {
    write(path.join(dir, "failure.json"), { label, startedAt: new Date(started).toISOString(), wallMs: Date.now() - started, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error), calls: ai.calls });
    console.log(`${label}: 실패 — ${error instanceof Error ? error.message : String(error)}`);
  }
}

write(path.join(root, "run.json"), { run, skillPath: skillPath.replace(os.homedir(), "~"), skillSha256: sha(skill), pagePromptVersion: PAGE_PROMPT_VERSION, node: process.version });
const queue = [...cells];
const timer = setInterval(() => console.log(`… 남은 칸 ${queue.length}`), 60_000);
try {
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, async () => { for (let cell = queue.shift(); cell; cell = queue.shift()) await runCell(cell); }));
} finally {
  clearInterval(timer);
}
