import type { BrewDoc, MongoCollections } from "@expresso/database";
import type { ClientSession } from "mongodb";

type TitleCollections = Pick<MongoCollections, "jobAnalyses" | "jobPostings" | "companies">;

/**
 * 포트폴리오의 첫 제목.
 *
 * 사용자가 적은 이름이 먼저다. 공고로 만들면 이름이 없으므로 지원하는 회사로 부른다.
 * 공고명은 넣지 않는다 — 공고명에 회사명이 든 경우가 많고, 홈 카드가 공고명을 따로 보여 준다.
 */
export async function portfolioTitle(
  db: TitleCollections,
  userId: string,
  brew: Pick<BrewDoc, "jobAnalysisId" | "title" | "freeTitle"> | null,
  options: { session: ClientSession },
): Promise<string> {
  const named = brew?.title?.trim() || brew?.freeTitle?.trim();
  if (named) return named;
  const analysis = brew ? await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }, options) : null;
  const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }, options) : null;
  const company = posting ? await db.companies.findOne({ _id: posting.companyId }, options) : null;
  return company ? `${company.name} 지원 포트폴리오` : "새 포트폴리오";
}
