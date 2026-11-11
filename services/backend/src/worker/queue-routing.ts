export const QUEUE_NAMES = {
  domain: "domain-jobs",
  generation: "generation-jobs",
  refine: "page-refine",
  career: "career-jobs",
  search: "search-index-jobs",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** 아웃박스 토픽을 어느 줄에 세울지 정합니다. 오래 걸리는 작업이 짧은 작업의 자리를 차지하지 않게 나눕니다. */
export function queueNameFor(jobName: string): QueueName {
  if (jobName === "portfolio.generate") return QUEUE_NAMES.generation;
  if (jobName === "page.refine") return QUEUE_NAMES.refine;
  if (jobName.startsWith("career.evidence.")) return QUEUE_NAMES.search;
  if (jobName.startsWith("career.")) return QUEUE_NAMES.career;
  return QUEUE_NAMES.domain;
}
