import { z } from "zod";
import {
  DESIGN_LAYOUT_BLOCK_KINDS,
  DESIGN_LAYOUT_GRID,
  DesignAssistantMessageSchema,
  DesignLayoutBlockSchema,
  DesignLayoutSpecSchema,
  DesignScreenItemSchema,
  DesignSnippetSchema,
  DesignStyleSchema,
  DesignTokensSchema,
  pagePolicyPrompt,
  type DesignChatMessage,
  type DesignLayoutBlock,
  type DesignLayoutSpec,
  type DesignSnippet,
  type DesignTokens, type DesignGraphic } from "@expresso/contracts";

import type { AiCallSpec, AiViolation } from "../../../platform/ai/client.js";
import { PageSanitizeError, sanitizeCss } from "../../../platform/html/sanitize.js";
import { isOrdinalLabel, ungroundedNumbers } from "../../../platform/numbers.js";
import { generationStyleFor, findDesignSystemRevision } from "../../design-systems/index.js";
import type { BrewPageSources } from "../brew-sources.js";
import { briefedSystem } from "../briefed-generator.js";
import { designRules } from "../design-rules.js";
import { FRONTEND_DESIGN_SKILL } from "../design-skill/frontend-design.js";
import { markupProblem, promptOpening, promptSources, ungroundedEmails, type PageGenerationContext } from "../generator.js";

/**
 * 디자인을 정하는 대화의 AI 호출 네 가지 — 여는 말, 답하기, 첫 화면 그리기, 첫 화면 고치기.
 *
 * 앞의 둘은 무엇을 말하고 무엇을 띄울지 정하고(`page_design`), 뒤의 둘은 마크업과 CSS를 쓴다(`page_generation`) —
 * 그리는 호출은 첫 화면 전체를, 고치는 호출은 바뀌는 자리만 쓴다.
 * 넷 모두 Sonnet으로 부른다. 두 계약의 기본 등급은 Opus인데 대화는 사람이 화면 앞에서 기다린다.
 *
 * 지시는 **Do와 Do not**으로 적는다. 2026-11-19에 사용자가 목록을 보고 확정한 것이다 — 말(사람에게 건네는 말),
 * 제안(스타일과 레이아웃을 따로), 디자인(`../design-rules.ts`), 사실. 문구를 고칠 때는 그 목록의 뜻을 지킨다.
 */
const TIER = { modelTier: "sonnet" } as const;
/** 프롬프트 판. 문구를 바꾸면 올린다. 2: Do와 Do not, 스타일과 레이아웃을 따로 제안(2026-11-19). 4: 추상 그래픽과 그림 스크립트(2026-11-20). 5: 형태 · 흐름 · 밀도, 수치는 한 줄(같은 날). 6: 3D 형태 · 재질 · 빛 짝(같은 날). 7: MotionWeb 엔진(같은 날). 8: 사용자가 고른 그래픽 차원(같은 날). */
export const DESIGN_CHAT_PROMPT_VERSION = 8;

const FONT_NAME = { sans: "고딕", serif: "명조", mono: "고정폭" } as const;
const DENSITY_NAME = { compact: "빽빽하게", comfortable: "읽기 편하게", spacious: "넓게" } as const;
const BLOCK_NAME: Record<DesignLayoutBlock["kind"], string> = { title: "이름이나 큰 글자", text: "글", figure: "이 사람의 기록에서 나온 추상 그래픽", accent: "강조 요소" };
const { columns: COLUMNS, rows: ROWS } = DESIGN_LAYOUT_GRID;

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

/**
 * 견본 아래에 놓이는 한 줄의 길이. 견본 카드는 세 장이 한 줄에 놓이고, 그 폭에 작은 글자로 두 줄이 이만큼 들어간다.
 * 2026-11-19에 설명이 서너 줄씩 나와 사용자가 "글이 이렇게 많은 건 곤란하다"고 짚었다. 색 · 서체 · 배치는 견본이 그림으로 보인다.
 */
const WORDS_MAX = 40;

/**
 * 사용자에게 건네는 말의 검사. 문장이 끝까지 쓰였는지와 길이만 본다 — 말투는 지시(`SPEECH`)가 잡는다.
 * 세 문장까지 받는다: 인사 한마디에 한두 문장이 붙는 꼴이 사용자가 본 예시였다("자료 잘 읽었어요. …네요. …까요?").
 */
