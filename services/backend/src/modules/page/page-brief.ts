import { z } from "zod";

import type { AiClient, AiUsage, AiViolation } from "../../platform/ai/client.js";
import { isOrdinalLabel, ungroundedNumbers } from "../../platform/numbers.js";
import { metricBeforeGrounded, metricUnitsAgree, metricValueAllowed } from "./design-first.js";
import type { PageGenerationContext } from "./generator.js";

/**
 * 자유 생성에 넘기는 자료 정리본.
 *
 * 자유 생성은 기록 원문과 설계안 JSON을 그대로 받아, 한 번의 호출이 내용 정리와 지면 디자인을 함께 합니다. 그 결과 지면이
 * 이름 · 경력 · 근거를 빠뜨렸습니다(2026-10-16 비교). 여기서는 지면을 쓰기 전에 원문에서 사실을 뽑아 정리합니다.
 *
 * 정리본은 지면의 칸이 아닙니다. 섹션마다 주장 한 줄과 서술을 두고, 수치 · 단계 · 인용은 있을 때만 따로 적습니다. 어떤 모양으로
 * 보일지는 지면을 쓰는 호출이 정합니다.
 */

const MetricSchema = z.object({
  label: z.string().min(1).describe("무엇의 수치인지"),
  value: z.string().min(1).describe("숫자와 단위. 출처에 적힌 글자 그대로"),
  before: z.string().min(1).optional().describe("같은 수치의 이전 값. 출처에 함께 적혀 있을 때만"),
  note: z.string().optional().describe("조건이나 측정 방법 한 줄"),
});

export function pageBriefSchema(sectionIds: [string, ...string[]]) {
  return z.object({
    role: z.string().min(1).describe("직무 한 줄"),
    headline: z.string().min(1).describe("이 사람이 무엇을 하는 사람인지 한 문장"),
    intro: z.string().describe("소개 두세 문장"),
    focus: z.array(z.string().min(1)).describe("집중 분야 낱말"),
    subject: z.string().min(1).describe("이 사람이 다루는 대상 · 도구 · 산출물을 구체적인 낱말로"),
    lead: z.array(z.object({ sectionId: z.enum(sectionIds), what: z.string().min(1) })).describe("첫 화면에 세울 만한 사실"),
    sections: z.array(
      z.object({
        id: z.enum(sectionIds),
        title: z.string().min(1),
        claim: z.string().min(1).describe("이 섹션의 주장 한 줄"),
        body: z.string().describe("출처에서 옮긴 서술"),
        period: z.string().optional().describe("출처에 적힌 기간 그대로"),
        metrics: z.array(MetricSchema).optional(),
        steps: z.array(z.object({ label: z.string().min(1), text: z.string() })).optional().describe("출처에 순서가 있는 과정일 때만"),
        quote: z.string().optional().describe("그대로 크게 보일 만한 한 문장"),
        details: z.array(z.object({ label: z.string().min(1), text: z.string().min(1) })).optional().describe("역할 · 도구 · 기술 같은 이름표와 설명"),
        media: z.array(z.string()).optional().describe("이 섹션에 쓸 그림 주소"),
        made: z.string().optional().describe("이 일이 만든 것의 생김새를 구체적인 낱말로"),
      }),
    ),
    flagship: z.object({ sectionId: z.enum(sectionIds), why: z.string().min(1).describe("공고와 맞닿는 까닭 한 줄") }).optional().describe("대표 사례 하나"),
    career: z.array(z.object({ period: z.string(), organization: z.string().min(1), role: z.string(), description: z.string() })),
    evidence: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), kind: z.string(), summary: z.string() })),
  });
}

export type PageBrief = z.infer<ReturnType<typeof pageBriefSchema>>;

