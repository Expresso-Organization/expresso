// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useChangedSinceMount } from "./useChangedSinceMount";

describe("useChangedSinceMount", () => {
  it("처음 그린 값이면 거짓이다 — 이미 끝난 카드는 움직이지 않는다", () => {
    const { result } = renderHook(({ value }) => useChangedSinceMount(value), { initialProps: { value: "approved" } });
    expect(result.current).toBe(false);
  });

  it("그린 뒤 값이 바뀌면 참이다", () => {
    const { result, rerender } = renderHook(({ value }) => useChangedSinceMount(value), { initialProps: { value: "ready" } });
    rerender({ value: "approved" });
    expect(result.current).toBe(true);
  });
});
