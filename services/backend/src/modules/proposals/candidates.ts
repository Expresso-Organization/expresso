import type { ActivityKind } from "@expresso/contracts";

/**
 * 능동 제안의 후보 고르기. 순수 함수만 둔다.
 *
 * 무엇을 모델에게 보일지는 여기서 로직으로 정한다 — 새로 들어온 공고와 활동, 다시 제안하지 않을
 * 대상, 손볼 기록. 모델은 이 후보 안에서만 고르고 글을 쓴다. 후보 수를 묶어 두는 까닭은
 * 가장 낮은 단계의 모델이 한 번에 읽고 쓰는 양을 작게 유지하기 위해서다.
 */

/** 마감 임박의 기준. 공고 목록의 `deadline=urgent`와 같은 7일이다. */
export const URGENT_DAYS = 7;
/** 모델에게 보이는 공고 · 활동 · 손볼 기록의 수. */
export const JOB_CANDIDATES = 8;
export const ACTIVITY_CANDIDATES = 6;
export const WEAK_RECORD_CANDIDATES = 4;
/** 모델에게 보이는 내 기록의 수와 기록 하나에서 싣는 글자 수. */
export const RECORD_CONTEXT = 30;
export const RECORD_EXCERPT = 240;

/** 성과를 적는 분류 — 경험 · 프로젝트 · 활동. 학력 · 자격 · 스킬은 숫자가 없어도 된다. */
const OUTCOME_CATEGORIES = new Set(["experience", "project", "activity_leadership"]);
const SKILL_CATEGORY = "skill_tool";

export interface RecordInput {
  id: string;
  title: string;
  categoryKey: string;
  categoryName: string;
  bodyMd: string;
  /** 속성을 사람이 읽는 값으로 바꾼 것(선택 속성은 이름). */
  properties: Record<string, unknown>;
  isEmpty: boolean;
}

export interface JobInput {
  id: string;
  title: string;
  company: string;
  /** 화면이 그릴 회사 아바타. 고르는 데는 쓰지 않고 그대로 넘긴다. */
  avatar: { name: string; initial: string | null; avatarBackground: string | null; avatarColor: string | null; logoUrl: string | null };
  family: string | null;
  technologies: string[];
  daysLeft: number | null;
  createdAt: string;
}

export interface ActivityInput {
  id: string;
  kind: ActivityKind;
  title: string;
  host: string;
  fields: string[];
  url: string;
  daysLeft: number;
  firstSeenAt: string;
}

export interface JobCandidate extends JobInput { watched: boolean; matched: string[] }
export interface ActivityCandidate extends ActivityInput { matched: string[] }
export interface RecordBrief { id: string; title: string; categoryKey: string; categoryName: string; excerpt: string }
export interface WeakRecord { id: string; title: string; categoryKey: string; categoryName: string; why: "empty" | "no_numbers" }