function speechProblems(path: string, value: string, name: string): AiViolation[] {
  const text = value.trim();
  const sentences = text.match(/[.?!]+(?=\s|$)/g)?.length ?? 0;
  if (!/[.?!]["'”’)]?$/.test(text)) return [{ path, problem: `${name}의 마지막 문장이 끝나지 않았습니다. 끝까지 쓴 문장으로 고치세요.` }];
  return sentences > 3 ? [{ path, problem: `${name}이(가) 깁니다(${sentences}문장). 인사 한마디와 한두 문장으로 줄이세요.` }] : [];
}

/** 첫 화면에 실을 사실. 여는 호출이 출처에서 한 번 뽑고, 답하는 호출이 원문 대신 이것을 받는다. */
export const DesignHeadSchema = z.strictObject({
  role: z.string().min(1).describe("직무 한 줄"),
  headline: z.string().min(1).describe("이 사람이 무엇을 하는 사람인지 한 문장"),
  intro: z.string().describe("소개 두세 문장"),
  subject: z.string().min(1).describe("이 사람이 다루는 대상 · 도구 · 산출물을 구체적인 낱말로"),
  lead: z.array(z.string().min(1)).describe("첫 화면에 세울 만한 것. 이 사람이 만든 화면 · 구조 · 흐름 · 산출물과 그 일의 맥락을 먼저 적고, 수치는 그 일에 붙여 함께 적는다. 숫자와 단위는 출처에 적힌 글자 그대로"),
});
export type DesignHead = z.infer<typeof DesignHeadSchema>;

const StyleDraftSchema = z.strictObject({
  name: z.string().min(1).describe("스타일의 이름. 두세 낱말"),
  words: z.string().min(1).describe("한 줄(서른 자 안). 이 색과 서체를 이 사람의 일 가운데 무엇에서 가져왔는지. 가져온 대상의 이름으로 끝나는 명사구"),
  tokens: DesignTokensSchema.describe("바탕 · 글자 · 강조 색(#rrggbb), 서체 계열, 밀도"),
});
/** 그릴 스타일 — 색 · 서체 · 분위기. */
export type StyleDraft = z.infer<typeof StyleDraftSchema>;

const LayoutDraftSchema = z.strictObject({
  name: z.string().min(1).describe("레이아웃의 이름. 두세 낱말"),
  words: z.string().min(1).describe("한 줄(서른 자 안). 이 구성에서 무엇이 화면의 주인공인지. 명사구"),
  blocks: z
    .array(z.strictObject({ kind: z.enum(DESIGN_LAYOUT_BLOCK_KINDS), x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
    .describe("배치도. 가로 16칸 · 세로 10칸 격자 위의 블록 넷에서 여덟"),
});
/** 그릴 레이아웃 — 첫 화면의 구성. 검사를 지나면 계약의 `DesignLayoutSpec`과 같은 모양이다. */
export type LayoutDraft = z.infer<typeof LayoutDraftSchema>;

const styleLimits = (styles: StyleDraft[], at: string): AiViolation[] =>
  styles.flatMap((item, index) => [
    ...tooLong(`${at}/${index}/name`, item.name, DesignStyleSchema.shape.name, "스타일의 이름"),
    ...(item.words.length > WORDS_MAX
      ? [{ path: `${at}/${index}/words`, problem: `스타일의 설명이 깁니다(${item.words.length}자). 색과 서체를 무엇에서 가져왔는지만 한 줄(서른 자 안)의 명사구로 쓰세요. 색과 서체는 견본이 보입니다.` }]
      : []),
  ]);

const layoutLimits = (layouts: LayoutDraft[], at: string): AiViolation[] =>
  layouts.flatMap((item, index) => [
    ...tooLong(`${at}/${index}/name`, item.name, DesignLayoutSpecSchema.shape.name, "레이아웃의 이름"),
    ...(item.words.length > WORDS_MAX
      ? [{ path: `${at}/${index}/words`, problem: `레이아웃의 설명이 깁니다(${item.words.length}자). 무엇이 화면의 주인공인지만 한 줄(서른 자 안)의 명사구로 쓰세요. 배치는 배치도가 보입니다.` }]
      : []),
    // 블록의 수만 본다(계약이 받는 범위). 블록 하나하나의 자리는 아래에서 칸마다 본다.
    ...(DesignLayoutSpecSchema.shape.blocks.safeParse(item.blocks.map(() => ({ kind: "text", x: 0, y: 0, w: 1, h: 1 }))).success
      ? []
      : [{ path: `${at}/${index}/blocks`, problem: `배치도의 블록 수가 맞지 않습니다(${item.blocks.length}개). 블록 넷에서 여덟으로 다시 적으세요.` }]),
    ...item.blocks.flatMap((block, order) =>
      DesignLayoutBlockSchema.safeParse(block).success
        ? []
        : [{
            path: `${at}/${index}/blocks/${order}`,
            problem: `블록이 격자(가로 ${COLUMNS}칸 · 세로 ${ROWS}칸)를 벗어났거나 칸 수가 정수가 아닙니다(x ${block.x} · y ${block.y} · w ${block.w} · h ${block.h}). x + w는 ${COLUMNS}, y + h는 ${ROWS}을 넘지 않는 정수로 고치세요.`,
          }]),
  ]);

const DESIGNER = "포트폴리오의 디자인을 사용자와 대화로 정하는 디자이너입니다.";

/** 말 — 목록의 D1–D4 · N1–N4. */
const SPEECH = [
  "## 말 — `say`는 사용자에게 건네는 말입니다",
  "### Do",
  "- 사람에게 말하듯 씁니다. \"~해요\", \"~네요\", \"~할까요?\"로 끝나는 부드러운 존댓말입니다.",
  "- 자료에서 본 것이나 사용자가 한 말을 먼저 받고, 그다음에 묻거나 답합니다.",
  "- 한 번에 한 가지만 묻습니다.",
  "- 한두 문장으로 끝냅니다. 인사 한마디는 그 앞에 붙여도 됩니다.",
  "### Do not",
  "- 보고서 문장으로 시작하지 않습니다 — \"가장 앞에 세울 사실은 ~입니다\", \"~가 이 포트폴리오의 중심입니다\" 같은 꼴.",
  "- 화면에 띄운 카드의 내용을 글로 다시 설명하지 않습니다. 스타일과 레이아웃의 이름 · 색 · 배치를 말에 옮기지 않습니다.",
  "- 선택지를 문장 안에 나열하지 않습니다. 선택지는 카드가 보입니다.",
  "- 조사가 빠지거나 중간에 끊긴 문장을 쓰지 않습니다. 문장은 끝까지 씁니다.",
].join("\n");

/** 제안 — 목록의 D5–D8 · N5–N7, 그리고 레이아웃이 문서로 돌아가지 않게 하는 N8 · N9. */
const PROPOSALS = [
  "## 제안 — 스타일과 레이아웃을 따로 냅니다",
  "스타일은 색 · 서체 · 분위기이고, 레이아웃은 첫 화면의 구성입니다. 사용자는 스타일에서 하나, 레이아웃에서 하나를 따로 고릅니다. 어느 스타일이든 어느 레이아웃과 짝이 될 수 있어야 합니다.",
  "### Do",
  "- `styles`와 `layouts`를 서로 독립된 목록으로 냅니다.",
  "- 한 목록 안의 제안은 나란히 놓았을 때 한눈에 구분되게 합니다. 스타일은 바탕의 명도와 서체 계열이 서로 겹치지 않게, 레이아웃은 주인공과 그것이 놓인 자리가 서로 다르게 잡습니다.",
  "- 스타일은 이 사람의 일(다루는 대상 · 도구 · 산출물)과 지원하는 곳(회사의 톤 · 브랜드 색)에서 가져옵니다.",
  "- 레이아웃은 첫 화면에서 추상 그래픽(이 사람의 기록 · 강조할 점에서 나온 형태)과 이름 · 글을 어떻게 놓을지에서 출발합니다. 세 레이아웃은 그래픽의 자리 · 크기와 글과의 관계(겹침 · 나란함 · 둘러쌈)가 서로 다르게 잡습니다. 그래픽은 차트가 아니라 형태 · 흐름 · 밀도로 짓는 것이라, 레이아웃의 이름 · 설명에 막대 · 축 · 수치를 적지 않습니다. 수치는 첫 화면에 한 줄 글로만 둡니다.",
  "- 카드의 글은 이름(두세 낱말)과 한 줄(`words`, 서른 자 안의 명사구)까지만 씁니다. 대상은 이 사람의 자료에 나오는 이름으로 씁니다.",
  "- 바탕과 글자는 본문을 오래 읽을 수 있는 명도 차이를 두고, 강조는 바탕 위에서 한눈에 구분되게 합니다.",
  "### Do not",
  "- 스타일의 이름 · 설명에 구성을 적지 않고, 레이아웃의 이름 · 설명에 색 · 서체를 적지 않습니다.",
  "- 색만 다르고 나머지가 같은 스타일, 좌우만 바꾼 레이아웃을 내지 않습니다.",
  "- 같은 블록을 같은 자리에 둔 레이아웃을 둘 이상 내지 않습니다 — 셋 모두 맨 아래에 화면 폭의 글 띠를 두는 것처럼. 한 레이아웃에서 쓴 자리 잡기는 다른 레이아웃에서 다시 쓰지 않습니다.",
  "- 「이름 + 한 줄 소개 + 큰 수치 하나」 구성을 레이아웃 둘 이상에 쓰지 않습니다.",
  "- 문단과 목록으로 화면을 채우는 레이아웃을 내지 않습니다. 문서나 이력서처럼 보이는 구성은 디자인이 아닙니다.",
  "- 설명을 여러 줄로 쓰지 않습니다.",
  "",
  "### 배치도 — 레이아웃의 `blocks`",
  `첫 화면(가로 1440px · 세로 900px)을 가로 ${COLUMNS}칸 · 세로 ${ROWS}칸으로 나눈 격자 위에, 무엇을 어디에 얼마나 크게 놓는지 적습니다. 견본은 이 배치도를 그대로 그림으로 보이고, 첫 화면도 이 배치도를 따라 그립니다.`,
  `- \`kind\`: ${DESIGN_LAYOUT_BLOCK_KINDS.map((kind) => `\`${kind}\` ${BLOCK_NAME[kind]}`).join(" · ")}.`,
  `- \`x\` · \`y\`는 블록의 왼쪽 위 칸(0부터), \`w\` · \`h\`는 차지하는 칸 수입니다. 모두 정수이고 x + w는 ${COLUMNS}, y + h는 ${ROWS}을 넘지 않습니다.`,
  "- 블록은 넷에서 여덟 사이로 잡고 서로 겹치지 않게 합니다. 주인공이 되는 블록 하나가 가장 큽니다.",
].join("\n");

/** 사실 — 목록의 D14 · N12. */
const FACTS = [
  "## 사실",
  "### Do",
  "- 이름, 수치, 기간은 자료에 적힌 그대로 씁니다.",
  "### Do not",
  "- 자료에 없는 수치, 경력, 연락처를 만들지 않습니다.",
].join("\n");

// ── 여는 말 ─────────────────────────────────────────────

const OPENING_SYSTEM = [
  DESIGNER,
  "지금은 대화의 첫 말을 씁니다. 출처 자료(커리어 기록 · 답변 · 공고 요건)와 섹션 설계를 읽고 네 가지를 냅니다.",
  "- `head`: 이 사람의 첫 화면에 실을 사실입니다.",
  "- `say`: 사용자에게 건네는 첫 말입니다. 자료를 읽다 눈에 띈 일 하나 — 이 사람이 만든 것이나 맡은 일 — 를 말하듯 짚고, 어떤 느낌으로 보여 드릴지 묻습니다. 수치보다 무엇을 만들었는지를 짚습니다. 자료의 문장을 길게 옮기지 않고 이 사람의 낱말로 줄여 말합니다.",
  "- `styles`: 서로 뚜렷이 다른 스타일 셋입니다.",
  "- `layouts`: 서로 뚜렷이 다른 레이아웃 셋입니다.",
  "",
  SPEECH,
  "",
  PROPOSALS,
  "",
  FACTS,
].join("\n");

export const OpeningSchema = z.strictObject({
  head: DesignHeadSchema,
  say: z.string().min(1).describe("사용자에게 건네는 첫 말"),
  styles: z.array(StyleDraftSchema).describe("서로 다른 스타일 셋"),
  layouts: z.array(LayoutDraftSchema).describe("서로 다른 레이아웃 셋"),
});
export type Opening = z.infer<typeof OpeningSchema>;

export function openingCall(userId: string, sources: BrewPageSources): { spec: AiCallSpec; check(output: Opening): AiViolation[] } {
  const context = sourcesContext(userId, sources);
  const source = groundSource(sources);
  const prompt = [
    ...promptOpening(context),
    ...promptSources(context),
    "## 낼 것",
    "`head` · `say` · `styles` · `layouts`를 이 순서로 냅니다.",
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
      if (output.styles.length === 0) violations.push({ path: "/styles", problem: "스타일이 하나도 없습니다. 서로 다른 스타일 셋을 내세요." });
      if (output.layouts.length === 0) violations.push({ path: "/layouts", problem: "레이아웃이 하나도 없습니다. 서로 다른 레이아웃 셋을 내세요." });
      violations.push(
        ...tooLong("/say", output.say, DesignAssistantMessageSchema.shape.text, "첫 말"),
        ...speechProblems("/say", output.say, "첫 말"),
        ...styleLimits(output.styles, "/styles"),
        ...layoutLimits(output.layouts, "/layouts"),
      );
      return violations;
    },
  };
}

/** `head`를 답하는 호출이 읽을 글로 편다. */
export function headPrompt(head: DesignHead): string[] {
  return [
    "## 이 사람 — 출처에서 뽑아 숫자의 대조를 마쳤다",
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
  "- `proposals` — 견본. 스타일이나 레이아웃을 카드로 바로 띄웁니다. 사용자가 더 넓게 보고 싶어 하거나 원하는 것이 아직 좁혀지지 않았을 때 씁니다. 색 · 서체 · 분위기 이야기면 `styles`만, 구성 이야기면 `layouts`만 채우고, 둘 다 새로 볼 때만 둘 다 채웁니다.",
  "- `screens` — 첫 화면. 이 사람의 자료로 그린 포트폴리오 맨 위 한 장면이고 한 장에 30초쯤 걸립니다. 사용자가 스타일이나 구성을 구체적으로 말했거나 실제 모습을 보여 달라고 했을 때 씁니다. `screens`의 항목마다 스타일 하나와 레이아웃 하나를 짝지어 적습니다.",
  "  - 사용자가 스타일만 말했으면 레이아웃은 가장 최근에 그린 첫 화면의 것을 이름 · 설명 · 배치도까지 글자 그대로 옮깁니다. 구성만 말했으면 스타일을 그대로 옮깁니다.",
  "  - 아직 그린 첫 화면이 없으면 말하지 않은 쪽은 이 사람의 자료에 맞게 정합니다.",
  "- `revision` — 이미 그린 첫 화면을 고칩니다. 사용자가 첫 화면의 한 부분을 바꿔 달라고 했을 때 씁니다. `instruction`에 무엇을 어떻게 바꿀지 한 문장으로 옮깁니다. 그린 첫 화면이 하나도 없으면 쓰지 않습니다.",
  "  - 어느 첫 화면을 고칠지는 사용자의 말에서 읽습니다. 말이 앞서 그린 것을 가리키면(\"아까 분홍색 버전\", \"처음 그린 것\") 그 첫 화면의 이름을 대화에 적힌 글자 그대로 `target`에 적습니다.",
  "  - 가리키는 것이 따로 없으면 `target`을 비웁니다. 사용자가 방금 본, 가장 최근에 그린 첫 화면을 고칩니다.",
  "  - 대상이 붙어 있으면(사용자가 그 첫 화면을 넓게 띄워 놓고 한 말입니다) 그것을 고치고 `target`은 비웁니다.",
  "- `none` — 띄울 것이 없습니다. 되물어야 뜻을 알 수 있거나 말로만 답하면 될 때 씁니다.",
  "",
  "`styles` · `layouts`는 `show`가 `proposals`일 때만, `screens`는 `show`가 `screens`일 때만 채웁니다. 나머지는 빈 목록입니다.",
  "`screens`의 `source`는 사용자가 말한 스타일이나 구성을 옮긴 것이면 `user`, 내가 제안하는 것이면 `agent`입니다.",
  "대상이 카탈로그의 디자인이면 그 디자인의 색과 서체를 스타일로 그대로 씁니다.",
  "",
  SPEECH,
  "- 사용자가 고르거나 청한 것을 한마디로 받고 나서 답합니다.",
  "- `screens`나 `revision`으로 답할 때 그림은 이 말 뒤에 그려집니다. \"그려 볼게요\", \"바꿔 볼게요\"처럼 이제 할 일로 말하고, 이미 그린 것처럼(\"그려 봤어요\") 말하지 않습니다.",
  "",
  PROPOSALS,
  "",
  FACTS,
].join("\n");

export const ReplySchema = z.strictObject({
  say: z.string().min(1).describe("사용자에게 건네는 말"),
  show: z.enum(["none", "proposals", "screens", "revision"]),
  styles: z.array(StyleDraftSchema).describe("견본으로 띄울 스타일. 없으면 빈 목록"),
  layouts: z.array(LayoutDraftSchema).describe("견본으로 띄울 레이아웃. 없으면 빈 목록"),
  screens: z.array(z.strictObject({ source: z.enum(["agent", "user"]), style: StyleDraftSchema, layout: LayoutDraftSchema })).describe("첫 화면으로 그릴 스타일과 레이아웃의 짝. 없으면 빈 목록"),
  target: z.string().describe("`revision`일 때 고칠 첫 화면의 이름. 대화에 적힌 이름 그대로. 가장 최근에 그린 것을 고치거나 `revision`이 아니면 빈 글"),
  instruction: z.string().describe("`revision`일 때 고칠 내용 한 문장. 아니면 빈 글"),
});
export type Reply = z.infer<typeof ReplySchema>;

/**
 * 고칠 첫 화면. 붙은 대상(넓게 띄워 놓고 한 말)이 먼저고, 다음은 말이 이름으로 가리킨 것, 그것도 없으면 가장 최근에 그린 것이다.
 *
 * 처음에는 첫 화면마다 「말로 고치기」 버튼을 두고 눌러서 대상을 붙이게 했다. 2026-11-19 사용자: "말로 고치기 버튼이 왜 필요하냐;
 * 채팅 인터페이스인데". 버튼 없이 말만 보냈을 때는 고치겠다는 답만 남고 아무것도 뜨지 않았다. 어느 것을 고칠지는 말에서 읽는다.
 * 같은 이름이 여럿이면 나중에 그린 것이다.
 */
export function reviseTarget(snippets: DesignSnippet[], subject: ReplySubject | null, name: string): DesignSnippet | null {
  if (subject?.kind === "snippet") return subject.snippet;
  return snippets.findLast((item) => item.name === name.trim()) ?? snippets.at(-1) ?? null;
}

/** 답하는 호출이 읽는, 말이 가리킨 대상. */
export type ReplySubject = { kind: "snippet"; snippet: DesignSnippet } | { kind: "catalog"; style: StyleDraft };

const tokensLine = (tokens: DesignTokens) => `바탕 ${tokens.background} · 글자 ${tokens.text} · 강조 ${tokens.accent} · ${FONT_NAME[tokens.font]} · ${DENSITY_NAME[tokens.density]}`;
/** 레이아웃을 대화 요약에 적는다. 답하는 호출이 그대로 옮겨 쓸 수 있게 배치도를 값으로 싣는다. */
const layoutLine = (layout: DesignLayoutSpec | null) => (layout ? `레이아웃 「${layout.name}」 — ${layout.words} · 배치도 ${JSON.stringify(layout.blocks)}` : "레이아웃은 그린 쪽이 정함");

/** 지금까지의 대화를 글로 편다. 카드는 이름과 값만 적는다 — 마크업은 싣지 않는다. */
export function transcript(messages: DesignChatMessage[], snippets: DesignSnippet[]): string[] {
  const snippet = (id: string | null) => snippets.find((item) => item.id === id);
  const SUBJECT = { style: "스타일", layout: "레이아웃", snippet: "첫 화면", catalog: "카탈로그의 디자인" } as const;
  return messages.flatMap((message) => {
    if (message.role === "user") {
      const subject = message.subjects.map(({ kind, name }) => `${SUBJECT[kind]} 「${name}」`).join(" · ");
      const said = message.action === "say" ? message.text : message.action === "draw" ? "(견본에서 스타일과 레이아웃을 골라 첫 화면을 청함)" : "(카탈로그의 디자인을 골라 첫 화면을 청함)";
      return [`사용자: ${said}${subject ? ` [대상: ${subject}]` : ""}`];
    }
    const lines = message.text ? [`디자이너: ${message.text}`] : [];
    if (message.card?.kind === "proposals")
      lines.push(
        ...message.card.styles.map((item) => `  [스타일 견본 「${item.name}」 — ${item.words} (${tokensLine(item.tokens)})]`),
        ...message.card.layouts.map((item) => `  [레이아웃 견본 — ${layoutLine(item)}]`),
      );
    if (message.card?.kind === "screens")
      lines.push(...message.card.items.map((item) => {
        const drawn = snippet(item.snippetId);
        return `  [첫 화면 「${drawn?.name ?? item.name}」 — 스타일 「${item.name}」 ${item.words} (${tokensLine(drawn?.tokens ?? item.tokens)}) · ${layoutLine(drawn?.layout ?? item.layout)}${item.status === "failed" ? " · 그리지 못함" : ""}]`;
      }));
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
  const latest = input.snippets.at(-1) ?? null;
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
            ? `첫 화면 「${subject.snippet.name}」 — ${subject.snippet.words} (${tokensLine(subject.snippet.tokens)}) · ${layoutLine(subject.snippet.layout)}`
            : `카탈로그의 디자인 「${subject.style.name}」 — ${subject.style.words} (${tokensLine(subject.style.tokens)})`,
        ]
      : latest
        ? ["", "## 이 말의 대상", `붙은 대상이 없습니다. 고쳐 달라는 말이고 가리키는 첫 화면이 따로 없으면, 가장 최근에 그린 「${latest.name}」을 고칩니다.`]
        : []),
  ].join("\n");
  return {
    spec: { contract: "page_design", system: REPLY_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check(output) {
      const violations: AiViolation[] = [];
      if (output.show === "proposals" && output.styles.length + output.layouts.length === 0)
        violations.push({ path: "/styles", problem: "`show`가 proposals인데 스타일도 레이아웃도 없습니다. 띄울 것을 적거나 `show`를 none으로 바꾸세요." });
      if (output.show === "screens" && output.screens.length === 0)
        violations.push({ path: "/screens", problem: "`show`가 screens인데 그릴 것이 없습니다. 스타일과 레이아웃의 짝을 적거나 `show`를 none으로 바꾸세요." });
      if (output.show === "revision" && !reviseTarget(input.snippets, subject, ""))
        violations.push(
          { path: "/show", problem: "아직 그린 첫 화면이 없어 고칠 것이 없습니다. 새로 그릴 것이면 `screens`로, 아니면 `none`으로 바꾸세요." },
          // 띄울 것만 바꾸면 고치겠다는 말이 남는다. 말도 함께 고쳐 받는다.
          { path: "/say", problem: "고칠 첫 화면이 없습니다. 고치겠다는 말 대신, 바꾼 `show`에 맞는 말로 다시 쓰세요." },
        );
      else if (output.show === "revision" && output.target.trim() && !input.snippets.some(({ name }) => name === output.target.trim()))
        violations.push({ path: "/target", problem: `「${output.target}」라는 이름의 첫 화면이 대화에 없습니다. 대화에 적힌 첫 화면의 이름(${[...new Set(input.snippets.map(({ name }) => `「${name}」`))].join(" · ")}) 가운데 하나를 그대로 적거나, 가장 최근 것을 고칠 것이면 비우세요.` });
      if (output.show === "revision" && !output.instruction.trim()) violations.push({ path: "/instruction", problem: "무엇을 어떻게 바꿀지 한 문장으로 적으세요." });
      violations.push(
        ...tooLong("/say", output.say, DesignAssistantMessageSchema.shape.text, "말"),
        ...speechProblems("/say", output.say, "말"),
        ...tooLong("/instruction", output.instruction, DesignScreenItemSchema.shape.words, "고칠 내용"),
        ...styleLimits(output.styles, "/styles"),
        ...layoutLimits(output.layouts, "/layouts"),
        ...output.screens.flatMap((item, index) => [...styleLimits([item.style], `/screens/${index}/style`), ...layoutLimits([item.layout], `/screens/${index}/layout`)].map((violation) => ({
          ...violation,
          // 짝 안의 스타일 · 레이아웃은 목록이 아니라 한 칸이다. 목록 자리 번호(`/0`)를 경로에서 뺀다.
          path: violation.path.replace(/\/(style|layout)\/0/, "/$1"),
        }))),
      );
      return violations;
    },
  };
}

// ── 견본 다시 내기 (에이전트 대화) ───────────────────────────

/** 견본을 다시 낼 때 무엇을 새로 내는가. */
export type ProposalFocus = "both" | "styles" | "layouts";

const PROPOSE_SYSTEM = [
  DESIGNER,
  "사용자의 요청에 맞춰 견본을 다시 냅니다. 말은 쓰지 않습니다 — 사용자와의 대화는 다른 쪽이 맡고, 여기서는 카드에 띄울 견본만 냅니다.",
  "- 요청이 색 · 서체 · 분위기 이야기면 `styles`만, 구성 이야기면 `layouts`만 채웁니다. 낼 것은 아래 「낼 것」이 정합니다.",
  "- 앞서 보인 견본과 이름 · 색 · 자리 잡기가 겹치지 않게 냅니다. 사용자가 앞선 견본의 하나를 바탕으로 바꿔 달라고 했으면 그 견본에서 요청한 것만 바꿉니다.",
  "",
  PROPOSALS,
  "",
  FACTS,
].join("\n");

export const ProposalsSchema = z.strictObject({
  styles: z.array(StyleDraftSchema).describe("견본으로 띄울 스타일. 낼 것이 아니면 빈 목록"),
  layouts: z.array(LayoutDraftSchema).describe("견본으로 띄울 레이아웃. 낼 것이 아니면 빈 목록"),
});
export type Proposals = z.infer<typeof ProposalsSchema>;

/** 에이전트 대화가 청한 견본. 대화와 요청을 읽고 견본만 낸다 — 말은 에이전트가 한다. 검사는 여는 호출의 견본 검사와 같다. */
export function proposalsCall(input: { userId: string; sources: BrewPageSources; head: DesignHead; messages: DesignChatMessage[]; snippets: DesignSnippet[]; request: string; focus: ProposalFocus }): { spec: AiCallSpec; check(output: Proposals): AiViolation[] } {
  const context = sourcesContext(input.userId, input.sources);
  const wanted = { both: "서로 다른 스타일 셋과 서로 다른 레이아웃 셋", styles: "서로 다른 스타일 셋. `layouts`는 빈 목록", layouts: "서로 다른 레이아웃 셋. `styles`는 빈 목록" }[input.focus];
  const prompt = [
    ...promptOpening(context),
    ...headPrompt(input.head),
    "## 지금까지의 대화",
    ...transcript(input.messages, input.snippets),
    "",
    "## 사용자의 요청",
    input.request,
    "",
    "## 낼 것",
    wanted,
  ].join("\n");
  return {
    spec: { contract: "page_design", system: PROPOSE_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check(output) {
      const violations: AiViolation[] = [];
      if (input.focus !== "layouts" && output.styles.length === 0) violations.push({ path: "/styles", problem: "스타일이 하나도 없습니다. 서로 다른 스타일 셋을 내세요." });
      if (input.focus !== "styles" && output.layouts.length === 0) violations.push({ path: "/layouts", problem: "레이아웃이 하나도 없습니다. 서로 다른 레이아웃 셋을 내세요." });
      violations.push(...styleLimits(output.styles, "/styles"), ...layoutLimits(output.layouts, "/layouts"));
      return violations;
    },
  };
}

// ── 첫 화면 그리기 · 고치기 ────────────────────────────────

/** 첫 화면 한 장면의 출력. 키 순서가 쓰는 순서다 — CSS를 마크업보다 먼저 쓴다. */
export const SnippetDraftSchema = z.strictObject({
  name: z.string().min(1).describe("이 첫 화면의 짧은 이름. 두세 낱말"),
  note: z.string().min(1).describe("사용자에게 건네는 짧은 말 한 문장. 이 첫 화면에서 무엇을 주인공으로 세웠는지만. \"~했어요\"로 끝나는 존댓말"),
  tokens: DesignTokensSchema.describe("쓴 바탕 · 글자 · 강조 색(#rrggbb)과 서체 계열 · 밀도"),
  css: z.string().min(1),
  html: z.string().min(1),
  script: z.string().optional().describe("그림 스크립트(ES 모듈). 그림이 필요 없으면 비운다"),
});
export type SnippetDraft = z.infer<typeof SnippetDraftSchema>;

const SNIPPET_SYSTEM = briefedSystem(FRONTEND_DESIGN_SKILL, {
  planLine: "- 지침의 계획 → 검토는 쓰기 전에 마치고, 그 계획대로 `css`와 `html`을 쓴다. 화면을 찍어 볼 수는 없다.",
  order: [
    "## 내는 순서",
    "- `name` — 이 첫 화면의 짧은 이름. 고른 스타일이나 레이아웃의 이름을 그대로 옮기지 않고, 이 짝에서 나온 화면을 부르는 이름을 짓는다.",
    "- `note` — 사용자에게 건네는 말 한 문장.",
    "- `tokens` — 쓴 바탕 · 글자 · 강조 색과 서체 계열 · 밀도.",
    "- `css` — 스타일 전부를 먼저 쓴다. 뒤에 올 마크업의 클래스 이름을 여기서 정해 둔다.",
    "- `html` — 위에서 정한 클래스로 첫 화면의 마크업을 쓴다.",
    "- `script` — 그림 스크립트. 그래픽을 canvas · three.js로 지을 때 쓴다.",
  ].join("\n"),
});

/**
 * 그린 쪽이 건네는 말의 길이. 대화 폭(60rem)에서 한 줄에 들어가는 글자 수다.
 * 2026-11-19 실제 호출에서 이 말이 배치를 풀어 쓴 두 줄짜리 문장으로 나왔다("…가운데 그림으로 세우고, 그 옆에 …을 막대로 받쳤어요").
 * 화면에 보이는 것을 글로 다시 설명한 것이다.
 */
const NOTE_MAX = 60;

/** 그린 쪽이 건네는 한 문장. 한 장을 그리면 이 말이 에이전트의 답으로 대화에 놓인다 — 말의 Do와 Do not을 같이 지킨다. */
const NOTE = [
  "## `note` — 사용자에게 건네는 말이다",
  "- 사람에게 말하듯 짧은 한 문장으로 쓴다. \"~세워 봤어요\", \"~했어요\"로 끝나는 부드러운 존댓말이다.",
  "- 무엇을 주인공으로 세웠는지만 말한다. 나머지가 어디에 어떻게 놓였는지는 화면이 보인다.",
  "- 배치, 색, 곁들인 것을 글로 풀지 않는다. \"~을 세우고, 그 옆에 ~을 두고, 아래에 ~을 받쳤어요\"처럼 화면을 다시 설명하지 않는다.",
  "- 보고서 문장(\"~을 배치하였습니다\", \"~가 중심입니다\")으로 쓰지 않는다.",
  "",
];

const FIRST_SCREEN = [
  "## 만들 것",
  "이 사람의 포트폴리오가 **시작하는 자리**를 디자인한다. 지면의 맨 위부터 화면 하나(폭 1440px · 높이 900px)에 보이는 부분이다.",
  "- 지면 바탕색은 `body`에 준다. 맨 위 요소는 `<header>`나 `<section>`으로 쓰고 지면 전체를 감싸는 틀(`<main>`이나 바깥 `<div>`)을 두지 않는다 — 고르면 이 뒤에 나머지 섹션이 이어 붙는다.",
  "- 클래스 이름은 뒤에 붙을 섹션이 이어 쓸 수 있게 역할로 짓는다.",
  "- 내용은 높이 900px 안에 들어오게 한다.",
  "",
  ...designRules("화면"),
  ...NOTE,
];

/** 사용자가 고른 그래픽의 차원. 지침의 「깊이가 있는 장면은 3D로」보다 먼저다. 고르지 않았으면 아무것도 적지 않는다. */
function graphicPrompt(graphic: DesignGraphic | null): string[] {
  if (graphic === "3d")
    return ["## 사용자가 고른 그래픽 — 3D", "첫 화면의 그래픽을 입체로 짓는다. 공들인 오브젝트 하나는 MotionWeb 엔진으로, 흩어진 입자 · 선의 장은 three.js로 짓는다.", ""];
  if (graphic === "2d")
    return ["## 사용자가 고른 그래픽 — 2D", "첫 화면의 그래픽을 평면으로 짓는다. canvas 2D 생성 그래픽으로, 원근 · 회전 · 깊이 없이 형태 · 흐름 · 밀도 · 결로 짓는다. 3D 엔진과 three.js는 쓰지 않는다.", ""];
  return [];
}

/** 고른 레이아웃을 그리는 호출이 읽을 글로 편다. 견본이 그림으로 보인 배치도와 같은 값이다. */
function layoutPrompt(layout: DesignLayoutSpec | null): string[] {
  if (!layout)
    return [
      "## 레이아웃 — 정해지지 않았다. 구성은 네가 정한다",
      "이 사람의 기록 · 강조할 점에서 나온 추상 그래픽을 주인공으로 세우고, 이름과 글을 그것과 한 장면으로 놓는다. 수치는 한 줄 글로만 둔다.",
      "",
    ];
  return [
    "## 사용자가 고른 레이아웃 — 구성은 이것을 따른다",
    `고른 것: **${layout.name}** — ${layout.words}`,
    `배치도 — 화면(1440×900)을 가로 ${COLUMNS}칸 · 세로 ${ROWS}칸(한 칸 90px)으로 나눈 자리다. 사용자는 이 배치도를 그림으로 보고 골랐다.`,
    ...layout.blocks.map((block) => `- ${BLOCK_NAME[block.kind]}: 왼쪽에서 ${block.x}칸 · 위에서 ${block.y}칸 자리에 가로 ${block.w}칸 · 세로 ${block.h}칸`),
    "무엇이 어디에 얼마나 크게 놓이는지를 배치도대로 잡는다. 칸의 경계에 한 픽셀까지 맞출 필요는 없고, 블록마다 무엇을 담을지는 자료를 보고 정한다.",
    "",
  ];
}

/** 첫 화면 한 장의 검사. 건네는 말(`note`)이 없는 출력(고친 것)은 `spoken`을 끄고 부른다. */
function snippetCheck(source: string, spoken = true) {
  return (draft: SnippetDraft): AiViolation[] => {
    const problem = markupProblem(draft.html, false);
    if (problem) return [{ path: "/html", problem }];
    const speech = [
      ...tooLong("/name", draft.name, DesignSnippetSchema.shape.name, "이름"),
      ...(spoken ? speechProblems("/note", draft.note, "건네는 말") : []),
      ...(draft.note.length > NOTE_MAX ? [{ path: "/note", problem: `건네는 말이 깁니다(${draft.note.length}자). 무엇을 주인공으로 세웠는지만 짧은 한 문장으로 쓰세요. 배치와 곁들인 것은 화면이 보입니다.` }] : []),
    ];
    if (speech.length) return speech;
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

/**
 * 첫 화면을 그리는 호출. 스타일과 레이아웃을 따로 받는다 — 사용자가 따로 고른 것이다.
 * 원문 자료 전체를 받는다. 이 사람의 일을 그림으로 만들려면 뽑아 둔 사실 몇 줄(`head`)로는 모자란다.
 */
export function drawCall(input: { userId: string; sources: BrewPageSources; style: StyleDraft; layout: DesignLayoutSpec | null; graphic?: DesignGraphic | null }): { spec: AiCallSpec; check(output: SnippetDraft): AiViolation[] } {
  const { style } = input;
  const context = sourcesContext(input.userId, input.sources);
  const prompt = [
    ...promptOpening(context),
    "## 사용자가 고른 스타일 — 색 · 서체 · 밀도는 그대로 따른다",
    `고른 것: **${style.name}** — ${style.words}`,
    `- 바탕 \`${style.tokens.background}\` · 본문 글자 \`${style.tokens.text}\` · 강조 \`${style.tokens.accent}\`. 명도를 조절한 변주는 만들어 써도 되고, 계열 밖의 색은 들이지 않는다.`,
    `- 서체 계열: ${FONT_NAME[style.tokens.font]}. 한국어 대체 서체를 함께 지정한다.`,
    `- 밀도: ${DENSITY_NAME[style.tokens.density]}.`,
    "",
    ...layoutPrompt(input.layout),
    ...graphicPrompt(input.graphic ?? null),
    ...promptSources(context),
    ...FIRST_SCREEN,
  ].join("\n");
  return {
    spec: { contract: "page_generation", system: SNIPPET_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, ...TIER },
    check: snippetCheck(groundSource(input.sources)),
  };
}

/**
 * 고친 것의 출력. 첫 화면 전체가 아니라 **바뀌는 자리만** 낸다.
 *
 * 처음에는 고친 첫 화면 전체(마크업과 CSS)를 다시 쓰게 했다. 색 하나를 바꿔도 30초 안팎이 걸렸고, 2026-11-19 사용자가
 * "매번 처음부터 새로 그리게 하는 거야?"라고 짚었다. 모델은 「이 글자를 이 글자로」 조각만 쓰고 서버가 지금 첫 화면에 적용한다.
 * 지시가 가리키지 않은 자리는 한 글자도 다시 쓰이지 않는다.
 */
export const RevisionDraftSchema = z.strictObject({
  name: z.string().min(1).describe("고친 첫 화면의 짧은 이름. 두세 낱말"),
  tokens: DesignTokensSchema.describe("고친 뒤의 바탕 · 글자 · 강조 색(#rrggbb)과 서체 계열 · 밀도"),
  edits: z
    .array(z.strictObject({
      in: z.enum(["css", "html", "script"]).describe("어디를 고치는가"),
      find: z.string().min(1).describe("지금 첫 화면에 있는 글자 그대로. 공백과 줄바꿈까지 같아야 한다"),
      replace: z.string().describe("그 자리에 들어갈 글자. 지우려면 빈 글"),
    }))
    .describe("바꿀 자리. 순서대로 적용한다"),
});
export type RevisionDraft = z.infer<typeof RevisionDraftSchema>;

const REVISION_SYSTEM = [
  "너는 포트폴리오 첫 화면의 마크업 · CSS · 그림 스크립트를 고치는 편집자다. 사용자가 채팅에서 보고 있는 첫 화면에서 지시가 가리킨 것만 고친다.",
  "",
  "## 고치는 법",
  "- 첫 화면을 다시 쓰지 않는다. 바뀌는 자리만 `edits`에 조각으로 낸다. 조각마다 지금 있는 글자(`find`)와 그 자리에 들어갈 글자(`replace`)를 적는다.",
  "- `find`는 지금 첫 화면에서 글자 그대로 옮긴다. 공백 · 줄바꿈 · 따옴표까지 같아야 찾는다.",
  "- 같은 글자가 여러 번 나오면 모두 바뀐다. 색 값을 통째로 바꿀 때는 그 값만 적으면 되고, 한 자리만 바꿀 때는 그 자리만 가리키도록 앞뒤 글자를 넉넉히 넣는다.",
  "- 조각은 필요한 만큼만 낸다. 색 하나를 바꾸는 일은 조각 한두 개다. 규칙을 새로 더할 때는 가까운 규칙의 끝을 `find`로 잡고 그 뒤에 이어 붙인다.",
  "- 조각은 적은 순서대로 적용된다. 뒤 조각의 `find`는 앞 조각을 적용한 뒤의 글자에서 찾는다.",
  "- 지시가 가리키지 않은 색 · 서체 · 구성 · 글 · 클래스 이름은 건드리지 않는다. 새로 넣는 것은 지금 첫 화면의 색 · 서체 · 클래스 이름 짓는 법을 잇는다.",
  "- 자료에 없는 수치, 경력, 연락처를 만들지 않는다.",
  "",
  pagePolicyPrompt({ script: true }),
  "",
  "## 내는 순서",
  "- `name` — 고친 첫 화면의 짧은 이름.",
  "- `tokens` — 고친 뒤의 바탕 · 글자 · 강조 색과 서체 계열 · 밀도. 바뀌지 않았으면 지금 값 그대로다.",
  "- `edits` — 바꿀 자리.",
].join("\n");

/** 조각을 순서대로 적용한다. `find`가 없는 조각은 건너뛰고 그 자리 번호를 `missing`에 남긴다. 같은 글자는 모두 바꾼다. */
export function applyEdits(snippet: Pick<DesignSnippet, "html" | "css" | "script">, edits: RevisionDraft["edits"]): { html: string; css: string; script: string; missing: number[] } {
  const next = { html: snippet.html, css: snippet.css, script: snippet.script ?? "" };
  const missing: number[] = [];
  edits.forEach((edit, index) => {
    if (!next[edit.in].includes(edit.find)) missing.push(index);
    else next[edit.in] = next[edit.in].split(edit.find).join(edit.replace);
  });
  return { ...next, missing };
}

export function reviseCall(input: { userId: string; sources: BrewPageSources; snippet: Pick<DesignSnippet, "html" | "css" | "script" | "name" | "tokens">; instruction: string }): {
  spec: AiCallSpec;
  check(output: RevisionDraft): AiViolation[];
  /** 조각을 지금 첫 화면에 적용한 결과. 그린 첫 화면과 같은 모양이다. */
  apply(output: RevisionDraft): SnippetDraft;
} {
  const { snippet } = input;
  const prompt = [
    "## 지금 첫 화면 — 사용자가 채팅에서 보고 있는 것이다",
    `이름: ${snippet.name} · ${tokensLine(snippet.tokens)}`,
    "```html",
    snippet.html,
    "```",
    "```css",
    snippet.css,
    "```",
    ...(snippet.script ? ["```js", snippet.script, "```"] : []),
    "",
    "## 지시",
    input.instruction,
  ].join("\n");
  const apply = (output: RevisionDraft): SnippetDraft => {
    const { html, css, script } = applyEdits(snippet, output.edits);
    // 고친 것에는 건네는 말을 받지 않는다. 고치겠다는 말은 답하는 호출이 이미 했고, 한 칸을 더 쓰게 하면 그만큼 늦어진다
    // (2026-11-19 실제 호출: 조각은 9초에 왔는데 이 말을 고쳐 받느라 5초가 더 들었다).
    return { name: output.name, note: "", tokens: output.tokens, css, html, ...(script.trim() ? { script } : {}) };
  };
  const whole = snippetCheck(groundSource(input.sources), false);
  return {
    // 고치는 일은 바뀔 자리를 찾아 적는 일이라 깊이 생각할 것이 없다. 2026-11-19 실제 호출에서 색 하나는 출력 548토큰 · 13초였는데
    // "막대를 더 두껍게"는 4,563토큰 · 30초가 들었다 — 조각은 몇 줄이고 나머지는 쓰기 전의 생각이었다.
    spec: { contract: "page_generation", system: REVISION_SYSTEM, prompt, promptVersion: DESIGN_CHAT_PROMPT_VERSION, effort: "low", ...TIER },
    apply,
    check(output) {
      if (output.edits.length === 0) return [{ path: "/edits", problem: "바꿀 자리가 하나도 없습니다. 지시가 가리킨 것을 바꾸는 조각을 적으세요." }];
      // 지금 첫 화면에 없는 글자를 찾는 조각은 그 조각만 고쳐 받는다. 전체를 다시 쓰게 하지 않는다.
      const { missing } = applyEdits(snippet, output.edits);
      if (missing.length)
        return missing.map((index) => ({
          path: `/edits/${index}/find`,
          problem: `지금 첫 화면의 ${output.edits[index]!.in}에 이 글자가 없습니다. 지금 첫 화면에서 글자 그대로(공백 · 줄바꿈까지) 옮겨 적으세요. 더 짧게 잡아도 됩니다.`,
        }));
      // 적용한 결과는 새로 그린 첫 화면과 같은 검사를 지난다. 마크업 · CSS의 문제는 조각을 고쳐 받는다.
      return whole(apply(output)).map((violation) => (violation.path === "/html" || violation.path === "/css" ? { path: "/edits", problem: `조각을 적용한 ${violation.path.slice(1)}에 문제가 있습니다: ${violation.problem}` } : violation));
    },
  };
}

/**
 * 카탈로그의 디자인 판을 스타일로 옮긴다. 색 · 서체 · 밀도는 그 판으로 생성할 때 쓰는 값과 같다(`generationStyleFor`).
 * 카탈로그의 디자인은 구성을 정하지 않는다 — 레이아웃은 사용자가 견본에서 고르거나 그리는 호출이 정한다.
 * 판이 없거나 색이 #rrggbb가 아니면 null이다.
 */
export function catalogStyle(revisionId: string): StyleDraft | null {
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