export const BRIEF_SYSTEM = [
  "포트폴리오 지면을 만들 디자이너에게 넘길 자료 정리본을 씁니다.",
  "출처 자료(커리어 기록 · 답변 · 공고 요건)와 섹션 설계를 읽고, 지면에 실을 내용을 사실 단위로 정리합니다. 지면의 모양은 정하지 않습니다.",
  "출처에 없는 수치 · 성과 · 경력 · 회사 · 프로젝트를 만들지 않습니다. 숫자와 기간은 출처에 적힌 글자 그대로 옮깁니다.",
  "'~하였습니다', '~라고 할 수 있습니다'를 쓰지 않고, 한 일과 결과를 짧은 문장으로 씁니다.",
].join("\n");

/** 섹션 ID와 근거 ID입니다. 문맥에 ID가 없으면 순서로 붙입니다(`design-first.ts`의 `rawInput`과 같은 규칙). */
export function briefIds(context: PageGenerationContext) {
  return {
    sections: context.sections.map((section, index) => section.id ?? `section-${index + 1}`),
    evidence: context.evidence.map((item, index) => item.id ?? `source-${index + 1}`),
  };
}

/** 수치 · 기간을 대조할 출처 글입니다. 섹션 설계에 적힌 숫자도 출처로 봅니다. */
export function briefGroundSource(context: PageGenerationContext): string {
  return [JSON.stringify(context.sections), ...context.evidence.map((item) => `${item.label}\n${item.text}`)].join("\n");
}

export function briefRequest(context: PageGenerationContext): string {
  const ids = briefIds(context);
  const lines: string[] = [];
  lines.push("## 누구의 지면");
  lines.push(context.author?.name.trim() ? `이름: ${context.author.name.trim()}` : "이름을 받지 않았다.");
  lines.push("");
  if (context.company || context.jobTitle) {
    lines.push("## 어디에 내는가");
    lines.push([context.company?.name, context.company?.industry ? `(${context.company.industry})` : "", context.jobTitle ? `· ${context.jobTitle}` : ""].filter(Boolean).join(" "));
    lines.push("");
  }
  lines.push(`## 섹션 설계 ${context.sections.length}개`);
  for (const [index, section] of context.sections.entries()) {
    lines.push(`### ${ids.sections[index]} — ${section.title}`);
    lines.push(`- 목적: ${section.purpose}`);
    if (section.goal) lines.push(`- 남길 것: ${section.goal}`);
    if (section.points.length) lines.push(`- 다룰 것: ${section.points.join(" · ")}`);
    lines.push(`- 분량: 약 ${section.targetLength}자`);
    if (section.sourceIds?.length) lines.push(`- 출처: ${section.sourceIds.join(", ")}`);
  }
  lines.push("");
  lines.push(`## 출처 ${context.evidence.length}개`);
  for (const [index, entry] of context.evidence.entries()) {
    lines.push(`### [${ids.evidence[index]}] ${entry.label}`);
    lines.push(entry.text);
    lines.push("");
  }
  if (context.media.length) {
    lines.push("## 쓸 수 있는 그림");
    for (const asset of context.media) lines.push(`- ${asset.src} — ${asset.alt}`);
    lines.push("");
  }
  lines.push("## 정리하는 법");
  lines.push("- role · headline · intro · focus: 출처에서 읽히는 직무와 강점입니다. headline은 한 문장입니다.");
  lines.push("- subject: 이 사람이 실제로 다루는 대상 · 도구 · 산출물을 낱말로 적습니다(예: 결제 대시보드, 번들 크기, 배치 파이프라인, 설문 응답). 디자이너가 지면의 시각 소재를 여기서 고릅니다.");
  lines.push("- lead: 첫 화면에 세울 만한 사실을 한 개에서 세 개 고릅니다. 이 사람을 다른 지원자와 가르는 것을 고르고, 어느 섹션의 것인지 적습니다.");
  lines.push("- sections: 설계의 모든 섹션을 한 번씩, 설계 순서대로 적습니다. id는 위의 섹션 ID 그대로입니다.");
  lines.push("  - claim은 그 섹션이 말하려는 것 한 줄입니다. 섹션 이름을 되풀이하지 않고 '새벽 4시 배치가 오전 업무까지 밀리던 문제'처럼 내용을 씁니다.");
  lines.push("  - body는 문제 · 한 일 · 결과가 드러나는 서술입니다. 분량은 설계의 분량 안팎입니다.");
  lines.push("  - 모든 칸에는 지면에 그대로 실을 글만 씁니다. 설계가 다루라고 한 내용이 출처에 없으면 출처가 받쳐 주는 데까지만 쓰고, 그만큼 짧아도 됩니다. 확인 요청이나 작업 메모는 어느 칸에도 쓰지 않습니다.");
  lines.push("  - metrics는 출처에 적힌 수치만 적습니다. value는 숫자와 단위이고, 같은 수치의 이전 값이 출처에 함께 있으면 before에 적습니다.");
  lines.push("  - steps는 출처에 순서가 있는 과정일 때만, quote는 그대로 크게 보일 만한 문장이 있을 때만 적습니다. 없으면 그 칸을 뺍니다.");
  lines.push("  - period는 출처에 적힌 기간 그대로입니다. 출처에 없으면 뺍니다.");
  lines.push("  - made는 그 일이 만든 것의 생김새를 구체적인 낱말로 적습니다(예: 서버 · 클라이언트로 나뉜 상품 상세 화면, 10만 행 정산 표, 토큰부터 문서 사이트까지의 컴포넌트 묶음). 디자이너가 그 섹션의 그림을 여기서 고릅니다. 사례가 아닌 섹션은 뺍니다.");
  lines.push("- flagship: 사례 섹션 가운데 공고가 찾는 것과 가장 맞닿은 하나를 대표 사례로 고르고, 까닭을 한 줄로 적습니다. 대표 사례의 body는 문제(왜 문제였는지와 그 근거) · 접근(무엇을 판단해 어떻게 했는지) · 결과를 출처가 받쳐 주는 만큼 자세히 쓰고, steps · metrics · details도 출처에 있는 만큼 채웁니다. 다른 사례는 claim과 짧은 body로 충분합니다. 사례 섹션이 없으면 뺍니다.");
  lines.push("- career: 출처에 있는 경력만 적습니다. 없으면 빈 목록입니다.");
  lines.push("- evidence: 출처 자료마다 한 줄씩, id는 위의 대괄호 안 ID 그대로입니다.");
  return lines.join("\n");
}

