import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";

import type { BrewJobApi, BrewJobRunner } from "../../modules/brew-jobs/index.js";
import { RecipeError } from "../../modules/recipe/index.js";
import { createBrewJobProcessor, type WaitingGenerations } from "./brew-jobs.js";

const target = { userId: "u1", brewId: "b1" };

/** 실행기를 한 번 부르고 그 결과를 그대로 돌려주는 가짜 잡 서비스. 실제 서비스처럼 실패는 다시 던진다. */
const service = {
  async process(_id: string, runner: BrewJobRunner) {
    const resultId = await runner.run({ ...target, idempotencyKey: "k" });
    return { jobId: "j1", type: "recipe", status: "succeeded", stage: "done", attempts: 1, resultId, failure: null };
  },
} as unknown as BrewJobApi;

function waiting() {
  const calls: string[] = [];
  const api: WaitingGenerations = {
    async attachRecipe(userId, brewId) { calls.push(`attach:${userId}:${brewId}`); return 1; },
    async failWaiting(userId, brewId, code) { calls.push(`fail:${userId}:${brewId}:${code}`); return 1; },
  };
  return { api, calls };
}

const job = (name: string, attemptsMade = 0, attempts = 3) =>
  ({ name, data: { brewJobId: "j1" }, attemptsMade, opts: { attempts } }) as unknown as Job<Record<string, unknown>>;
const runners = (recipe: BrewJobRunner) => ({ interview: { run: async () => "s1" }, recipe });

describe("구성 잡과 구성을 기다리는 생성", () => {
  it("구성이 끝나면 기다리던 생성에 붙인다", async () => {
    const { api, calls } = waiting();
    await createBrewJobProcessor(service, runners({ run: async () => "r1" }), api)(job("recipe.draft"));
    expect(calls).toEqual(["attach:u1:b1"]);
  });

  it("질문 잡은 생성을 건드리지 않는다", async () => {
    const { api, calls } = waiting();
    await createBrewJobProcessor(service, runners({ run: async () => "r1" }), api)(job("interview.draft"));
    expect(calls).toEqual([]);
  });

  it("다시 돌 수 있는 실패는 기다리던 생성을 그대로 두고, 마지막 시도에서만 끝낸다", async () => {
    const { api, calls } = waiting();
    const failing = runners({ run: async () => { throw new Error("provider down"); } });
    await expect(createBrewJobProcessor(service, failing, api)(job("recipe.draft", 0, 3))).rejects.toThrow("provider down");
    expect(calls).toEqual([]);
    await expect(createBrewJobProcessor(service, failing, api)(job("recipe.draft", 2, 3))).rejects.toThrow("provider down");
    expect(calls).toEqual(["fail:u1:b1:PROVIDER_FAILED"]);
  });

  it("다시 돌아도 같은 답인 거절은 첫 시도에서 끝낸다", async () => {
    const { api, calls } = waiting();
    const rejecting = runners({ run: async () => { throw new RecipeError(422, "재료가 모자랍니다"); } });
    await expect(createBrewJobProcessor(service, rejecting, api)(job("recipe.draft", 0, 3))).rejects.toThrow();
    expect(calls).toEqual(["fail:u1:b1:BREW_INPUT_REJECTED"]);
  });
});
