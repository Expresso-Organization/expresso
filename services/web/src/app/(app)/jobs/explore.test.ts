import { expect, it } from "vitest";

import { exploreHref, readKind } from "./explore";

it("모르는 종류는 채용 공고로 읽는다", () => {
  expect(readKind("contest")).toBe("contest");
  expect(readKind("unknown")).toBe("jobs");
  expect(readKind(undefined)).toBe("jobs");
});

it("채용 공고는 종류를 주소에 적지 않는다", () => {
  expect(exploreHref("jobs")).toEqual({ pathname: "/jobs", query: {} });
  expect(exploreHref("hackathon")).toEqual({ pathname: "/jobs", query: { kind: "hackathon" } });
});
