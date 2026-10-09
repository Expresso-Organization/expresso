// 제품 생성기와 렌더러를 세 가상 입력에 그대로 적용합니다.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { StructuredPortfolioContentSchema } from "../../../packages/contracts/src/structured-portfolio.js";
import { StructuredPageGenerator } from "../../../services/backend/src/modules/page/structured-generator.js";
import type { AiClient } from "../../../services/backend/src/platform/ai/client.js";

const root = process.cwd();
const model = process.env.PORTFOLIO_TEST_MODEL || "qwen3.5:9b-q8_0";
const runId =
  process.env.PORTFOLIO_RUN_ID ||
  `structured-${new Date().toISOString().replace(/[:.]/g, "-")}`;
if (!/^[a-zA-Z0-9-]+$/.test(runId))
  throw new Error("실행 식별자가 올바르지 않습니다.");
const slugs = process.env.PORTFOLIO_PROFILE
  ? [process.env.PORTFOLIO_PROFILE]
  : ["robotics-engineer", "editorial-designer", "climate-analyst"];
if (
  slugs.some(
    (slug) =>
      !["robotics-engineer", "editorial-designer", "climate-analyst"].includes(
        slug,
      ),
  )
)
  throw new Error("알려진 가상 프로필이 필요합니다.");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
for (const slug of slugs) {
  const folder = path.join(
    root,
    "scripts/library/renderer/portfolio/samples/fictional-profiles",
    slug,
  );
  const sample = JSON.parse(
    fs.readFileSync(path.join(folder, "content.json"), "utf8"),
  );
  const content = StructuredPortfolioContentSchema.parse({
    version: 1,
    profile: {
      name: sample.profile.name,
      role: sample.profile.role,
      headline: sample.profile.headline,
      intro: sample.profile.intro,
      focus: sample.profile.focus,
    },
    sections: sample.projects.map((project: Record<string, any>) => ({
      id: project.id,
      title: project.title,
      summary: project.summary,
      body: "",
      pattern: "project",
      sourceIds: project.evidenceIds,
      details: [
        { label: "역할", text: project.role },
        { label: "기간", text: project.period },
        { label: "문제 정의", text: project.problem },
        { label: "담당 작업", text: project.contribution },
        { label: "결과와 한계", text: project.outcome },
      ],
      media: [
        {
          src:
            "data:image/svg+xml;base64," +
            fs
              .readFileSync(path.join(folder, project.image))
              .toString("base64"),
          alt: project.imageAlt,
          origin: "fictional",
        },
      ],
    })),
    career: sample.career,
    evidence: sample.evidence,
    contact: {
      label: sample.contact.heading.replaceAll("\n", " "),
      href: `mailto:${sample.contact.email}`,
    },
  });
  const records: unknown[] = [];
  const ai: AiClient = {
    async complete(request, schema) {
      const started = Date.now();
      // 로컬 grammar 변환기가 큰 maxLength를 처리하지 못합니다. 내용 정리는 JSON 모드로 받고 같은 Zod 계약으로 검증합니다.
      const format =
        process.env.PORTFOLIO_JSON_MODE === "1" ||
        request.system.startsWith("출처 자료")
          ? "json"
          : z.toJSONSchema(schema);
      const response = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                request.system +
                (format === "json"
                  ? `\n반환 JSON Schema: ${JSON.stringify(z.toJSONSchema(schema))}`
                  : ""),
            },
            { role: "user", content: request.prompt },
          ],
          format,
          stream: false,
          think: false,
          options: { temperature: 0.25, num_ctx: 16384, num_predict: 6000 },
        }),
        signal: AbortSignal.timeout(
          Number(process.env.PORTFOLIO_TIMEOUT_MS || 600_000),
        ),
      });
      if (!response.ok)
        throw new Error(
          `Ollama HTTP ${response.status}: ${await response.text()}`,
        );
      const output = await response.json();
      records.push({
        system: request.system,
        prompt: request.prompt,
        raw: output.message.content,
      });
      return {
        data: schema.parse(JSON.parse(output.message.content)),
        usage: {
          model,
          inputTokens: output.prompt_eval_count ?? 0,
          outputTokens: output.eval_count ?? 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: Date.now() - started,
          costUsd: null,
        },
      };
    },
  };
  const out = path.join(
    root,
    "docs/library/previews/portfolio/runs",
    runId,
    slug,
  );
  if (fs.existsSync(path.join(out, "index.html")))
    throw new Error(
      "완료된 실행을 덮어쓸 수 없습니다. 새 실행 ID를 사용하세요.",
    );
  fs.mkdirSync(out, { recursive: true });
  try {
    const normalize = process.env.PORTFOLIO_NORMALIZE === "1";
    const result = await new StructuredPageGenerator(ai).generate({
      ...(normalize
        ? { author: { name: content.profile.name } }
        : { structuredContent: content }),
      portfolioPlan: null,
      sections: normalize
        ? content.sections.map((section) => ({
            id: section.id,
            title: section.title,
            purpose: section.summary,
            goal: section.summary,
            points: section.details.map(
              (item) => `${item.label}: ${item.text}`,
            ),
            targetLength: 300,
            sourceIds: section.sourceIds,
          }))
        : [],
      evidence: normalize
        ? content.evidence.map((item) => ({
            id: item.id,
            label: item.title,
            text: [item.summary, item.body].join("\n"),
            sourceType: "record",
          }))
        : [],
      media: [],
      jobTitle: null,
      company: null,
    });
    const document = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${content.profile.name} 포트폴리오</title><style>html,body{margin:0} ${result.css}</style></head><body>${result.html}</body></html>`;
    fs.writeFileSync(path.join(out, "index.html"), document);
    fs.writeFileSync(
      path.join(out, "run.json"),
      JSON.stringify(
        {
          fictional: true,
          specOrigin: "model",
          contentOrigin: normalize ? "model-normalized" : "prepared-fictional",
          model,
          htmlSha256: sha(document),
          ...result.manifest,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(slug, result.manifest.structured?.spec.elements.page?.props);
  } finally {
    fs.writeFileSync(
      path.join(out, "model-record.json"),
      JSON.stringify(records, null, 2) + "\n",
    );
  }
}
