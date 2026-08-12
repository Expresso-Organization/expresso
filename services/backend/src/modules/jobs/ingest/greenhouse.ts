import type { JobSourceProvider } from "@expresso/contracts";

import { fetchJson, htmlToMarkdown, type JobSourceAdapter, type RawPosting } from "./adapter.js";

/**
 * Greenhouse 공개 채용 API.
 *
 * 스크래핑이 아니다 — 고객사가 자기 홈페이지에 채용 목록을 붙이라고 열어 둔
 * 엔드포인트이고 인증이 없다. `?content=true`를 주면 **본문이 통째로** 온다
 * (실측: 당근 공고 하나가 5,700자). 요건을 뽑으려면 이 본문이 필요하다.
 *
 *   GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *
 * `metadata`는 고객사가 제 마음대로 정하는 칸이라 이름이 고정이 아니다.
 * 우리가 아는 이름만 줍고 나머지는 버린다 — 짐작해서 채우면 화면이 거짓을
 * 말한다.
 */

interface GreenhouseJob {
  id?: number;
  title?: string;
  content?: string;
  absolute_url?: string;
  company_name?: string;
  location?: { name?: string };
  departments?: { name?: string }[];
  offices?: { name?: string }[];
  application_deadline?: string | null;
  metadata?: { name?: string; value?: unknown }[];
}

/** 고객사가 붙이는 이름은 제각각이라, 아는 것만 줍는다. */
const EMPLOYMENT_KEYS = ["employment type", "고용형태", "고용 형태"];
const EXPERIENCE_KEYS = ["prior experience", "경력", "경력사항"];

function metaValue(job: GreenhouseJob, keys: string[]): string | null {
  for (const entry of job.metadata ?? []) {
    const name = (entry.name ?? "").trim().toLocaleLowerCase("en-US");
    if (!keys.includes(name)) continue;
    const value = entry.value;
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 60);
    if (Array.isArray(value)) {
      const joined = value.filter((one) => typeof one === "string").join(", ").trim();
      if (joined) return joined.slice(0, 60);
    }
  }
  return null;
}

export class GreenhouseAdapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "greenhouse";

  async fetch(token: string): Promise<RawPosting[]> {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    ) as { jobs?: GreenhouseJob[] };
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

    return jobs.flatMap((job): RawPosting[] => {
      const id = job.id;
      const title = job.title?.trim();
      // 짧은 본문을 거르는 것은 수집 서비스의 일이다 — 출처마다 다른 기준을
      // 두면 어느 공고가 왜 빠졌는지 말할 수 없다.
      const body = htmlToMarkdown(job.content ?? "");
      if (!id || !title) return [];

      const deadline = job.application_deadline ? new Date(job.application_deadline) : null;
      return [{
        externalId: String(id),
        title: title.slice(0, 300),
        // `company_name`이 비어 있으면 출처 이름이 회사 이름이다.
        companyName: (job.company_name?.trim() || token).slice(0, 200),
        descriptionRaw: body,
        sourceUrl: job.absolute_url?.trim() ?? null,
        location: job.location?.name?.trim().slice(0, 120) ?? null,
        employmentType: metaValue(job, EMPLOYMENT_KEYS),
        experienceLabel: metaValue(job, EXPERIENCE_KEYS),
        team: job.departments?.[0]?.name?.trim().slice(0, 120) ?? null,
        expiresAt: deadline && !Number.isNaN(deadline.getTime()) ? deadline : null,
      }];
    });
  }
}
