import { describe, expect, it } from "vitest";
import { searchHref } from "./search-href";

describe("searchHref", () => {
  it("keeps explicit filters and sort while returning to the first search page", () => {
    const href = searchHref(
      "country=all&experience=3&workType=재택&company=abc&sort=recent&page=5&category=remote&q=old",
      " Python ",
    );
    const params = new URL(href, "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      country: "all",
      experience: "3",
      workType: "재택",
      company: "abc",
      sort: "recent",
      q: "Python",
    });
  });
  it("encodes text as a query rather than navigation", () => {
    expect(searchHref("", "https://example.com/?a=b#test")).toBe(
      "/jobs?q=https%3A%2F%2Fexample.com%2F%3Fa%3Db%23test",
    );
  });
});
