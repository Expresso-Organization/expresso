import type { Job } from "bullmq";

import type { BrewJobRunner, BrewJobService } from "../../modules/brew-jobs/service.js";
import { InterviewError } from "../../modules/interview/service.js";
import { QuestionDraftError } from "../../modules/interview/question-writer.js";
import { RecipeError } from "../../modules/recipe/service.js";
import { RecipePlanError } from "../../modules/recipe/planner.js";
import { AiError } from "../../platform/ai/client.js";

/**
 * 왜 실패했는지, 다시 눌러도 되는지.
 *
 * 도메인 거절(재료가 모자람 · 근거가 없음)은 **다시 눌러도 같은 답**이다.
 *
 * 계약 거절도 마찬가지로 재시도하지 않는다. 계약은 이미 안에서 두 번 물었고,
 * 큐가 세 번째로 부르면 같은 답에 쿼터만 더 쓴다. 사용자가 다시 누르는 편이
 * 낫다 — 그때는 재료나 공고가 달라져 있을 수 있다.
 */
export function classifyBrewJobFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof InterviewError || error instanceof RecipeError) {
    return { code: "BREW_INPUT_REJECTED", retryable: false };
  }
  if (error instanceof QuestionDraftError || error instanceof RecipePlanError) {
    return { code: "CONTRACT_REJECTED", retryable: false };
  }
  if (error instanceof AiError) return { code: error.code, retryable: error.retryable };
  return { code: "PROVIDER_FAILED", retryable: true };
}

export function createBrewJobProcessor(
  service: BrewJobService,
  runners: { interview: BrewJobRunner; recipe: BrewJobRunner },
) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.brewJobId;
    if (typeof id !== "string") throw new Error(`${job.name} payload is missing brewJobId`);
    const runner = job.name === "interview.draft" ? runners.interview : runners.recipe;
    return service.process(id, runner, classifyBrewJobFailure);
  };
}
