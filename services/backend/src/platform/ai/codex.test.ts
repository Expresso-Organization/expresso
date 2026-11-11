import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AiCallSpec } from "./client.js";
import { CodexAiClient, DEFAULT_CODEX_MODEL } from "./codex.js";

const spec: AiCallSpec = {
  contract: "job_analysis",
  system: "공고에 없는 정보는 만들지 않는다.",
  prompt: "Airflow와 Spark 경험을 추출해라.",
  promptVersion: 1,
  modelTier: "haiku",
};

const OutputSchema = z.strictObject({
  technologies: z.array(z.string()),
  summary: z.string(),
  debugArgs: z.array(z.string()),
  debugPrompt: z.string(),
});

const directories: string[] = [];
function fakeCodex(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "expresso-fake-codex-"));
  directories.push(directory);
  const scriptPath = join(directory, "codex.mjs");
  writeFileSync(scriptPath, `${source}\n`, "utf8");
  if (process.platform === "win32") {
    const commandPath = join(directory, "codex.cmd");
    writeFileSync(commandPath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, "utf8");
    return commandPath;
  }
  const executablePath = join(directory, "codex");
  writeFileSync(executablePath, `#!/usr/bin/env node\nimport ${JSON.stringify(scriptPath)};\n`, "utf8");
  chmodSync(executablePath, 0o755);
  return executablePath;
}

afterAll(() => {
  for (const path of directories) rmSync(path, { recursive: true, force: true });
});

describe("Codex CLI 어댑터", () => {
  it("도구를 끈 격리 실행에서 스키마 응답과 사용량을 읽는다", async () => {
    const executable = fakeCodex(String.raw`
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const text = JSON.stringify({
    technologies: ["Airflow", "Spark"],
    summary: "데이터 엔지니어",
    debugArgs: process.argv.slice(2),
    debugPrompt: prompt,
  });
  console.log(JSON.stringify({ type: "thread.started", thread_id: "test" }));
  console.log(JSON.stringify({
    type: "item.completed",
    item: { id: "answer", type: "agent_message", text },
  }));
  console.log(JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 120, cached_input_tokens: 40, output_tokens: 30 },
  }));
});`);
    const client = new CodexAiClient({
      cliPath: executable,
      models: { job_analysis: "gpt-test" },
    });

    const result = await client.complete(spec, OutputSchema);

    expect(result.data.technologies).toEqual(["Airflow", "Spark"]);
    expect(result.data.debugArgs).toEqual(expect.arrayContaining([
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "shell_tool",
      "multi_agent",
      "gpt-test",
      "--output-schema",
      "--json",
      "-",
    ]));
    expect(result.data.debugPrompt).toContain(spec.system);
    expect(result.data.debugPrompt).toContain(spec.prompt);
    expect(result.usage).toMatchObject({
      model: "gpt-test",
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 40,
      cacheCreationTokens: 0,
      costUsd: null,
    });
  });

  it("기존 모델 티어를 Codex 모델군에 대응한다", () => {
    expect(DEFAULT_CODEX_MODEL).toEqual({
      haiku: "gpt-5.6-luna",
      sonnet: "gpt-5.6-terra",
      opus: "gpt-5.6-sol",
    });
  });

  it("고쳐도 스키마에 맞지 않는 응답은 전체 재시도 없이 중단한다", async () => {
    const executable = fakeCodex(`
process.stdin.resume();
process.stdin.on("end", () => {
  console.log(JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: JSON.stringify({ summary: "누락" }) },
  }));
});`);
    const client = new CodexAiClient({ cliPath: executable });

    await expect(client.complete(spec, OutputSchema)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
      retryable: false,
    });
  });

  it("레이트 리밋과 실행 파일 부재를 구분한다", async () => {
    const limited = fakeCodex(`
process.stderr.write("usage limit reached\\n");
process.exit(1);`);
    await expect(new CodexAiClient({ cliPath: limited }).complete(spec, OutputSchema))
      .rejects.toMatchObject({ code: "AI_RATE_LIMITED", retryable: false });

    await expect(new CodexAiClient({ cliPath: "codex-does-not-exist" }).complete(spec, OutputSchema))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: false });
  });

  it("응답이 멎으면 프로세스를 종료하고 재시도 가능한 타임아웃을 낸다", async () => {
    const hanging = fakeCodex("process.stdin.resume(); setInterval(() => undefined, 1_000);");
    await expect(new CodexAiClient({ cliPath: hanging, timeoutMs: 30 }).complete(spec, OutputSchema))
      .rejects.toMatchObject({ code: "AI_TIMEOUT", retryable: true });
  });
});

