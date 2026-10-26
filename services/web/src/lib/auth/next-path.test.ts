import { describe, expect, it } from "vitest";

import { loginPath, safeNext } from "./next-path";

describe("safeNext", () => {
  it("같은 출처의 경로만 돌려준다", () => {
    expect(safeNext("/career/experience?view=table")).toBe("/career/experience?view=table");
    expect(safeNext("https://evil.example/")).toBe("/home");
    expect(safeNext("//evil.example/")).toBe("/home");
    expect(safeNext("/\\evil.example")).toBe("/home");
    expect(safeNext(null)).toBe("/home");
    expect(safeNext("")).toBe("/home");
  });

  it("라우트 핸들러와 인증 화면으로는 돌려보내지 않는다", () => {
    expect(safeNext("/api/dev/session")).toBe("/home");
    expect(safeNext("/login")).toBe("/home");
    expect(safeNext("/login/connect")).toBe("/home");
    expect(safeNext("/signup")).toBe("/home");
    expect(safeNext("/")).toBe("/home");
  });

  it("기본값이면 next 파라미터를 붙이지 않는다", () => {
    expect(loginPath("/home")).toBe("/login");
    expect(loginPath(null)).toBe("/login");
    expect(loginPath("/jobs/abc")).toBe("/login?next=%2Fjobs%2Fabc");
  });
});
