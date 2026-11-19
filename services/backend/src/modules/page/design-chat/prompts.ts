import { z } from "zod";
import { DesignAssistantMessageSchema, DesignDirectionSchema, DesignScreenItemSchema, DesignSnippetSchema, DesignTokensSchema, type DesignChatMessage, type DesignDirection, type DesignSnippet, type DesignTokens } from "@expresso/contracts";

import type { AiCallSpec, AiViolation } from "../../../platform/ai/client.js";
import { PageSanitizeError, sanitizeCss } from "../../../platform/html/sanitize.js";
import { isOrdinalLabel, ungroundedNumbers } from "../../../platform/numbers.js";
import { generationStyleFor, findDesignSystemRevision } from "../../design-systems/index.js";
import type { BrewPageSources } from "../brew-sources.js";
import { briefedSystem } from "../briefed-generator.js";
import { FRONTEND_DESIGN_SKILL } from "../design-skill/frontend-design.js";
import { markupProblem, promptOpening, promptSources, ungroundedEmails, type PageGenerationContext } from "../generator.js";

/**
 * 디자인을 정하는 대화의 AI 호출 네 가지 — 여는 말, 답하기, 첫 화면 그리기, 첫 화면 고치기.
 *
 * 앞의 둘은 무엇을 말하고 무엇을 띄울지 정하고(`page_design`), 뒤의 둘은 마크업과 CSS를 쓴다(`page_generation`).
 * 넷 모두 Sonnet으로 부른다. 두 계약의 기본 등급은 Opus인데, 2026-11-17에 잰 시간(첫 화면 13–34초 · 고치기 14초)은
 * Sonnet의 것이고 대화는 사람이 화면 앞에서 기다린다.
 */
const TIER = { modelTier: "sonnet" } as const;
/** 프롬프트 판. 문구를 바꾸면 올린다. */
export const DESIGN_CHAT_PROMPT_VERSION = 1;

const FONT_NAME = { sans: "고딕", serif: "명조", mono: "고정폭" } as const;
const DENSITY_NAME = { compact: "빽빽하게", comfortable: "읽기 편하게", spacious: "넓게" } as const;

/** 자료 읽기 함수의 결과를 지면 프롬프트 조각들이 받는 문맥 모양으로 옮긴다. 스타일과 그림은 싣지 않는다. */
export function sourcesContext(userId: string, sources: BrewPageSources): PageGenerationContext {
  return {
    userId,
    ...(sources.author ? { author: sources.author } : {}),
    portfolioPlan: sources.portfolioPlan,
    sections: sources.sections,
    evidence: sources.evidence,
    media: [],
    jobTitle: sources.jobTitle,
    company: sources.company,
  };
}

/** 숫자와 이메일을 대조할 출처 글. 섹션 설계에 적힌 숫자도 출처로 본다(`page-brief.ts`의 `briefGroundSource`와 같은 규칙). */
export function groundSource(sources: BrewPageSources): string {
  return [JSON.stringify(sources.sections), ...sources.evidence.map((item) => `${item.label}\n${item.text}`)].join("\n");
}

const countable = (number: string) => number.replace(/\D/g, "").length >= 2 && !isOrdinalLabel(number);

/**
 * 대화 계약이 받는 길이를 넘는 글. 모델의 출력 형식에는 글자 수를 두지 않으므로(모양만 둔다) 여기서 걸러 그 칸만 고쳐 받는다.
 * 넘는 글이 그대로 저장되면 화면이 대화를 읽을 때 계약에 걸려 그 제작의 디자인 단계가 열리지 않는다.
 */
function tooLong(path: string, value: string, schema: { safeParse(value: unknown): { success: boolean } }, name: string): AiViolation[] {
  return schema.safeParse(value).success ? [] : [{ path, problem: `${name}이(가) 너무 깁니다(${value.length}자). 더 짧게 다시 쓰세요.` }];
}
const directionLimits = (directions: DirectionDraft[]): AiViolation[] =>
  directions.flatMap((item, index) => [
    ...tooLong(`/directions/${index}/name`, item.name, DesignDirectionSchema.shape.name, "방향의 이름"),
    ...tooLong(`/directions/${index}/words`, item.words, DesignDirectionSchema.shape.words, "방향의 설명"),
  ]);

