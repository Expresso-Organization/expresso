import type { ExtractedRequirement } from "@expresso/contracts";

import { keywordMet } from "../jobs/index.js";

export interface CoverageRecord {
  id: string;
  text: string;
}

function tokens(value: string): string[] {
  return [...new Set(value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}+#.-]+/u)
    .filter((token) => token.length >= 2))];
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

/**
 * 요건에 든 공고 키워드(`normalized`)가 기록 어딘가에 모두 있으면 그 요건은 덮였다.
 *
 * 일치도(`calculateExplainableMatch`)와 같은 키워드 · 같은 비교다. 키워드가 없는
 * 요건("빠른 환경에서의 판단력")은 낱말 일치로 증명할 수 없어 아래 규칙으로 간다.
 */
function coveredByKeywords(requirement: ExtractedRequirement, records: CoverageRecord[], keywords: string[], careerYears: number): string[] | null {
  const statement = normalized(`${requirement.label} ${requirement.sourceSpan.quote}`);
  const own = keywords.map(normalized).filter((keyword) => keyword.length > 0 && statement.includes(keyword));
  if (own.length === 0) return null;
  const sources = records.map((record) => ({ id: record.id, text: normalized(record.text) }));
  const met = (keyword: string, text: string) => keywordMet(keyword, text, careerYears);
  if (!own.every((keyword) => sources.some((source) => met(keyword, source.text)))) return null;
  return sources.filter((source) => own.some((keyword) => met(keyword, source.text))).map((source) => source.id);
}

export function calculateRequirementCoverage(
  requirement: ExtractedRequirement,
  records: CoverageRecord[],
  keywords: string[] = [],
  careerYears = 0,
): { coverage: "covered" | "partial" | "missing"; coveredBy: string[] } {
  const byKeywords = coveredByKeywords(requirement, records, keywords, careerYears);
  if (byKeywords) return { coverage: "covered", coveredBy: byKeywords };
  const requirementTokens = tokens(`${requirement.label} ${requirement.sourceSpan.quote}`);
  const fullyCovered: string[] = [];
  const partiallyCovered: string[] = [];
  for (const record of records) {
    const source = record.text.normalize("NFKC").toLocaleLowerCase("en-US");
    const matched = requirementTokens.filter((token) => source.includes(token)).length;
    if (requirementTokens.length > 0 && matched === requirementTokens.length) {
      fullyCovered.push(record.id);
    } else if (matched > 0) {
      partiallyCovered.push(record.id);
    }
  }
  if (fullyCovered.length > 0) return { coverage: "covered", coveredBy: fullyCovered };
  if (partiallyCovered.length > 0) return { coverage: "partial", coveredBy: partiallyCovered };
  return { coverage: "missing", coveredBy: [] };
}
