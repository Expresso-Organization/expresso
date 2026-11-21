import { describe, expect, it } from "vitest";
import { GithubRepoReader, parseRepoUrl } from "./repo-reader.js";

describe("깃허브 레포 읽기", () => {
  it("github.com/owner/repo만 받고 레포 안 경로 · .git은 걷어 낸다", () => {
    expect(parseRepoUrl("https://github.com/vercel/next.js/tree/canary/docs")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseRepoUrl("https://github.com/a/b.git")).toEqual({ owner: "a", repo: "b" });
    for (const bad of ["https://gitlab.com/a/b", "https://github.com/a", "ftp://github.com/a/b", "https://github.com.evil.io/a/b", "not a url"]) expect(parseRepoUrl(bad)).toBeNull();
  });

  it("설명 · 언어 비율 · README를 모아 돌려준다 — api.github.com만 부른다", async () => {
    const called: string[] = [];
    const fetcher = (async (input: string | URL) => {
      const url = String(input); called.push(url);
      if (url.endsWith("/languages")) return Response.json({ TypeScript: 300, CSS: 100 });
      if (url.endsWith("/readme")) return new Response("# Demo\n" + "x".repeat(7_000));
      return Response.json({ full_name: "a/b", html_url: "https://github.com/a/b", description: "데모", homepage: "", topics: ["react"] });
    }) as typeof fetch;
    const summary = await new GithubRepoReader(null, fetcher).read("https://github.com/a/b");
    expect(called.every((url) => url.startsWith("https://api.github.com/repos/a/b"))).toBe(true);
    expect(summary.languages).toEqual([{ name: "TypeScript", share: 75 }, { name: "CSS", share: 25 }]);
    expect(summary.readme.length).toBe(6_000);
    expect(summary.readmeTruncated).toBe(true);
    expect(summary.homepage).toBeNull();
  });
});