/** 첫 화면에 실을 사실. 여는 호출이 출처에서 한 번 뽑고, 첫 화면을 그리는 호출은 원문 대신 이것을 받는다. */
export const DesignHeadSchema = z.strictObject({
  role: z.string().min(1).describe("직무 한 줄"),
  headline: z.string().min(1).describe("이 사람이 무엇을 하는 사람인지 한 문장"),
  intro: z.string().describe("소개 두세 문장"),
  subject: z.string().min(1).describe("이 사람이 다루는 대상 · 도구 · 산출물을 구체적인 낱말로"),
  lead: z.array(z.string().min(1)).describe("첫 화면에 세울 만한 사실. 숫자와 단위는 출처에 적힌 글자 그대로"),
});
export type DesignHead = z.infer<typeof DesignHeadSchema>;

const DirectionDraftSchema = z.strictObject({
  name: z.string().min(1).describe("방향의 이름. 두세 낱말"),
  words: z.string().min(1).describe("이 방향을 한두 문장으로. 바탕과 강조의 색, 서체, 느낌, 그리고 그것이 이 사람의 일 어디에서 왔는지"),
  tokens: DesignTokensSchema.describe("바탕 · 글자 · 강조 색(#rrggbb), 서체 계열, 밀도"),
});
export type DirectionDraft = z.infer<typeof DirectionDraftSchema>;

const DESIGNER = "포트폴리오의 디자인을 사용자와 대화로 정하는 디자이너입니다.";
const DIRECTION_RULES = [
  "방향은 색과 서체로 보이는 견본이 됩니다. 배치는 견본에 담지 않습니다.",
  "- 색과 서체는 이 사람의 일(다루는 대상 · 도구 · 산출물)과 지원하는 곳(회사의 톤 · 브랜드 색)에서 가져옵니다. 어디서 왔는지를 `words`에 적습니다.",
  "- 바탕과 글자는 본문을 오래 읽을 수 있는 명도 차이를 둡니다. 강조는 바탕 위에서 한눈에 구분되어야 합니다.",
  "- 여러 방향을 낼 때는 바탕의 명도와 서체 계열이 서로 겹치지 않게 합니다. 사용자가 고를 수 있으려면 달라 보여야 합니다.",
].join("\n");
const SPEECH = "`say`는 사용자에게 건네는 말입니다. 존댓말로 한두 문장만 씁니다. 화면에 띄운 것을 글로 다시 풀지 않습니다.";

// ── 여는 말 ─────────────────────────────────────────────

const OPENING_SYSTEM = [
  DESIGNER,
  "지금은 대화의 첫 말을 씁니다. 출처 자료(커리어 기록 · 답변 · 공고 요건)와 섹션 설계를 읽고 세 가지를 냅니다.",
  "- `head`: 이 사람의 첫 화면에 실을 사실입니다. 출처에 없는 수치 · 성과 · 경력을 만들지 않고, 숫자와 기간은 출처에 적힌 글자 그대로 옮깁니다.",
  "- `say`: 자료에서 가장 앞세울 사실 하나를 짚고, 어떤 분위기로 보여 줄지 묻습니다.",
  "- `directions`: 서로 뚜렷이 다른 방향 셋입니다.",
  "",
  DIRECTION_RULES,
  SPEECH,
].join("\n");

export const OpeningSchema = z.strictObject({
  head: DesignHeadSchema,
  say: z.string().min(1).describe("사용자에게 건네는 첫 말"),
  directions: z.array(DirectionDraftSchema).describe("서로 다른 방향 셋"),
});
export type Opening = z.infer<typeof OpeningSchema>;

