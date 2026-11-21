/**
 * 공개 깃허브 레포를 읽는다(작업물 재료). 설명 · 주제 · 언어 비율 · README 앞부분만.
 *
 * 주소는 `https://github.com/{owner}/{repo}` 하나만 받는다 — 서버가 부르는 곳은 api.github.com으로 고정이라 사설 주소로 갈 길이 없다.
 * 토큰(`GITHUB_TOKEN`)이 있으면 실어 시간당 한도를 넓힌다. 없으면 공개 한도(시간당 60회) 안에서 돈다.
 */
export interface RepoSummary {
  fullName: string;
  url: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  languages: { name: string; share: number }[];
  readme: string;
  readmeTruncated: boolean;
}
export interface RepoReader { read(url: string): Promise<RepoSummary> }
export class RepoReadError extends Error { constructor(readonly code: "invalid_url" | "not_found" | "rate_limited" | "failed", message: string) { super(message); } }

const README_LIMIT = 6_000;

/** 깃허브 레포 주소에서 owner/repo를 뽑는다. 레포 안의 경로(/tree/…)는 무시한다. */
export function parseRepoUrl(value: string): { owner: string; repo: string } | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, "");
  const name = /^[A-Za-z0-9_.-]{1,100}$/;
  if (!owner || !repo || !name.test(owner) || !name.test(repo)) return null;
  return { owner, repo };
}

export class GithubRepoReader implements RepoReader {
  constructor(private readonly token: string | null = null, private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 10_000) {}

  async #get(path: string, accept = "application/vnd.github+json"): Promise<Response> {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      headers: { accept, "user-agent": "expresso-portfolio", "x-github-api-version": "2022-11-28", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "follow",
    });
    if (response.status === 403 || response.status === 429) throw new RepoReadError("rate_limited", "깃허브 요청 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.");
    return response;
  }

  async read(value: string): Promise<RepoSummary> {
    const parsed = parseRepoUrl(value);
    if (!parsed) throw new RepoReadError("invalid_url", "https://github.com/owner/repo 모양의 레포 주소만 읽을 수 있습니다.");
    const base = `/repos/${parsed.owner}/${parsed.repo}`;
    const repo = await this.#get(base);
    if (repo.status === 404) throw new RepoReadError("not_found", "레포를 찾지 못했습니다. 공개 레포인지 확인해 주세요.");
    if (!repo.ok) throw new RepoReadError("failed", `깃허브가 ${repo.status}로 답했습니다.`);
    const meta = await repo.json() as { full_name: string; html_url: string; description: string | null; homepage: string | null; topics?: string[] };
    const [languages, readme] = await Promise.all([
      this.#get(`${base}/languages`).then(async (response) => (response.ok ? (await response.json()) as Record<string, number> : {})).catch(() => ({})),
      this.#get(`${base}/readme`, "application/vnd.github.raw").then(async (response) => (response.ok ? response.text() : "")).catch(() => ""),
    ]);
    const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0) || 1;
    return {
      fullName: meta.full_name,
      url: meta.html_url,
      description: meta.description,
      homepage: meta.homepage || null,
      topics: (meta.topics ?? []).slice(0, 12),
      languages: Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, bytes]) => ({ name, share: Math.round((bytes / total) * 100) })),
      readme: readme.slice(0, README_LIMIT),
      readmeTruncated: readme.length > README_LIMIT,
    };
  }
}