const countable = (number: string) => number.replace(/\D/g, "").length >= 2 && !isOrdinalLabel(number);

/** 정리본이 섹션을 모두 한 번씩 담았는지, 숫자 · 기간 · 그림 주소가 출처에 있는지 봅니다. */
export function briefViolations(brief: PageBrief, context: PageGenerationContext): AiViolation[] {
  const ids = briefIds(context);
  const source = briefGroundSource(context);
  const violations: AiViolation[] = [];
  const seen = brief.sections.map((section) => section.id);
  const missing = ids.sections.filter((id) => !seen.includes(id));
  const repeated = [...new Set(seen.filter((id, index) => seen.indexOf(id) !== index))];
  if (missing.length || repeated.length)
    violations.push({
      path: "/sections",
      problem: `설계의 모든 섹션을 한 번씩 적어야 합니다.${missing.length ? ` 빠진 섹션: ${missing.join(", ")}.` : ""}${repeated.length ? ` 두 번 적은 섹션: ${repeated.join(", ")}.` : ""}`,
    });
  const media = new Set(context.media.map((asset) => asset.src));
  const prose = (path: string, value: string | undefined, name: string) => {
    const numbers = value ? ungroundedNumbers(value, source).filter(countable) : [];
    if (numbers.length) violations.push({ path, problem: `${name}에 출처에 없는 숫자가 있습니다: ${numbers.join(", ")}. 출처에 적힌 숫자로 고치거나 그 숫자가 든 문장을 빼세요.` });
  };
  const period = (path: string, value: string | undefined) => {
    const numbers = value ? ungroundedNumbers(value, source) : [];
    if (numbers.length) violations.push({ path, problem: `기간에 출처에 없는 숫자가 있습니다: ${numbers.join(", ")}. 출처에 적힌 기간을 그 글자 그대로 쓰고, 출처에 없으면 비우세요.` });
  };
  prose("/headline", brief.headline, "한 줄 소개");
  prose("/intro", brief.intro, "소개");
  brief.sections.forEach((section, index) => {
    const base = `/sections/${index}`;
    prose(`${base}/claim`, section.claim, "주장");
    prose(`${base}/made`, section.made, "만든 것");
    prose(`${base}/body`, section.body, "서술");
    period(`${base}/period`, section.period);
    const metrics = section.metrics ?? [];
    const ungrounded = metrics.flatMap((metric, at) => {
      const numbers = ungroundedNumbers([metric.value, metric.before ?? ""].join(" "), source);
      return numbers.length ? [`${at}번(${numbers.join(", ")})`] : [];
    });
    if (ungrounded.length)
      violations.push({ path: `${base}/metrics`, problem: `출처에 없는 숫자가 있습니다: ${ungrounded.join(", ")}. 출처에 적힌 숫자로 고치고, 맞는 숫자가 없는 수치는 빼서 metrics 목록 전체를 보내세요.` });
    const madeUp = metrics.flatMap((metric, at) => (metricBeforeGrounded(metric, source) ? [] : [`${at}번(${metric.before})`]));
    if (madeUp.length)
      violations.push({ path: `${base}/metrics`, problem: `이전 값이 출처에 적혀 있지 않습니다: ${madeUp.join(", ")}. 그 수치의 before를 빼서 metrics 목록 전체를 보내세요.` });
    metrics.forEach((metric, at) => {
      for (const key of ["value", "before"] as const) {
        const value = metric[key];
        if (value !== undefined && !metricValueAllowed(value, source))
          violations.push({ path: `${base}/metrics/${at}/${key}`, problem: "수치 값은 숫자와 단위, 또는 출처에 적힌 낱말 하나만 씁니다(예: 1.9초, 420KB, 반나절). 무엇의 수치인지는 label에, 설명은 note에 씁니다." });
      }
      if (!metricUnitsAgree(metric))
        violations.push({ path: `${base}/metrics/${at}/value`, problem: `이전 값(${metric.before})과 값(${metric.value})이 서로 다른 것을 잽니다. 출처에서 같은 수치의 이전 · 이후를 옮겨 쓰세요.` });
    });
    const unknown = (section.media ?? []).filter((src) => !media.has(src));
    if (unknown.length) violations.push({ path: `${base}/media`, problem: `받지 않은 그림 주소입니다: ${unknown.join(", ")}. 「쓸 수 있는 그림」의 주소만 쓰세요.` });
  });
  brief.career.forEach((item, index) => period(`/career/${index}/period`, item.period));
  const unknownEvidence = brief.evidence.filter((item) => !ids.evidence.includes(item.id)).map((item) => item.id);
  if (unknownEvidence.length) violations.push({ path: "/evidence", problem: `출처에 없는 근거 ID입니다: ${unknownEvidence.join(", ")}. 출처의 대괄호 안 ID만 쓰세요.` });
  return violations;
}

