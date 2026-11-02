import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MongoContext } from "../../platform/mongodb.js";
import * as Interview from "./index.js";

describe("prepared Interview input boundary", () => {
  it("rejects an empty transcript before allocating a durable intent", async () => {
    expect(Interview.PreparedInterviewCareerWriter, "준비용 writer가 필요합니다").toBeTypeOf("function");
    const writer = new Interview.PreparedInterviewCareerWriter({} as MongoContext, {
      async execute() { throw new Error("owner should not run"); },
    });
    await expect(writer.prepareAnswer(randomUUID(), randomUUID(), randomUUID(), "empty-answer-0001", {
      inputType: "text", transcript: "  ",
    })).rejects.toThrow();
  });
});