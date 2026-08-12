import { z } from "zod";

/**
 * 본문 안의 결.
 *
 * 지금까지 블록의 글은 **평문 문자열 하나**였다. 그래서 만들 수 없는 것이 있었다 —
 * 한 문단 안에서 핵심 낱말만 밑줄을 긋거나 강조색을 주는 일이 그렇다. 지면이
 * 할 수 있는 것은 문단 **전체**의 크기와 색을 정하는 것뿐이었고, 그러면 모든
 * 문장이 같은 무게로 서서 어디를 먼저 읽어야 할지 알려주지 못한다.
 *
 * 표시는 **열거한다.** 클래스 문자열을 여기까지 열어 주지 않는 이유는 두 가지다 —
 * 인라인 표시는 종류가 적고(강조 · 밑줄 · 형광 · 코드 · 링크), 본문 한가운데에
 * 임의의 클래스가 들어오면 지면의 타입 계단이 문장 안에서 깨진다.
 */

export const TEXT_MARKS = ["strong", "emphasis", "underline", "highlight", "code"] as const;
export const TextMarkSchema = z.enum(TEXT_MARKS);

/**
 * 글 한 토막.
 *
 * `mark`가 없으면 본문 그대로다. `href`가 있으면 링크가 된다 — 링크는 표시와
 * 따로다(강조하면서 링크일 수 있다).
 */
export const TextRunSchema = z
  .strictObject({
    text: z.string().min(1).max(4_000),
    mark: TextMarkSchema.optional(),
    /**
     * 바깥으로 나가는 주소만. 상대 경로도 `javascript:`도 받지 않는다 —
     * 지면은 남의 브라우저에서 열리고, 우리가 그 주소를 대신 눌러 준다.
     */
    href: z.url({ protocol: /^https?$/ }).max(500).optional(),
  })
  .strict();

export const TextRunsSchema = z.array(TextRunSchema).min(1).max(40);

export type TextMark = z.infer<typeof TextMarkSchema>;
export type TextRun = z.infer<typeof TextRunSchema>;

/** run을 이어 붙인 평문. 저장된 `text`가 이것이고, 근거 검증이 이걸 본다. */
export function flattenRuns(runs: readonly TextRun[]): string {
  return runs.map(({ text }) => text).join("");
}

/** 블록 content에서 run을 읽는다. 없으면 평문 한 토막으로 본다. */
export function parseRuns(content: Record<string, unknown>): TextRun[] | null {
  const parsed = TextRunsSchema.safeParse(content["runs"]);
  if (parsed.success) return parsed.data;
  const text = content["text"];
  return typeof text === "string" && text.length > 0 ? [{ text }] : null;
}

/**
 * 목록의 한 줄.
 *
 * 문자열이면 그냥 항목이고, 쌍이면 **이름과 값**이다. 쌍이 필요한 이유는
 * 지면에서 그 둘이 다르게 서기 때문이다 — `역할 · 백엔드`는 한 줄에 나란히
 * 놓이고 이름 쪽이 조용해야 한다. 이걸 문자열 하나로 넣으면 지면이 어디까지가
 * 이름인지 알 수 없다.
 */
export const ListItemSchema = z.union([
  z.string().min(1).max(500),
  z.strictObject({
    term: z.string().min(1).max(80),
    value: z.string().min(1).max(500),
  }),
]);

export type ListItem = z.infer<typeof ListItemSchema>;

export interface NormalizedListItem {
  term: string | null;
  value: string;
}

/** 목록 항목을 한 모양으로 편다. 렌더러와 편집이 이걸 본다. */
export function normalizeListItem(item: ListItem): NormalizedListItem {
  return typeof item === "string" ? { term: null, value: item } : { term: item.term, value: item.value };
}
