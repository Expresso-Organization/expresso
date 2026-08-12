/**
 * 지면 클래스 검증.
 *
 * 규칙은 둘이다.
 *
 * ① **어휘 안에 있어야 한다.** 어휘는 `layout-vocabulary.ts`이고, 그 목록이
 *    곧 `portfolio-utilities.css`다(생성기가 확인한다). 그래서 여기를 통과한
 *    클래스는 **반드시 그려진다.** 전에는 통과 목록과 컴파일 목록이 따로여서
 *    `w-24`가 통과한 뒤 조용히 사라졌고, 모델은 그 사실을 알 수 없었다.
 *
 * ② **자리에 맞아야 한다.** 어휘에 있어도 섹션 지면에는 쓸 수 없는 것이 있다 —
 *    그라디언트가 그렇다. 카드 표지의 그라디언트는 표지 미술이지만 섹션 배경에
 *    깔린 두 단 그라디언트는 AI 티의 1번이다. 같은 클래스가 자리에 따라 갈린다.
 *
 * 거절은 조용하지 않다. 사유가 재생성 프롬프트로 돌아가 모델이 다시 짠다.
 */

import { isCompiledClassName, PALETTE_COLOR_NAMES } from "./layout-vocabulary.js";

/** Tailwind 기본 팔레트. 우리 지면에서는 쓰지 않는다. */
const DEFAULT_PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald"
  + "|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

/** 어디에 붙는 클래스인가. 자리에 따라 갈리는 규칙이 있다. */
export type ClassNameSlot = "section" | "block";

interface Rule {
  readonly pattern: RegExp;
  readonly reason: string;
  /** 이 자리에서만 막는다. 비우면 어디서나 막는다. */
  readonly slot?: ClassNameSlot;
}

/**
 * 어휘 밖이라 어차피 거절되지만, **왜 안 되는지 말해 주는 것**이 값이다.
 * 사유가 프롬프트로 돌아가므로 "어휘에 없다"보다 이쪽이 다음 시도를 고친다.
 */
const RULES: readonly Rule[] = [
  {
    pattern: /\[[^\]]*\]/,
    reason: "임의값은 쓸 수 없습니다 — 검증할 수 없고 컴파일되지도 않습니다",
  },
  {
    pattern: new RegExp(`^-?(?:text|bg|border|decoration|fill|stroke|from|via|to|ring|outline|shadow|caret|accent)-(?:${DEFAULT_PALETTE})(?:-\\d{2,3})?$`),
    reason: `색은 팔레트 토큰만 씁니다 (${PALETTE_COLOR_NAMES.join(" · ")})`,
  },
  {
    pattern: /^(?:fixed|absolute|sticky)$/,
    reason: "블록이 섹션을 벗어날 수 있습니다",
  },
  {
    pattern: /^-?(?:inset|top|right|bottom|left)-/,
    reason: "블록이 섹션을 벗어날 수 있습니다",
  },
  {
    pattern: /^z-/,
    reason: "쌓임 순서를 지면이 정합니다",
  },
  {
    pattern: /^(?:min-|max-)?[wh]-(?:screen|dvw|dvh|svh|lvh|lvw)$/,
    reason: "뷰포트 단위는 지면 밖으로 넘칩니다",
  },
  {
    // 표지에는 허용한다. 섹션 배경에 깔린 두 단 그라디언트만 막는다.
    pattern: /^(?:bg-(?:linear|radial|conic)|from|via|to)-/,
    reason: "그라디언트는 카드·타일 표지에만 씁니다 — 섹션 배경에 깔면 AI 티가 납니다",
    slot: "section",
  },
];

export interface ClassNameCheck {
  ok: boolean;
  /** 실제로 적용될 클래스. */
  accepted: string;
  /** 막힌 클래스와 그 이유. */
  rejected: { className: string; reason: string }[];
}

/**
 * 클래스 문자열에서 쓸 수 없는 것을 걸러낸다.
 *
 * 통과한 클래스는 CSS에 반드시 있다 — 어휘와 CSS가 한 소스에서 나오고,
 * 생성기가 매번 대조한다.
 */
export function checkClassName(value: string, slot: ClassNameSlot = "block"): ClassNameCheck {
  const accepted: string[] = [];
  const rejected: ClassNameCheck["rejected"] = [];
  for (const token of value.split(/\s+/).filter(Boolean)) {
    // 변형 접두사(`md:` · `hover:`)를 떼고 본체를 본다.
    const bare = token.slice(token.lastIndexOf(":") + 1);
    const rule = RULES.find((candidate) =>
      (candidate.slot === undefined || candidate.slot === slot) && candidate.pattern.test(bare));
    if (rule) {
      rejected.push({ className: token, reason: rule.reason });
    } else if (!isCompiledClassName(token)) {
      rejected.push({
        className: token,
        reason: "지면 어휘에 없는 클래스입니다 — 있는 것으로 같은 뜻을 내세요",
      });
    } else {
      accepted.push(token);
    }
  }
  return { ok: rejected.length === 0, accepted: accepted.join(" "), rejected };
}

/** 모델 프롬프트에 그대로 넣는 규칙. 검증기와 같은 곳에서 나온다. */
export function classNameRules(): string {
  return [
    "클래스는 Tailwind 어휘를 쓰되 **컴파일해 둔 것만** 그려진다. 어휘 밖은 거절된다.",
    `- 색: 팔레트 토큰만 — ${PALETTE_COLOR_NAMES.map((name) => `text-${name}`).join(" · ")} 같은 형태.`,
    "  slate·indigo 같은 Tailwind 기본 팔레트는 없다. 농도는 bg-accent/10 처럼 슬래시로.",
    "- 임의값(text-[13px])·위치(fixed·absolute·sticky·inset-*·z-*)·뷰포트 단위는 없다.",
    "- 그라디언트(bg-linear-to-br + from-*/to-*)는 **카드·타일 표지에만**. 섹션 배경에는 못 쓴다.",
    "- 크기: w-/h-/size-는 0~96 계단과 full·fit·min·max·1/2·1/3·2/3·1/4·3/4.",
    "- 글자 크기는 text-step0 ~ text-step5(작은 쪽은 text-step-1). 서체는 font-display · font-body · font-mono.",
    "- 상호작용: hover:opacity-* · hover:bg-accent/10 · transition · duration-200 정도만 있다.",
    "- 한국어 본문에는 break-keep, 넘칠 수 있는 칸에는 min-w-0을 붙인다.",
  ].join("\n");
}
