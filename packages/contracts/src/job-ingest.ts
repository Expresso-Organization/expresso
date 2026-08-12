import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

/**
 * 공고 수집.
 *
 * 우리가 모으는 곳은 세 갈래다.
 *
 * - **ATS 공개 채용 API**(`greenhouse` · `lever` · `ashby`) — 그 회사가 자기
 *   채용 페이지를 붙이라고 열어 둔 엔드포인트다. 인증이 없고 본문이 통째로 온다.
 * - **공공 API**(`work24`) — 고용24/워크넷. 무료·정식이지만 IT 공고가 얇다.
 * - **사용자가 준 주소 한 건**(아래 `ImportJobPostingSchema`) — 출처를 우리가
 *   고르지 않으므로 `job_source`에 서지 않는다.
 *
 * 채용 사이트를 훑는 크롤러는 여기 없다(구현 명세서 비범위). 원티드는 봇을
 * 막고, 잡코리아는 robots.txt에서 AI 크롤러를 이름으로 지목해 제한한다.
 */
export const JobSourceProviderSchema = z.enum(["greenhouse", "lever", "ashby", "work24"]);

export const JobSourceSchema = z.strictObject({
  id: UuidSchema,
  provider: JobSourceProviderSchema,
  /** 그 방식 안에서 이 출처를 가리키는 값. Greenhouse면 board token. */
  token: z.string().min(1).max(200),
  /** 화면에 그리는 이름. `job_posting.source_board`로 간다. */
  displayName: z.string().min(1).max(120),
  active: z.boolean(),
  lastRunAt: TimestampSchema.nullable(),
  lastStatus: z.enum(["succeeded", "failed"]).nullable(),
  lastError: z.string().max(300).nullable(),
  lastSeenCount: z.number().int().nonnegative(),
  lastAddedCount: z.number().int().nonnegative(),
  /**
   * 이 출처가 대변하는 회사의 자기 사이트. 로고를 여기서 받는다.
   *
   * 공고의 `sourceUrl`에서 짐작하지 않는다. Greenhouse에 얹은 회사는 그 값이
   * ATS를 가리키고, 본문 링크로 세어 보면 당근은 최빈 호스트가 카카오톡
   * 채널이다. 틀리면 **다른 회사 로고가 뜬다** — 안 뜨는 것보다 나쁘다.
   */
  siteUrl: z.url().max(2_000).nullable(),
});

export const CreateJobSourceSchema = z.strictObject({
  provider: JobSourceProviderSchema,
  token: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(120),
  /** 회사 자기 사이트. 없으면 그 출처의 회사는 로고 없이 이니셜로 선다. */
  siteUrl: z.url().max(2_000).nullable().optional(),
});

/**
 * 한 번의 수집이 남긴 것.
 *
 * `seen`은 출처가 내놓은 공고 수, `added`는 그중 처음 보는 것,
 * `skipped`는 이미 있어 건드리지 않은 것이다. **원문은 고칠 수 없으므로**
 * (0002) 이미 있는 공고는 갱신하지 않고 넘어간다 — 요건의 근거 구간이
 * 원문의 문자 위치를 가리키기 때문이다.
 */
export const JobIngestRunSchema = z.strictObject({
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema,
  sources: z.array(z.strictObject({
    sourceId: UuidSchema,
    provider: JobSourceProviderSchema,
    displayName: z.string().min(1).max(120),
    seen: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    /** 실패했으면 왜인지. 성공이면 null이다. */
    error: z.string().max(300).nullable(),
  })),
  totals: z.strictObject({
    seen: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    failedSources: z.number().int().nonnegative(),
    /**
     * 이번에 본문을 훑어 연봉 · 경력 · 근무 형태를 읽은 공고 수.
     *
     * 새로 들인 것과 따로 센다 — 규칙이 나아져 이미 들인 공고를 다시 읽는
     * 일이 생기고, 그때 `added`가 0인데도 화면의 값은 달라진다.
     */
    factsRead: z.number().int().nonnegative(),
    /** 이번에 마크를 새로 받아 둔 회사 수. */
    logosRead: z.number().int().nonnegative(),
  }),
});

