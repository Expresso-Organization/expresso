export interface MaterialRecord {
  id: string;
  title: string;
  status: "organized" | "verified";
  text: string;
}

export interface RankedMaterial extends MaterialRecord {
  score: number;
  reason: string;
}

function tokens(value: string): string[] {
  return [...new Set(value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}+#.-]+/u)
    .filter((token) => token.length >= 2))];
}

/** 겹친 말을 적는 머리말. 적는 쪽(`rankMaterials`)과 읽는 쪽(`matchedTermsOf`)이 같은 것을 본다. */
const MATCHED_PREFIX = "공고 요건과 겹치는 말: ";

/**
 * 순위 이유에서 겹친 말만 꺼낸다.
 *
 * 이유는 `brew_sources.reasonText`에 문장으로 저장돼 있다. 02 고르기 화면은
 * 문장이 아니라 말의 목록을 그리므로 여기서 되돌린다 — 저장 문서를 넓히면
 * 이미 매겨 둔 순위마다 두 갈래가 생긴다. 겹친 말이 없으면 빈 배열이다.
 */
export function matchedTermsOf(reason: string): string[] {
  if (!reason.startsWith(MATCHED_PREFIX)) return [];
  return reason.slice(MATCHED_PREFIX.length).split(", ").filter((term) => term.length > 0);
}

export function rankMaterials(
  records: MaterialRecord[],
  requirementLabels: string[],
): RankedMaterial[] {
  const requirementTokens = tokens(requirementLabels.join(" "));
  return records.map((record) => {
    const normalized = record.text.normalize("NFKC").toLocaleLowerCase("en-US");
    const matched = requirementTokens.filter((token) => normalized.includes(token));
    const score = matched.length * 10 + (record.status === "verified" ? 3 : 0);
    return {
      ...record,
      score,
      // 01b가 줄마다 그대로 보여주는 말이다 — 사용자가 읽을 문장으로 쓴다.
      reason: matched.length > 0
        ? `${MATCHED_PREFIX}${matched.slice(0, 5).join(", ")}`
        : record.status === "verified"
          ? "요건과 겹치는 말은 없지만 검증한 기록입니다"
          : "요건과 겹치는 말이 없습니다",
    };
  }).sort((left, right) =>
    right.score - left.score
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id));
}
