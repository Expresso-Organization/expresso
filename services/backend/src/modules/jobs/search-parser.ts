import type { JobSearchCondition } from "@expresso/contracts";
import { normalizeRegion } from "./ingest/classify.js";

/**
 * 규칙 기반 검색 해석기. §8.3의 AI 계약이 붙기 전까지 쓰는 자리다
 * (`docs/API_GAPS.md`).
 *
 * 사전은 화면 정의서 00b · 06이 실제로 던지는 말과, 공고에 실제로 들어 있는
 * 기술 이름을 기준으로 둔다. 읽지 못한 말은 조건을 만들지 않는다 —
 * 없는 조건을 지어내는 쪽이 훨씬 나쁘다.
 */

/** AI 해석기(search-interpreter.ts)도 같은 사전을 쓴다 — 두 곳에 따로 두면 갈린다. */
export const TECHNOLOGIES = [
  "typescript",
  "javascript",
  "python",
  "java",
  "kotlin",
  "scala",
  "go",
  "golang",
  "postgresql",
  "postgres",
  "mysql",
  "redis",
  "kubernetes",
  "k8s",
  "terraform",
  "aws",
  "airflow",
  "spark",
  "dbt",
  "kafka",
  "flink",
  "hadoop",
  "iceberg",
  "bigquery",
  "elasticsearch",
  "django",
  "celery",
] as const;

export const CANONICAL: Record<string, string> = {
  postgres: "postgresql",
  k8s: "kubernetes",
  golang: "go",
};

const ROLES = [
  "backend",
  "frontend",
  "fullstack",
  "data engineer",
  "백엔드",
  "프론트엔드",
  "데이터 엔지니어",
  "데이터 플랫폼",
  "플랫폼 엔지니어",
  "서버 개발자",
] as const;

/** 짧은 이름(go · java)이 다른 낱말 안에서 잡히지 않게 경계를 둔다. */
function mentions(normalized: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalized);
}

export function interpretSearchQuery(query: string): JobSearchCondition[] {
  const normalized = query.normalize("NFKC").toLocaleLowerCase("en-US");
  const conditions: JobSearchCondition[] = [];
  const add = (condition: JobSearchCondition) => {
    if (!conditions.some(({ field, value }) =>
      field === condition.field && value === condition.value)) {
      conditions.push(condition);
    }
  };

  for (const role of ROLES) {
    if (normalized.includes(role)) {
      add({ field: "role", value: role, enabled: true, confidence: 0.95 });
    }
  }
  const experience = /(\d+)\s*(?:\+\s*)?(?:years?|년)/i.exec(normalized);
  if (experience?.[1]) {
    add({
      field: "experience",
      value: Number(experience[1]),
      enabled: true,
      confidence: 0.95,
    });
  }
  if (/hybrid|하이브리드/.test(normalized)) {
    add({ field: "work_type", value: "hybrid", enabled: true, confidence: 0.95 });
  } else if (/remote|리모트|원격|재택/.test(normalized)) {
    add({ field: "work_type", value: "remote", enabled: true, confidence: 0.95 });
  } else if (/on[ -]?site|출근/.test(normalized)) {
    add({ field: "work_type", value: "on-site", enabled: true, confidence: 0.9 });
  }
  // 지역 사전은 공고 수집 쪽(ingest/classify.ts)의 REGION_RULES를 그대로 쓴다 —
  // 두 곳에 각자 사전을 두면 "성수"처럼 한쪽만 알아듣는 말이 생긴다.
  const region = normalizeRegion(normalized);
  if (region) {
    add({ field: "location", value: region, enabled: true, confidence: 0.9 });
  }
  for (const technology of TECHNOLOGIES) {
    if (mentions(normalized, technology)) {
      add({
        field: "technology",
        value: CANONICAL[technology] ?? technology,
        enabled: true,
        confidence: 0.98,
      });
    }
  }
  // "연봉 6000" · "연봉 8천". 확신이 낮아 칩은 꺼진 채로 만든다.
  const salary = /(?:salary|연봉)\s*(\d{4,})/i.exec(normalized)
    ?? /(?:salary|연봉)\s*(\d{1,2})\s*천/i.exec(normalized);
  if (salary?.[1]) {
    const amount = /천/.test(salary[0]) ? Number(salary[1]) * 1_000 : Number(salary[1]);
    add({ field: "salary", value: amount, enabled: false, confidence: 0.65 });
  }
  return conditions;
}