export interface Candidates {
  jobs: JobCandidate[];
  activities: ActivityCandidate[];
  weakRecords: WeakRecord[];
  records: RecordBrief[];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * 사용자의 기술 용어. 스킬 · 도구 기록의 제목과, 다른 기록의 여러 값 선택 속성(스택)에서 뽑는다.
 * 「웹 성능 측정(Lighthouse · Web Vitals)」은 「웹 성능 측정」 · 「Lighthouse」 · 「Web Vitals」가 된다.
 */
export function userTerms(records: readonly RecordInput[]): string[] {
  const found = new Map<string, string>();
  const add = (text: string) => {
    for (const part of text.split(/[·,/()[\]]|\s+및\s+/)) {
      const term = part.trim();
      // 한 글자는 다른 낱말 안에 우연히 들어 있는 일이 많다.
      if (term.length < 2 || term.length > 30) continue;
      if (!found.has(term.toLowerCase())) found.set(term.toLowerCase(), term);
    }
  };
  for (const record of records) {
    if (record.categoryKey === SKILL_CATEGORY) add(record.title);
    for (const value of Object.values(record.properties)) if (Array.isArray(value)) for (const item of strings(value)) add(item);
  }
  return [...found.values()];
}

/** `text` 안에 들어 있는 용어. 영문 · 숫자로만 된 용어는 낱말 경계를 본다(「Go」가 「Google」에 걸리지 않게). */
export function matchedTerms(text: string, terms: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return terms.filter((term) => {
    const needle = term.toLowerCase();
    if (!/^[a-z0-9.+#\- ]+$/.test(needle)) return haystack.includes(needle);
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack);
  });
}

function jobText(job: JobInput): string {
  return [job.title, job.family ?? "", ...job.technologies].join(" ");
}

function activityText(activity: ActivityInput): string {
  return [activity.title, ...activity.fields].join(" ");
}

function isFresh(at: string, seenThrough: Date | null): boolean {
  return seenThrough === null || Date.parse(at) > seenThrough.getTime();
}

/** 성과를 적는 분류인데 본문과 성과 속성 어디에도 숫자가 없는 기록. */
export function lacksNumbers(record: RecordInput): boolean {
  if (!OUTCOME_CATEGORIES.has(record.categoryKey)) return false;
  return !/\d/.test(`${record.bodyMd} ${strings(record.properties.outcome).join(" ")}`);
}

export function pickCandidates(input: {
  records: readonly RecordInput[];
  /** 진행 중인 공고(최근 수집 순). */
  jobs: readonly JobInput[];
  /** 관심 공고. */
  watched: readonly JobInput[];
  activities: readonly ActivityInput[];
  /** 지난 실행이 읽은 곳까지의 시각. 첫 실행이면 null이고 진행 중인 것 전부가 새 소식이다. */
  seenThrough: Date | null;
  /** 다시 제안하지 않는 대상과 이미 제안에 있는 대상(`job:<id>` · `activity:<id>` · `record:<id>`). */
  exclude: ReadonlySet<string>;
}): Candidates {
  const terms = userTerms(input.records);

  const closing = input.watched
    .filter((job) => job.daysLeft !== null && job.daysLeft >= 0 && job.daysLeft <= URGENT_DAYS && !input.exclude.has(`job:${job.id}`))
    .map((job) => ({ ...job, watched: true, matched: matchedTerms(jobText(job), terms) }));
  const closingIds = new Set(closing.map((job) => job.id));
  const fresh = input.jobs
    .filter((job) => !closingIds.has(job.id) && !input.exclude.has(`job:${job.id}`) && isFresh(job.createdAt, input.seenThrough))
    .map((job) => ({ ...job, watched: false, matched: matchedTerms(jobText(job), terms) }))
    .filter((job) => job.matched.length > 0)
    .sort((left, right) => right.matched.length - left.matched.length || right.createdAt.localeCompare(left.createdAt));
  const jobs = [...closing, ...fresh].slice(0, JOB_CANDIDATES);

  const activities = input.activities
    .filter((activity) => !input.exclude.has(`activity:${activity.id}`) && isFresh(activity.firstSeenAt, input.seenThrough))
    .map((activity) => ({ ...activity, matched: matchedTerms(activityText(activity), terms) }))
    .sort((left, right) => left.daysLeft - right.daysLeft)
    .slice(0, ACTIVITY_CANDIDATES);

  const weakRecords = input.records
    .flatMap((record): WeakRecord[] => {
      if (input.exclude.has(`record:${record.id}`)) return [];
      const why = record.isEmpty ? "empty" : lacksNumbers(record) ? "no_numbers" : null;
      return why ? [{ id: record.id, title: record.title || "제목 없음", categoryKey: record.categoryKey, categoryName: record.categoryName, why }] : [];
    })
    .slice(0, WEAK_RECORD_CANDIDATES);

  // 스킬 · 도구 기록은 용어로 이미 쓰였다. 근거로 들 기록은 경험을 적은 것부터 싣는다.
  const records = [...input.records]
    .filter((record) => !record.isEmpty)
    .sort((left, right) => Number(right.categoryKey !== SKILL_CATEGORY) - Number(left.categoryKey !== SKILL_CATEGORY))
    .slice(0, RECORD_CONTEXT)
    .map((record) => ({
      id: record.id,
      title: record.title || "제목 없음",
      categoryKey: record.categoryKey,
      categoryName: record.categoryName,
      excerpt: `${record.bodyMd} ${strings(record.properties.outcome).join(" ")}`.replace(/\s+/g, " ").trim().slice(0, RECORD_EXCERPT),
    }));

  return { jobs, activities, weakRecords, records };
}

/** 제안할 거리가 있는가. 없으면 실행하지 않는다. */
export function hasCandidates(candidates: Candidates): boolean {
  return candidates.jobs.length > 0 || candidates.activities.length > 0 || candidates.weakRecords.length > 0;
}

/**
 * 새 소식이 이 사용자와 관련 있는가. 새로 들어온 공고나 활동이 사용자의 기술 용어와 하나라도 맞으면 참이다.
 * 새 소식 실행은 이 판정을 통과한 사용자에게만 맡긴다 — 관련 없는 사용자의 크레딧을 쓰지 않는다.
 */
export function hasRelevantNews(candidates: Candidates): boolean {
  return candidates.jobs.some((job) => !job.watched && job.matched.length > 0) || candidates.activities.some((activity) => activity.matched.length > 0);
}
