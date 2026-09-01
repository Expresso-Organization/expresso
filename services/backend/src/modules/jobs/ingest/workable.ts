import type { JobSourceProvider } from "@expresso/contracts";

import { fetchJson, htmlToMarkdown, type JobSourceAdapter, type RawPosting } from "./adapter.js";

/**
 * Workable 공개 채용 보드.
 *
 * 고객사가 자기 사이트에 채용 목록 위젯을 붙이라고 열어 둔 자리다. 인증이 없고
 * `details=true`를 주면 본문이 함께 온다(실측: 루닛 18건, 본문 중앙값 4,378자).
 *
 *   GET https://apply.workable.com/api/v1/widget/accounts/{token}?details=true
 *
 * 응답 맨 위에 회사 이름이 있어서 그걸 쓴다. 목록 한 번이면 끝이라 공고마다
 * 다시 부를 일이 없다.
 *
 * 본문은 `description` 하나다. Workable 화면에는 요건·복지 칸이 따로 있지만
 * 위젯 응답에는 그 칸이 오지 않는다(실측에서 키 자체가 없었다) — 없는 칸을
 * 읽는 척하지 않는다.
 */

interface WorkableJob {
  title?: string;
  shortcode?: string;
  description?: string;
  department?: string;
  employment_type?: string;
  experience?: string;
  city?: string;
  state?: string;
  country?: string;
  url?: string;
  shortlink?: string;
}

interface WorkableAccount {
  name?: string;
  jobs?: WorkableJob[];
}

/** 도시와 나라를 사람이 읽는 한 줄로. 빈 칸은 빼고 잇는다. */
function place(job: WorkableJob): string | null {
  const parts = [job.city, job.state, job.country]
    .map((one) => one?.trim())
    .filter((one): one is string => Boolean(one));
  // `Seoul, Seoul, South Korea` 처럼 같은 말이 겹치는 응답이 있다.
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(", ").slice(0, 120) : null;
}

export class WorkableAdapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "workable";

  async fetch(token: string, displayName: string): Promise<RawPosting[]> {
    const payload = await fetchJson(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`,
    ) as WorkableAccount;
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    const company = (payload.name?.trim() || displayName).slice(0, 200);

    return jobs.flatMap((job): RawPosting[] => {
      const id = job.shortcode?.trim();
      const title = job.title?.trim();
      if (!id || !title) return [];

      return [{
        externalId: id,
        title: title.slice(0, 300),
        companyName: company,
        descriptionRaw: htmlToMarkdown(job.description ?? ""),
        sourceUrl: (job.url ?? job.shortlink)?.trim() ?? null,
        location: place(job),
        employmentType: job.employment_type?.trim().slice(0, 60) ?? null,
        experienceLabel: job.experience?.trim().slice(0, 60) ?? null,
        team: job.department?.trim().slice(0, 120) ?? null,
        // 마감일 칸이 없다.
        expiresAt: null,
      }];
    });
  }
}