export function openingCall(userId: string, sources: BrewPageSources): { spec: AiCallSpec; check(output: Opening): AiViolation[] } {
  const context = sourcesContext(userId, sources);
  const source = groundSource(sources);
  const prompt = [
    ...promptOpening(context),
    ...promptSources(context),
    "## 낼 것",
    "`head` · `say` · `directions`를 이 순서로 냅니다.",
  ].join("\n");
  return {
    spec: { contract: "page_design", system: OPENING_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check(output) {
      const violations: AiViolation[] = [];
      const prose = (path: string, value: string, name: string) => {
        const numbers = ungroundedNumbers(value, source).filter(countable);
        if (numbers.length) violations.push({ path, problem: `${name}에 출처에 없는 숫자가 있습니다: ${numbers.join(", ")}. 출처에 적힌 숫자로 고치거나 그 숫자가 든 문장을 빼세요.` });
      };
      prose("/head/headline", output.head.headline, "한 줄 소개");
      prose("/head/intro", output.head.intro, "소개");
      prose("/head/lead", output.head.lead.join("\n"), "앞세울 사실");
      prose("/say", output.say, "첫 말");
      if (output.directions.length === 0) violations.push({ path: "/directions", problem: "방향이 하나도 없습니다. 서로 다른 방향 셋을 내세요." });
      violations.push(...tooLong("/say", output.say, DesignAssistantMessageSchema.shape.text, "첫 말"), ...directionLimits(output.directions));
      return violations;
    },
  };
}

/** `head`를 첫 화면을 그리는 호출이 읽을 글로 편다. */
export function headPrompt(head: DesignHead): string[] {
  return [
    "## 이 사람 — 출처에서 뽑아 숫자의 대조를 마쳤다. 첫 화면의 내용은 여기서만 가져온다",
    `- 직무: ${head.role}`,
    `- 한 줄: ${head.headline}`,
    ...(head.intro ? [`- 소개: ${head.intro}`] : []),
    `- 다루는 것: ${head.subject}`,
    "",
    ...(head.lead.length ? ["### 첫 화면에 세울 만한 것", ...head.lead.map((fact) => `- ${fact}`), ""] : []),
  ];
}

// ── 답하기 ─────────────────────────────────────────────

const REPLY_SYSTEM = [
  DESIGNER,
  "사용자의 말에 답합니다. 답은 말(`say`)과 화면에 띄울 것(`show`) 하나입니다.",
  "",
  "## 무엇을 띄우는가",
  "- `directions` — 견본. 색과 서체만 보이고 바로 뜹니다. 사용자가 방향을 넓게 보고 싶어 하거나, 원하는 것이 아직 좁혀지지 않았을 때 씁니다.",
  "- `screens` — 첫 화면. 이 사람의 자료로 그린 포트폴리오 맨 위 한 장면이고 한 장에 20초쯤 걸립니다. 사용자가 스타일을 구체적으로 말했거나, 방향을 하나로 좁혔거나, 실제 모습을 보여 달라고 했을 때 씁니다.",
  "- `revision` — 대상으로 붙은 첫 화면을 고칩니다. 사용자가 그 첫 화면의 한 부분을 바꿔 달라고 했을 때 씁니다. `instruction`에 무엇을 어떻게 바꿀지 한 문장으로 옮깁니다. 대상 첫 화면이 없으면 쓰지 않습니다.",
  "- `none` — 띄울 것이 없습니다. 되물어야 뜻을 알 수 있거나 말로만 답하면 될 때 씁니다.",
  "",
  "`directions` 목록은 `show`가 `directions`나 `screens`일 때만 채웁니다. 사용자가 말한 스타일을 옮긴 방향은 `source`를 `user`로, 내가 제안하는 방향은 `agent`로 적습니다.",
  "대상이 견본이면 그 견본의 색과 서체에서 출발합니다. 대상이 카탈로그의 디자인이면 그 디자인의 색과 서체를 그대로 씁니다.",
  "",
  DIRECTION_RULES,
  SPEECH,
].join("\n");

export const ReplySchema = z.strictObject({
  say: z.string().min(1).describe("사용자에게 건네는 말"),
  show: z.enum(["none", "directions", "screens", "revision"]),
  directions: z.array(DirectionDraftSchema.extend({ source: z.enum(["agent", "user"]) })).describe("견본으로 보이거나 첫 화면으로 그릴 방향. 띄울 것이 없으면 빈 목록"),
  instruction: z.string().describe("`revision`일 때 고칠 내용 한 문장. 아니면 빈 글"),
});
export type Reply = z.infer<typeof ReplySchema>;

/** 답하는 호출이 읽는, 말이 가리킨 대상. */
export type ReplySubject =
  | { kind: "direction"; direction: DesignDirection }
  | { kind: "snippet"; snippet: DesignSnippet }
  | { kind: "catalog"; direction: DirectionDraft };

const tokensLine = (tokens: DesignTokens) => `바탕 ${tokens.background} · 글자 ${tokens.text} · 강조 ${tokens.accent} · ${FONT_NAME[tokens.font]} · ${DENSITY_NAME[tokens.density]}`;

/** 지금까지의 대화를 글로 편다. 카드는 이름과 값만 적는다 — 마크업은 싣지 않는다. */
export function transcript(messages: DesignChatMessage[], snippets: DesignSnippet[]): string[] {
  const snippet = (id: string | null) => snippets.find((item) => item.id === id);
  return messages.flatMap((message) => {
    if (message.role === "user") {
      const subject = message.subjects.map(({ kind, name }) => `${kind === "direction" ? "견본" : kind === "snippet" ? "첫 화면" : "카탈로그의 디자인"} 「${name}」`).join(" · ");
      const said = message.action === "say" ? message.text : message.action === "draw" ? "(견본을 눌러 첫 화면을 청함)" : "(카탈로그의 디자인을 골라 첫 화면을 청함)";
      return [`사용자: ${said}${subject ? ` [대상: ${subject}]` : ""}`];
    }
    const lines = message.text ? [`디자이너: ${message.text}`] : [];
    if (message.card?.kind === "directions") lines.push(...message.card.directions.map((item) => `  [견본 「${item.name}」 — ${item.words} (${tokensLine(item.tokens)})]`));
    if (message.card?.kind === "screens")
      lines.push(...message.card.items.map((item) => `  [첫 화면 「${snippet(item.snippetId)?.name ?? item.name}」 — ${item.words} (${tokensLine(snippet(item.snippetId)?.tokens ?? item.tokens)})${item.status === "failed" ? " 그리지 못함" : ""}]`));
    if (message.card?.kind === "revision") {
      const after = snippet(message.card.item.snippetId);
      lines.push(`  [첫 화면 「${snippet(message.card.fromSnippetId)?.name ?? "?"}」을 고침 → 「${after?.name ?? message.card.item.name}」 — ${message.card.item.words}]`);
    }
    return lines;
  });
}

export function replyCall(input: {
  userId: string;
  sources: BrewPageSources;
  head: DesignHead;
  messages: DesignChatMessage[];
  snippets: DesignSnippet[];
  text: string;
  subject: ReplySubject | null;
  selected: DesignSnippet | null;
}): { spec: AiCallSpec; check(output: Reply): AiViolation[] } {
  const context = sourcesContext(input.userId, input.sources);
  const subject = input.subject;
  const prompt = [
    ...promptOpening(context),
    ...headPrompt(input.head),
    "## 지금까지의 대화",
    ...transcript(input.messages, input.snippets),
    "",
    ...(input.selected ? [`사용자가 지금 고른 첫 화면: 「${input.selected.name}」`, ""] : []),
    "## 사용자의 말",
    input.text,
    ...(subject
      ? [
          "",
          "## 이 말의 대상",
          subject.kind === "snippet"
            ? `첫 화면 「${subject.snippet.name}」 — ${subject.snippet.words} (${tokensLine(subject.snippet.tokens)})`
            : `${subject.kind === "direction" ? "견본" : "카탈로그의 디자인"} 「${subject.direction.name}」 — ${subject.direction.words} (${tokensLine(subject.direction.tokens)})`,
        ]
      : []),
  ].join("\n");
  return {
    spec: { contract: "page_design", system: REPLY_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check(output) {
      const violations: AiViolation[] = [];
      if ((output.show === "directions" || output.show === "screens") && output.directions.length === 0)
        violations.push({ path: "/directions", problem: `\`show\`가 ${output.show}인데 방향이 없습니다. 띄울 방향을 적거나 \`show\`를 none으로 바꾸세요.` });
      if (output.show === "revision" && subject?.kind !== "snippet")
        violations.push({ path: "/show", problem: "고칠 대상 첫 화면이 붙어 있지 않습니다. 새로 그릴 것이면 `screens`로, 아니면 `none`으로 바꾸세요." });
      if (output.show === "revision" && !output.instruction.trim()) violations.push({ path: "/instruction", problem: "무엇을 어떻게 바꿀지 한 문장으로 적으세요." });
      violations.push(
        ...tooLong("/say", output.say, DesignAssistantMessageSchema.shape.text, "말"),
        ...tooLong("/instruction", output.instruction, DesignScreenItemSchema.shape.words, "고칠 내용"),
        ...directionLimits(output.directions),
      );
      return violations;
    },
  };
}

// ── 첫 화면 그리기 · 고치기 ────────────────────────────────

/** 첫 화면 한 장면의 출력. 키 순서가 쓰는 순서다 — CSS를 마크업보다 먼저 쓴다. */
export const SnippetDraftSchema = z.strictObject({
  name: z.string().min(1).describe("이 스타일의 짧은 이름. 두세 낱말"),
  note: z.string().min(1).describe("사용자에게 건네는 한 문장. 이 첫 화면에서 무엇을 앞에 세웠는지. 존댓말"),
  tokens: DesignTokensSchema.describe("쓴 바탕 · 글자 · 강조 색(#rrggbb)과 서체 계열 · 밀도"),
  css: z.string().min(1),
  html: z.string().min(1),
});
export type SnippetDraft = z.infer<typeof SnippetDraftSchema>;

const SNIPPET_SYSTEM = briefedSystem(FRONTEND_DESIGN_SKILL, {
  planLine: "- 지침의 계획 → 검토는 쓰기 전에 마치고, 그 계획대로 `css`와 `html`을 쓴다. 화면을 찍어 볼 수는 없다.",
  order: [
    "## 내는 순서",
    "- `name` — 이 스타일의 짧은 이름.",
    "- `note` — 사용자에게 건네는 한 문장.",
    "- `tokens` — 쓴 바탕 · 글자 · 강조 색과 서체 계열 · 밀도.",
    "- `css` — 스타일 전부를 먼저 쓴다. 뒤에 올 마크업의 클래스 이름을 여기서 정해 둔다.",
    "- `html` — 위에서 정한 클래스로 첫 화면의 마크업을 쓴다.",
  ].join("\n"),
});

const FIRST_SCREEN = [
  "## 만들 것",
  "이 사람 포트폴리오의 **첫 화면 한 장면만** 만든다. 이름 · 한 줄 소개 · 대표 사실 하나다. 나머지 섹션은 쓰지 않는다.",
  "- 화면 폭 1440px에서 높이 720px 안에 들어오게 한다. 지면 바탕색은 `body`에 주고, 첫 화면은 화면 폭 전체를 쓴다.",
  "- 첫 화면은 `<header>`나 `<section>` 하나로 쓴다. 지면 전체를 감싸는 틀(`<main>`이나 바깥 `<div>`)을 두지 않는다 — 고르면 이 첫 화면 바로 뒤에 나머지 섹션이 이어 붙는다.",
  "- 클래스 이름은 뒤에 붙을 섹션이 이어 쓸 수 있게 역할로 짓는다.",
];

function snippetCheck(source: string) {
  return (draft: SnippetDraft): AiViolation[] => {
    const problem = markupProblem(draft.html, false);
    if (problem) return [{ path: "/html", problem }];
    const long = [...tooLong("/name", draft.name, DesignSnippetSchema.shape.name, "이름"), ...tooLong("/note", draft.note, DesignSnippetSchema.shape.note, "건네는 말")];
    if (long.length) return long;
    // 소독기가 거절하는 CSS 구문(`@import` 등)은 여기서 걸러 그 칸만 고쳐 받는다. 그대로 두면 다 그린 첫 화면을 저장하지 못한다
    // (2026-11-19 실제 호출: 둥근 서체를 `@import`로 불러 한 장이 실패했다).
    try {
      sanitizeCss(draft.css);
    } catch (error) {
      if (!(error instanceof PageSanitizeError)) throw error;
      return [{ path: "/css", problem: `${error.message}. 그 구문을 지운 CSS 전체를 보내세요. 서체가 필요하면 \`html\`에서 \`<link rel="stylesheet">\`로 부릅니다.` }];
    }
    return ungroundedEmails(draft.html, source).map((email) => ({
      path: "/html",
      problem: `근거에 없는 이메일 ${email}이 첫 화면에 있습니다. 이 사람의 연락처가 아닙니다. 그 이메일이 든 줄을 지우고 다른 주소로 바꾸지 마세요.`,
    }));
  };
}

export function drawCall(input: { userId: string; sources: BrewPageSources; head: DesignHead; direction: DirectionDraft }): { spec: AiCallSpec; check(output: SnippetDraft): AiViolation[] } {
  const { direction } = input;
  const prompt = [
    ...promptOpening(sourcesContext(input.userId, input.sources)),
    "## 사용자가 고른 스타일 — 색 · 서체 · 밀도는 그대로 따른다",
    `고른 것: **${direction.name}** — ${direction.words}`,
    `- 바탕 \`${direction.tokens.background}\` · 본문 글자 \`${direction.tokens.text}\` · 강조 \`${direction.tokens.accent}\`. 명도를 조절한 변주는 만들어 써도 되고, 계열 밖의 색은 들이지 않는다.`,
    `- 서체 계열: ${FONT_NAME[direction.tokens.font]}. 한국어 대체 서체를 함께 지정한다.`,
    `- 밀도: ${DENSITY_NAME[direction.tokens.density]}.`,
    "배치 · 단 구성 · 첫 화면의 모양은 스타일이 정하지 않았다. 이 사람의 자료를 보고 정한다.",
    "",
    ...headPrompt(input.head),
    ...FIRST_SCREEN,
  ].join("\n");
  return {
    spec: { contract: "page_generation", system: SNIPPET_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check: snippetCheck(groundSource(input.sources)),
  };
}

export function reviseCall(input: { userId: string; sources: BrewPageSources; snippet: Pick<DesignSnippet, "html" | "css">; instruction: string }): { spec: AiCallSpec; check(output: SnippetDraft): AiViolation[] } {
  const prompt = [
    ...promptOpening(sourcesContext(input.userId, input.sources)),
    "## 지금 첫 화면 — 사용자가 채팅에서 보고 있는 것이다",
    "```html",
    input.snippet.html,
    "```",
    "```css",
    input.snippet.css,
    "```",
    "",
    "## 지시",
    input.instruction,
    "지시가 가리킨 것만 바꾸고 나머지 마크업 · CSS · 클래스 이름은 그대로 둔다. 고친 첫 화면 전체를 낸다.",
    "`name`과 `tokens`도 고친 결과에 맞게 적고, `note`에는 무엇을 바꿨는지 한 문장으로 적는다.",
  ].join("\n");
  return {
    spec: { contract: "page_generation", system: SNIPPET_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check: snippetCheck(groundSource(input.sources)),
  };
}

/**
 * 카탈로그의 디자인 판을 방향으로 옮긴다. 색 · 서체 · 밀도는 그 판으로 생성할 때 쓰는 값과 같다(`generationStyleFor`).
 * 판이 없거나 색이 #rrggbb가 아니면 null이다.
 */
export function catalogDirection(revisionId: string): DirectionDraft | null {
  const revision = findDesignSystemRevision(revisionId);
  if (!revision) return null;
  const { spec } = revision;
  const tokens = DesignTokensSchema.safeParse(
    (({ background, text, accent, font, density }) => ({ background, text, accent, font, density }))(generationStyleFor(revision).styleOverrides),
  );
  if (!tokens.success) return null;
  return {
    name: spec.identity.name,
    words: `카탈로그의 「${spec.identity.name}」 디자인. ${spec.identity.visualThesis}. 제목 서체 ${spec.typography.display.family}(${spec.typography.display.fallback}).`,
    tokens: tokens.data,
  };
}
