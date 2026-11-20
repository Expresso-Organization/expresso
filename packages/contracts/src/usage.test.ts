import { describe, expect, it } from "vitest";

import { BILLABLE_TOKEN_FIELDS, BILLABLE_TOKEN_TENTHS, EntitlementCapabilitySchema, TOKENS_PER_CREDIT, UNMETERED_CONTRACTS, billableTokens, billableTokensOf, creditsFromUsage } from "./index.js";

const tokens = (inputTokens: number, outputTokens: number, cacheReadTokens: number) => ({ inputTokens, outputTokens, cacheReadTokens });

describe("크레딧 셈", () => {
  it("캐시 읽기는 10분의 1로, 입력과 출력은 그대로 센다", () => {
    expect(Object.keys(BILLABLE_TOKEN_TENTHS)).toEqual([...BILLABLE_TOKEN_FIELDS]);
    expect(billableTokens(tokens(100, 200, 3_000))).toBe(600);
    expect(billableTokens(tokens(0, 0, 81_423))).toBe(8_142.3);
    expect(billableTokensOf("cacheReadTokens", 81_423)).toBe(8_142.3);
    expect(billableTokensOf("outputTokens", 16_647)).toBe(16_647);
  });
  it("기간 전체를 더한 뒤 한 번만 올린다. 경계는 정수 셈으로 정확하다", () => {
    expect(creditsFromUsage(tokens(0, 0, 0))).toBe(0);
    expect(creditsFromUsage(tokens(1, 0, 0))).toBe(1);
    expect(creditsFromUsage(tokens(0, TOKENS_PER_CREDIT, 0))).toBe(1);
    expect(creditsFromUsage(tokens(0, TOKENS_PER_CREDIT, 1))).toBe(2);
    // 캐시 읽기만 있을 때: 100,000개가 정확히 1 크레딧이다.
    expect(creditsFromUsage(tokens(0, 0, 10 * TOKENS_PER_CREDIT))).toBe(1);
    expect(creditsFromUsage(tokens(0, 0, 10 * TOKENS_PER_CREDIT + 1))).toBe(2);
    // 소수 0.1을 곱했다면 흔들리는 값: 3 × 0.1은 0.30000000000000004다.
    expect(creditsFromUsage(tokens(0, 3 * TOKENS_PER_CREDIT - 3, 30))).toBe(3);
  });
  it("실제 대화의 사용량: 완주 한 번을 마친 계정이 83 크레딧에서 12 크레딧이 된다", () => {
    // 검증 계정 둘의 이번 달 합계(2026-11-20). 캐시 읽기를 그대로 세면 83 · 102 크레딧이었다.
    expect(creditsFromUsage(tokens(54, 33_596, 793_896))).toBe(12);
    expect(creditsFromUsage(tokens(86, 28_477, 982_249))).toBe(13);
    // 저장된 생성 40건의 평균. 그대로 세면 9.8 크레딧이었다.
    expect(billableTokens(tokens(8, 16_647, 81_423)) / TOKENS_PER_CREDIT).toBeCloseTo(2.48, 2);
  });
  it("능동 제안은 크레딧에 넣지 않고, 그 대신 요금제의 기능이다", () => {
    expect(UNMETERED_CONTRACTS).toEqual(["proposal_briefing"]);
    expect(EntitlementCapabilitySchema.options).toContain("consultant.outreach");
  });
});
