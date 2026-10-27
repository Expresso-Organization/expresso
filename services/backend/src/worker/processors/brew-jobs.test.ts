import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";

import type { BrewJobApi, BrewJobRunner } from "../../modules/brew-jobs/index.js";
import { ConsentError } from "../../modules/consent/index.js";
import { RecipeError } from "../../modules/recipe/index.js";
import { classifyBrewJobFailure, createBrewJobProcessor, type WaitingGenerations } from "./brew-jobs.js";

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

const unusedRunner = { async run() { return "unused"; } };

function harness(failure: unknown) {
  const calls: { finalAttempt: boolean | undefined }[] = [];
  const service = {
    async process(_id: string, _runner: unknown, _classify: unknown, options?: { finalAttempt?: boolean }) {
      calls.push({ finalAttempt: options?.finalAttempt });
      if (failure) throw failure;
      return { status: "succeeded" };
    },
  } as unknown as BrewJobApi;
  return { calls, processor: createBrewJobProcessor(service, { interview: unusedRunner, recipe: unusedRunner }) };
}

const attempt = (attemptsMade: number, attempts = 5) => ({ name: "recipe.draft", data: { brewJobId: "job" }, attemptsMade, opts: { attempts } }) as never;

describe("brew job processor", () => {
  it("tells the service whether BullMQ will try again", async () => {
    const { calls, processor } = harness(null);
    await processor(attempt(0));
    await processor(attempt(3));
    await processor(attempt(4));
    await processor(attempt(0, 1));
    expect(calls.map(({ finalAttempt }) => finalAttempt)).toEqual([false, false, true, true]);
  });

  it("stops queue retries for failures classified as not retryable", async () => {
    const original = new RecipeError(422, "fewer than three materials");
    const { processor } = harness(original);
    const thrown = await processor(attempt(0)).catch((error: unknown) => error);
    expect(thrown).toMatchObject({ name: "UnrecoverableError", code: "BREW_INPUT_REJECTED", cause: original });
  });

  it("classifies a missing consent as not retryable and names the consent", () => {
    expect(classifyBrewJobFailure(new ConsentError("career_records"))).toEqual({ code: "CONSENT_REQUIRED", retryable: false, requiredConsent: "career_records" });
    expect(classifyBrewJobFailure(new Error("provider timeout"))).toEqual({ code: "PROVIDER_FAILED", retryable: true });
  });

  it("stops queue retries when consent is missing", async () => {
    const original = new ConsentError("career_records");
    const { processor } = harness(original);
    expect(await processor(attempt(0)).catch((error: unknown) => error)).toMatchObject({ name: "UnrecoverableError", code: "CONSENT_REQUIRED", cause: original });
  });

  it("rethrows retryable failures unchanged so BullMQ retries them", async () => {
    const original = new Error("consent missing");
    const { processor } = harness(original);
    await expect(processor(attempt(0))).rejects.toBe(original);
  });
});
