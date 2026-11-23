import { QUIET_DAYS, addDays } from "./commitments.js";

/**
 * 포트폴리오 제안의 시점 판단. 순수 함수만 둔다.
 *
 * 기획서(`docs/expresso-ai/product-plan.md` 「포트폴리오 잇기」)의 세 시점 가운데 「기록이 쌓였을 때」다 —
 * 포트폴리오가 아직 없고 기록이 어느 정도 모였을 때. 언제 권할지는 여기서 규칙으로 정하고, 모델은 그 판단을 받아 말만 한다.
 */

/**
 * 제안을 시작하는 기록 수. 내용이 있는 기록만 센다.
 * 기획서는 「어느 정도 모였을 때」라고만 적는다. 3건은 사용자가 확정한 값이다(2026-11-23, `.intent/intent_consultant-portfolio.md`의 열린 질문).
 */
export const PORTFOLIO_SUGGESTION_MIN_RECORDS = 3;

/**
 * 판단의 결과.
 * - `due`: 지금 권한다.
 * - `few_records`: 기록이 문턱에 못 미친다.
 * - `has_portfolio`: 이미 포트폴리오가 있다.
 * - `in_progress`: 끝나지 않은 제작이 있다.
 * - `recently_suggested`: 같은 제안을 한 지 `QUIET_DAYS`일이 지나지 않았다.
 */
export type PortfolioSuggestion = "due" | "few_records" | "has_portfolio" | "in_progress" | "recently_suggested";

export interface PortfolioSuggestionInput {
  /** 내용이 있는 기록의 수. */
  records: number;
  /** 사용자의 포트폴리오 수(휴지통 제외). */
  portfolios: number;
  /** 끝나지 않은 제작의 수. 이 대화에서 시작한 것과 사용자의 다른 제작을 함께 센다. */
  brewing: number;
  /** 마지막으로 제안한 서울 날짜. 제안한 적이 없으면 null. */
  lastSuggestedOn: string | null;
  /** 오늘의 서울 날짜. */
  today: string;
}

/** 까닭은 사용자에게서 먼 것부터 본다 — 이미 만들었거나 만드는 중이면 기록 수와 날짜는 볼 필요가 없다. */
export function portfolioSuggestion(input: PortfolioSuggestionInput): PortfolioSuggestion {
  if (input.portfolios > 0) return "has_portfolio";
  if (input.brewing > 0) return "in_progress";
  if (input.records < PORTFOLIO_SUGGESTION_MIN_RECORDS) return "few_records";
  if (input.lastSuggestedOn && addDays(input.lastSuggestedOn, QUIET_DAYS) > input.today) return "recently_suggested";
  return "due";
}
