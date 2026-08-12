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
        ? `공고 요건과 겹치는 말: ${matched.slice(0, 5).join(", ")}`
        : record.status === "verified"
          ? "요건과 겹치는 말은 없지만 검증한 기록입니다"
          : "요건과 겹치는 말이 없습니다",
    };
  }).sort((left, right) =>
    right.score - left.score
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id));
}