/**
 * 주소 한 건으로 공고를 들인다.
 *
 * 크롤러가 아니다 — 사용자가 이미 보고 있는 페이지를 서버가 한 번 대신
 * 읽는다. 대부분의 채용 페이지에 `JobPosting` JSON-LD가 있어(Google for Jobs)
 * 회사·지역·고용형태·마감일이 구조화된 채로 온다. 본문은 JSON-LD가 얕을 수
 * 있어 페이지에서 따로 뽑는다.
 */
export const ImportJobPostingSchema = z.strictObject({
  url: z.url().max(2_000),
});

/**
 * 읽어 온 것. 사용자가 **보고 고친 뒤에** 제출한다.
 *
 * 바로 저장하지 않는 이유는 하나다 — 페이지에서 뽑은 글은 틀릴 수 있고,
 * 틀린 원문 위에서 뽑은 요건은 끝까지 틀린다. `job_posting.description_raw`는
 * 나중에 고칠 수도 없다(0002).
 */
export const ImportedJobPostingSchema = z.strictObject({
  sourceUrl: z.string().max(2_000),
  /** 읽어 낸 값. 하나라도 못 읽었으면 그 칸은 null이고 화면이 채우게 한다. */
  companyName: z.string().max(200).nullable(),
  title: z.string().max(300).nullable(),
  descriptionRaw: z.string().max(1_000_000),
  /** 어디서 읽었는지. 구조화 데이터가 있었으면 `json-ld`다. */
  extractedFrom: z.enum(["json-ld", "page-body"]),
  /** 구조화 데이터에만 있는 것들. 없으면 null이다. */
  employmentType: z.string().max(60).nullable(),
  location: z.string().max(120).nullable(),
  validThrough: TimestampSchema.nullable(),
});

export const JobSourceListResponseSchema = z.strictObject({
  data: z.array(JobSourceSchema),
});
/**
 * §8.3 「공고 사실 추출」 계약의 출력.
 *
 * 값 하나마다 **원문에서 그대로 잘라 온 인용**을 함께 받는다. 요건 추출과 같은
 * 규율이다 — 모델이 내놓은 것을 그대로 믿지 않고, 원문에 그 글자가 있는지
 * 우리가 다시 본다. 없으면 그 항목만 버린다.
 *
 * 연봉에서 특히 그렇다. 모아 둔 공고에는 `$174,00/year`처럼 0이 빠진 금액이
 * 있는데, 모델은 그걸 "$174,000"으로 자신 있게 고쳐 준다. 그 숫자가 인용 안에
 * 없으면 걸러진다.
 */
export const JobFactSchema = z.strictObject({
  /** 화면에 세울 말. `$164,000–$282,000` · `5년 이상` · `하이브리드`. */
  value: z.string().min(1).max(60),
  /** 그 말의 근거. 원문에서 한 글자도 바꾸지 않고 잘라 온다. */
  quote: z.string().min(1).max(400),
}).nullable();

export const JobFactsAiOutputSchema = z.strictObject({
  salary: JobFactSchema,
  experience: JobFactSchema,
  workType: JobFactSchema,
});

export const JobIngestRunResponseSchema = z.strictObject({ data: JobIngestRunSchema });
export const ImportedJobPostingResponseSchema = z.strictObject({
  data: ImportedJobPostingSchema,
});

export type JobSourceProvider = z.infer<typeof JobSourceProviderSchema>;
export type JobSource = z.infer<typeof JobSourceSchema>;
export type CreateJobSource = z.infer<typeof CreateJobSourceSchema>;
export type JobIngestRun = z.infer<typeof JobIngestRunSchema>;
export type ImportJobPosting = z.infer<typeof ImportJobPostingSchema>;
export type ImportedJobPosting = z.infer<typeof ImportedJobPostingSchema>;
export type JobFactsAiOutput = z.infer<typeof JobFactsAiOutputSchema>;
