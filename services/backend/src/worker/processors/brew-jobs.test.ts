import { describe, expect, it } from "vitest";

import type { BrewJobApi } from "../../modules/brew-jobs/index.js";
import { ConsentError } from "../../modules/consent/index.js";
import { RecipeError } from "../../modules/recipe/index.js";
import { classifyBrewJobFailure, createBrewJobProcessor } from "./brew-jobs.js";

const runner = { async run() { return "unused"; } };

function harness(failure: unknown) {
  const calls: { finalAttempt: boolean | undefined }[] = [];
  const service = {
    async process(_id: string, _runner: unknown, _classify: unknown, options?: { finalAttempt?: boolean }) {
      calls.push({ finalAttempt: options?.finalAttempt });
      if (failure) throw failure;
      return { status: "succeeded" };
    },
  } as unknown as BrewJobApi;
  return { calls, processor: createBrewJobProcessor(service, { interview: runner, recipe: runner }) };
}

const job = (attemptsMade: number, attempts = 5) => ({ name: "recipe.draft", data: { brewJobId: "job" }, attemptsMade, opts: { attempts } }) as never;

describe("brew job processor", () => {
  it("tells the service whether BullMQ will try again", async () => {
    const { calls, processor } = harness(null);
    await processor(job(0));
    await processor(job(3));
    await processor(job(4));
    await processor(job(0, 1));
    expect(calls.map(({ finalAttempt }) => finalAttempt)).toEqual([false, false, true, true]);
  });

  it("stops queue retries for failures classified as not retryable", async () => {
    const original = new RecipeError(422, "fewer than three materials");
    const { processor } = harness(original);
    const thrown = await processor(job(0)).catch((error: unknown) => error);
    expect(thrown).toMatchObject({ name: "UnrecoverableError", code: "BREW_INPUT_REJECTED", cause: original });
  });

  it("classifies a missing consent as not retryable and names the consent", () => {
    expect(classifyBrewJobFailure(new ConsentError("career_records"))).toEqual({ code: "CONSENT_REQUIRED", retryable: false, requiredConsent: "career_records" });
    expect(classifyBrewJobFailure(new Error("provider timeout"))).toEqual({ code: "PROVIDER_FAILED", retryable: true });
  });

  it("stops queue retries when consent is missing", async () => {
    const original = new ConsentError("career_records");
    const { processor } = harness(original);
    expect(await processor(job(0)).catch((error: unknown) => error)).toMatchObject({ name: "UnrecoverableError", code: "CONSENT_REQUIRED", cause: original });
  });

  it("rethrows retryable failures unchanged so BullMQ retries them", async () => {
    const original = new Error("consent missing");
    const { processor } = harness(original);
    await expect(processor(job(0))).rejects.toBe(original);
  });
});
