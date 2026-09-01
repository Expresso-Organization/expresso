

export interface InsightDraft {
  narrative: string;
  evidenceMetrics: string[];
  suggestions: { direction: "up" | "down"; target: string; action: string }[];
}

export class AnalyticsError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AnalyticsError";
    this.statusCode = statusCode;
  }
}

export function validateInsightDraft(draft: InsightDraft, availableMetricKeys: ReadonlySet<string>): InsightDraft {
  const speculative = /(?:아마|추정|가능성이|일s*것|probably|likely|maybe|might|could)/i;
  if (speculative.test(draft.narrative)
    || draft.suggestions.some(({ action }) => speculative.test(action))) {
    throw new AnalyticsError(400, "speculative insight is not allowed");
  }
  if (draft.evidenceMetrics.length === 0 || draft.evidenceMetrics.some((key) => !availableMetricKeys.has(key))) {
    throw new AnalyticsError(400, "insight evidence metric is missing");
  }
  if (draft.suggestions.length > 2) throw new AnalyticsError(400, "too many insight suggestions");
  // 제안이 가리키는 지표도 집계에 있어야 한다. 없는 것을 올리자고 할 수 없다.
  if (draft.suggestions.some(({ target }) => !availableMetricKeys.has(target))) {
    throw new AnalyticsError(400, "insight suggestion target is missing");
  }
  return draft;
}
