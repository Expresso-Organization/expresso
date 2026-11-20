import type { Activity, AgentFindItem, JobPostingSummary } from "@expresso/contracts";

/**
 * 대화에서 찾은 공고 · 활동을 목록의 줄로 옮긴다.
 *
 * 줄에는 서버의 검색 결과만 싣는다 — 제목 · 회사 · 마감은 모델이 옮겨 적지 않는다.
 * 공고는 앱 안의 공고 화면으로, 활동은 출처의 주소로 간다.
 */
/** 활동 종류의 이름. 종류는 수집 출처가 늘면 함께 는다(#253의 부트캠프) — 모르는 종류는 이름 없이 분야만 싣는다. */
const ACTIVITY_KIND: Record<string, string> = { contest: "공모전", hackathon: "해커톤", bootcamp: "부트캠프" };
const pieces = (...values: (string | null | undefined)[]) => values.map(value => value?.trim()).filter((value): value is string => !!value).map(value => value.slice(0, 80)).slice(0, 4);

export function jobItem(job: JobPostingSummary): AgentFindItem {
  return { kind: "job", id: job.id, title: job.title, sub: job.company.name.slice(0, 200), meta: pieces(job.location, job.experienceLabel, job.workType, job.family), daysLeft: job.daysLeft, href: `/jobs/${job.id}`, external: false };
}

export function activityItem(activity: Activity): AgentFindItem {
  return { kind: "activity", id: activity.id, title: activity.title, sub: activity.host.slice(0, 200), meta: pieces(ACTIVITY_KIND[activity.kind], ...activity.fields.slice(0, 2)), daysLeft: activity.daysLeft, href: activity.url, external: true };
}

/** 활동의 제목 · 주최 · 분야에서 글을 찾는다. 낱말을 띄어 적으면 모두 들어 있어야 한다. */
export function activityMatches(activity: Activity, query: string | undefined) {
  if (!query) return true;
  const text = [activity.title, activity.host, ...activity.fields].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  return query.normalize("NFKC").toLocaleLowerCase("en-US").split(/\s+/).filter(Boolean).every(word => text.includes(word));
}