/** 원문에서 자료 정리본을 만듭니다. 검사에 걸린 칸은 같은 대화에서 그 칸만 고쳐 받습니다. */
export async function refinePageBrief(
  ai: AiClient,
  context: PageGenerationContext,
  promptVersion: number,
  /** 정리하는 동안의 생각 신호를 받을 곳입니다. 지면이 쓰이기 전의 침묵을 화면이 「멈춤」과 구분하게 합니다. */
  onThinking?: (tokens: number) => void,
): Promise<{ brief: PageBrief; usage: AiUsage; prompt: string }> {
  const ids = briefIds(context);
  if (!ids.sections.length) throw new Error("정리할 섹션이 없습니다");
  const prompt = briefRequest(context);
  const { data, usage } = await ai.complete(
    // 정리는 원문에서 사실을 옮겨 적는 일이라 칸 채우기와 같은 계약 · 같은 모델 등급을 씁니다.
    { contract: "page_fill", system: BRIEF_SYSTEM, prompt, promptVersion },
    pageBriefSchema(ids.sections as [string, ...string[]]),
    { userId: context.userId, check: (output) => briefViolations(output, context), ...(onThinking ? { onThinking } : {}) },
  );
  return { brief: data, usage, prompt };
}

/** 정리본을 지면을 쓰는 호출이 읽을 글로 폅니다. */
export function briefPrompt(brief: PageBrief): string[] {
  const lines: string[] = [];
  lines.push("## 자료 정리본 — 출처에서 뽑아 숫자와 기간의 대조를 마쳤다. 지면의 내용은 여기서만 가져온다");
  lines.push("### 사람");
  lines.push(`- 직무: ${brief.role}`);
  lines.push(`- 한 줄: ${brief.headline}`);
  if (brief.intro) lines.push(`- 소개: ${brief.intro}`);
  if (brief.focus.length) lines.push(`- 집중 분야: ${brief.focus.join(" · ")}`);
  lines.push(`- 다루는 것: ${brief.subject}`);
  lines.push("");
  if (brief.lead.length) {
    lines.push("### 첫 화면에 세울 만한 것");
    for (const item of brief.lead) lines.push(`- ${item.what} (${brief.sections.find((section) => section.id === item.sectionId)?.title ?? item.sectionId})`);
    lines.push("");
  }
  const flagship = brief.flagship ? brief.sections.find((section) => section.id === brief.flagship!.sectionId) : undefined;
  if (flagship) {
    lines.push(`### 대표 사례 — ${flagship.title}`);
    lines.push(`공고와 맞닿는 까닭: ${brief.flagship!.why}`);
    lines.push("");
  }
  lines.push(`### 섹션 ${brief.sections.length}개 — 모두 지면에 싣는다`);
  for (const [index, section] of brief.sections.entries()) {
    lines.push(`#### ${index + 1}. ${section.title}${section.period ? ` (${section.period})` : ""}${section === flagship ? " — 대표 사례" : ""}`);
    lines.push(`주장: ${section.claim}`);
    if (section.made) lines.push(`만든 것: ${section.made}`);
    if (section.body) lines.push(section.body);
    for (const metric of section.metrics ?? [])
      lines.push(`- 수치 · ${metric.label}: ${metric.before ? `${metric.before} → ` : ""}${metric.value}${metric.note ? ` (${metric.note})` : ""}`);
    if (section.steps?.length) lines.push(`- 과정: ${section.steps.map((step, at) => `${at + 1}) ${step.label}${step.text ? ` — ${step.text}` : ""}`).join(" / ")}`);
    if (section.quote) lines.push(`- 인용: "${section.quote}"`);
    for (const detail of section.details ?? []) lines.push(`- ${detail.label}: ${detail.text}`);
    for (const src of section.media ?? []) lines.push(`- 그림: \`${src}\``);
    lines.push("");
  }
  if (brief.career.length) {
    lines.push("### 경력 — 지면에 싣는다");
    for (const item of brief.career) lines.push(`- ${[item.period, item.organization, item.role].filter(Boolean).join(" · ")}${item.description ? ` — ${item.description}` : ""}`);
    lines.push("");
  }
  if (brief.evidence.length) {
    lines.push("### 근거 자료 — 지면에 목록으로 싣는다");
    for (const item of brief.evidence) lines.push(`- ${item.title}${item.kind ? ` (${item.kind})` : ""}${item.summary ? ` — ${item.summary}` : ""}`);
    lines.push("");
  }
  return lines;
}
