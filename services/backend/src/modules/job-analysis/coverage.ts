import type { ExtractedRequirement } from "@expresso/contracts";

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

export function calculateRequirementCoverage(
  requirement: ExtractedRequirement,
  records: CoverageRecord[],
): { coverage: "covered" | "partial" | "missing"; coveredBy: string[] } {
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
