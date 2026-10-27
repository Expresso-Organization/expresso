import type { Job } from "bullmq";

import { type BrewJobRunner, type BrewJobApi } from "../../modules/brew-jobs/index.js";
import { InterviewError } from "../../modules/interview/index.js";
import { QuestionDraftError } from "../../modules/interview/question-writer.js";
import { RecipeError } from "../../modules/recipe/index.js";
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

/** 구성(레시피)을 기다리는 생성. 생성 모듈의 진입점(`GenerationApi`)이 준다. */
export interface WaitingGenerations {
  attachRecipe(userId: string, brewId: string): Promise<number>;
  failWaiting(userId: string, brewId: string, code: string): Promise<number>;
}

/**
 * 구성 잡이 마지막으로 실패했는가. 큐는 `attemptsMade + 1 < attempts`일 때만 다시 돌린다(BullMQ 6
 * `Job.shouldRetryJob`). 다시 돌아도 같은 답인 거절(`retryable: false`)도 마지막으로 본다 — 기다리는 사람에게
 * 실패를 늦게 알릴 까닭이 없다.
 */
export function isFinalBrewJobFailure(job: Pick<Job, "attemptsMade" | "opts">, error: unknown): boolean {
  return !classifyBrewJobFailure(error).retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

export function createBrewJobProcessor(
  service: BrewJobApi,
  runners: { interview: BrewJobRunner; recipe: BrewJobRunner },
  waiting?: WaitingGenerations,
) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.brewJobId;
    if (typeof id !== "string") throw new Error(`${job.name} payload is missing brewJobId`);
    const recipe = job.name !== "interview.draft";
    const runner = recipe ? runners.recipe : runners.interview;
    // 잡 문서에만 있는 사용자 · 브루를 실행이 넘겨받는 자리에서 기억해 둔다. 구성을 기다리던 생성을 찾는 열쇠다.
    const seen: { target?: { userId: string; brewId: string } } = {};
    const tracked: BrewJobRunner = {
      run(input) {
        seen.target = { userId: input.userId, brewId: input.brewId };
        return runner.run(input);
      },
    };
    try {
      const status = await service.process(id, tracked, classifyBrewJobFailure);
      // 구성이 생겼으니 기다리던 생성에 붙여 시작한다. 이미 성공한 잡이 다시 배달되면 실행이 없어 `target`도 없다 —
      // 그때는 처음 성공했을 때 이미 붙였다.
      if (recipe && waiting && seen.target) await waiting.attachRecipe(seen.target.userId, seen.target.brewId);
      return status;
    } catch (error) {
      if (recipe && waiting && seen.target && isFinalBrewJobFailure(job, error)) {
        await waiting.failWaiting(seen.target.userId, seen.target.brewId, classifyBrewJobFailure(error).code).catch(() => undefined);
      }
      throw error;
    }
  };
}
