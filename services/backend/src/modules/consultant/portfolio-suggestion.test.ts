import { describe, expect, it } from "vitest";

import { QUIET_DAYS } from "./commitments.js";
import { PORTFOLIO_SUGGESTION_MIN_RECORDS, portfolioSuggestion, type PortfolioSuggestionInput } from "./portfolio-suggestion.js";

const base: PortfolioSuggestionInput = { records: PORTFOLIO_SUGGESTION_MIN_RECORDS, portfolios: 0, brewing: 0, lastSuggestedOn: null, today: "2026-11-23" };

describe("포트폴리오 제안의 시점 판단", () => {
  it("포트폴리오가 없고 기록이 문턱에 닿았으면 권한다", () => {
    expect(PORTFOLIO_SUGGESTION_MIN_RECORDS).toBe(3);
    expect(portfolioSuggestion(base)).toBe("due");
    expect(portfolioSuggestion({ ...base, records: 12 })).toBe("due");
  });

  it("기록이 문턱보다 하나라도 적으면 권하지 않는다", () => {
    expect(portfolioSuggestion({ ...base, records: PORTFOLIO_SUGGESTION_MIN_RECORDS - 1 })).toBe("few_records");
    expect(portfolioSuggestion({ ...base, records: 0 })).toBe("few_records");
  });

  it("포트폴리오가 이미 있으면 기록이 많아도 권하지 않는다", () => {
    expect(portfolioSuggestion({ ...base, records: 20, portfolios: 1 })).toBe("has_portfolio");
  });

  it("이 대화에서 제작을 시작했으면 권하지 않는다", () => {
    expect(portfolioSuggestion({ ...base, brewing: 1 })).toBe("in_progress");
  });

  it("제안한 뒤 14일이 지나기 전에는 다시 권하지 않고, 14일째에 다시 권한다", () => {
    expect(QUIET_DAYS).toBe(14);
    expect(portfolioSuggestion({ ...base, lastSuggestedOn: "2026-11-23" })).toBe("recently_suggested");
    expect(portfolioSuggestion({ ...base, lastSuggestedOn: "2026-11-10" })).toBe("recently_suggested");
    expect(portfolioSuggestion({ ...base, lastSuggestedOn: "2026-11-09" })).toBe("due");
  });

  it("만들었거나 만드는 중이면 기록 수와 제안일보다 그 까닭을 먼저 낸다", () => {
    expect(portfolioSuggestion({ ...base, records: 0, portfolios: 2, lastSuggestedOn: "2026-11-23" })).toBe("has_portfolio");
    expect(portfolioSuggestion({ ...base, records: 0, brewing: 1 })).toBe("in_progress");
  });
});
