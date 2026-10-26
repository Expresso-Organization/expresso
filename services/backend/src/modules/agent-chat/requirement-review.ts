import { createHash } from "node:crypto";
import { careerDocumentToMarkdown } from "@expresso/editor";
import type { CareerDocumentBootstrap, CareerPropertyDefinitionV2, CareerRecord, RequirementReview, RequirementReviewDraft } from "@expresso/contracts";
import { readableCareerProperties } from "../career/index.js";

/**
 * 요건 대조의 근거 검증.
 *
 * 에이전트가 쓴 인용이 원문 안에 그대로 있는지만 본다 — 의미가 맞는지는 판단하지 않는다.
 * 줄바꿈 · 연속 공백 차이는 인용을 옮기며 생기기 쉬우므로 하나의 공백으로 접어 비교한다.
 */
export const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
export const hash = (text: string) => createHash("sha256").update(normalize(text)).digest("hex");

/** 속성 값 중 사람이 읽는 글자(문자열 · 숫자)만 모은다. 구조는 인용 대상이 아니다. */
function propertyText(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(propertyText);
  if (value && typeof value === "object") return Object.values(value).flatMap(propertyText);
  return [];
}

/** 에이전트가 읽고 인용하는 기록의 글. 대조 검증과 최신성 해시가 같은 글을 본다. 선택지는 이름으로 읽는다. */
export function recordText(record: Pick<CareerRecord, "title" | "properties">, document: CareerDocumentBootstrap["document"], definitions: readonly CareerPropertyDefinitionV2[]) {
  return [record.title, careerDocumentToMarkdown(document), ...propertyText(readableCareerProperties(record.properties, definitions))].filter(Boolean).join("\n\n");
}

/** 어긋난 항목을 사람이 읽을 문장으로 돌려준다. 비어 있으면 통과다. */
export function reviewIssues(draft: RequirementReviewDraft, jobText: string, records: ReadonlyMap<string, { title: string; text: string }>) {
  const issues: string[] = [];
  const job = normalize(jobText);
  const seen = new Set<string>();
  draft.items.forEach((item, index) => {
    const label = `${index + 1}번 요건 "${item.requirement}"`;
    const key = normalize(item.requirement).toLowerCase();
    if (seen.has(key)) issues.push(`${label}: 같은 요건이 두 번 있습니다.`);
    seen.add(key);
    if (!job.includes(normalize(item.jobQuote))) issues.push(`${label}: 공고 인용 "${item.jobQuote}"이 공고 원문에 없습니다. 원문을 그대로 옮겨 주세요.`);
    for (const evidence of item.evidence) {
      const record = records.get(evidence.recordId);
      if (!record) { issues.push(`${label}: 근거 기록 ${evidence.recordId}를 찾을 수 없습니다. read_career_records로 읽은 기록만 인용할 수 있습니다.`); continue; }
      if (!normalize(record.text).includes(normalize(evidence.quote))) issues.push(`${label}: "${record.title}"에 인용 "${evidence.quote}"이 없습니다. 기록 본문을 그대로 옮겨 주세요.`);
    }
  });
  return issues;
}

/** 검증을 통과한 초안을 저장형으로 바꾼다. 근거마다 기록 제목을 붙이고 원문 해시를 남긴다. */
export function buildReview(draft: RequirementReviewDraft, jobText: string, records: ReadonlyMap<string, { title: string; text: string }>, now = new Date()): RequirementReview {
  const cited = [...new Set(draft.items.flatMap(item => item.evidence.map(evidence => evidence.recordId)))];
  return {
    jobPostingId: draft.jobPostingId,
    summary: draft.summary,
    items: draft.items.map(item => ({ ...item, evidence: item.evidence.map(evidence => ({ ...evidence, recordTitle: records.get(evidence.recordId)!.title.slice(0, 200) })) })),
    snapshot: { jobContentHash: hash(jobText), records: cited.map(recordId => ({ recordId, textHash: hash(records.get(recordId)!.text) })) },
    createdAt: now.toISOString(),
  };
}