describe("Codex 선택 필드 응답", () => {
  const nested = z.object({ spec: z.object({ elements: z.object({ page: z.object({ type: z.literal("Page") }), metrics: z.object({ text: z.string() }).optional() }) }) });
  it("선택 요소가 있는 계약은 강제 스키마 없이 받고 생략을 보존한다", async () => {
    const executable = fakeCodex(String.raw`
let prompt="";
process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>prompt+=chunk);
process.stdin.on("end",()=>{
 if(process.argv.includes("--output-schema")) {process.stderr.write("invalid_json_schema: missing metrics");process.exit(1);}
 if(!prompt.includes("<response_schema>") || !prompt.includes('"metrics"') || !prompt.includes("Optional fields may be omitted")) {process.stderr.write("missing response format");process.exit(1);}
 console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:JSON.stringify({spec:{elements:{page:{type:"Page"}}}})}}));
});`);
    const result = await new CodexAiClient({cliPath:executable}).complete({...spec,contract:"page_design"},nested);
    expect(result.data.spec.elements).toEqual({page:{type:"Page"}});
    expect(Object.hasOwn(result.data.spec.elements,"metrics")).toBe(false);
  });
  it("강제 스키마를 생략해도 원본 Zod 계약 위반은 거절한다", async () => {
    const executable=fakeCodex(String.raw`
process.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:JSON.stringify({spec:{elements:{page:{type:"Wrong"}}}})}})));
`);
    await expect(new CodexAiClient({cliPath:executable}).complete({...spec,contract:"page_design"},nested)).rejects.toMatchObject({code:"AI_INVALID_OUTPUT"});
  });
});

describe("Codex 필드 복구", () => {
  const path = "/spec/elements/index/props/variant";
  const pageSchema = z.object({spec:z.object({elements:z.object({
    index:z.object({props:z.object({variant:z.enum(["rows","mosaic","rail","timeline"]),title:z.string()})}),
    metrics:z.object({text:z.string()}).optional(),
  })})});
  it("잘못된 variant만 고쳐 받고 다른 내용과 생략한 요소는 보존한다", async () => {
    const executable=fakeCodex(String.raw`
let prompt="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>prompt+=x);process.stdin.on("end",()=>{
 const repair=prompt.includes("<field_repair>");
 if(repair && (!prompt.includes("/spec/elements/index/props/variant")||!prompt.includes("timeline")||prompt.includes("keep-this-title"))) {process.stderr.write("not a scoped repair");process.exit(1);}
 if(repair && process.argv.includes('--output-schema')) {process.stderr.write('unknown repair value cannot be a strict schema');process.exit(1);}
 const data=repair?{fixes:[{path:"/spec/elements/index/props/variant",value:"rows"}]}:{spec:{elements:{index:{props:{variant:"grid",title:"keep-this-title"}}}}};
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(data)}}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}));
});`);
    const revisions: unknown[]=[];
    const result=await new CodexAiClient({cliPath:executable}).complete({...spec,contract:"page_design"},pageSchema,{onRevision:fixes=>revisions.push(fixes)});
    expect(result.data.spec.elements.index.props).toEqual({variant:"rows",title:"keep-this-title"});
    expect(Object.hasOwn(result.data.spec.elements,"metrics")).toBe(false);
    expect(result.usage.inputTokens).toBe(20);expect(result.usage.outputTokens).toBe(10);
    expect(revisions).toEqual([[{path,value:"rows"}]]);
  });
  it("Zod 이후 업무 규칙 check도 필드 수정으로 처리한다", async () => {
    const executable=fakeCodex(String.raw`
let prompt="";process.stdin.setEncoding('utf8');process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{
 const data=prompt.includes('<field_repair>')?{fixes:[{path:'/summary',value:'원문 근거'}]}:{summary:'근거 없음'};
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(data)}}));
});`);
    const result=await new CodexAiClient({cliPath:executable}).complete(spec,z.object({summary:z.string()}),{check:data=>data.summary==='원문 근거'?[]:[{path:'/summary',problem:'원문의 근거에 맞게 수정하세요.'}]});
    expect(result.data.summary).toBe('원문 근거');
  });
  it("같은 잘못된 값을 다시 보내면 전체 재생성 없이 중단한다", async () => {
    const executable=fakeCodex(String.raw`
let prompt="";process.stdin.setEncoding('utf8');process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{
 const data=prompt.includes('<field_repair>')?{fixes:[{path:'/spec/elements/index/props/variant',value:'grid'}]}:{spec:{elements:{index:{props:{variant:'grid',title:'보존'}}}}};
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(data)}}));
});`);
    await expect(new CodexAiClient({cliPath:executable}).complete({...spec,contract:'page_design'},pageSchema)).rejects.toMatchObject({code:'AI_INVALID_OUTPUT',retryable:false,message:expect.stringContaining('after 1 fix rounds')});
  });
});
