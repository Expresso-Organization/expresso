import { PortfolioPlanSchema, type PortfolioPlan } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import type { Db } from "mongodb";

import type { PageEvidence, PageGenerationContext, PageSection } from "./generator.js";
import { PageServiceError } from "./public.js";

/**
 * 제작(brew) 하나에서 지면이 읽는 자료입니다 — 레시피의 섹션 설계, 근거 원문, 공고와 회사, 쓴 사람.
 *
 * 포트폴리오가 아니라 제작 ID로 읽습니다. 디자인을 정하는 대화는 생성보다 먼저 일어나서 그때는 포트폴리오가 없습니다.
 * 지면 생성(`PageService`)과 디자인 대화(`DesignChatService`)가 같은 자료를 읽도록 한 곳에 둡니다.
 */
export interface BrewPageSources {
  brewId: string;
  author: PageGenerationContext["author"];
  portfolioPlan: PortfolioPlan | null;
  sections: PageSection[];
  evidence: PageEvidence[];
  jobTitle: string | null;
  company: PageGenerationContext["company"];
  /** 근거로 쓴 커리어 기록입니다. 지면 생성이 기록 본문에 든 그림 주소를 찾는 데 씁니다. */
  records: CareerRecordDoc[];
}

export async function brewPageSources(database: Db, userId: string, brewId: string): Promise<BrewPageSources> {
  const db = mongoCollections(database);
  const recipe = await db.recipes.find({ userId, brewId }).sort({ version: -1 }).limit(1).next();
  if (!recipe) throw new PageServiceError(404, "recipe not found for portfolio");
  const sections = await db.recipeSections.find({ userId, recipeId: recipe._id }).sort({ orderNo: 1 }).toArray();
  if (sections.length === 0) throw new PageServiceError(409, "recipe has no sections");
  const paths = await db.recipeEvidencePaths.find({ userId, recipeId: recipe._id }).toArray();
  const [records, answers, requirements, brew, author] = await Promise.all([
    // 휴지통에 넣은 기록은 새로 만드는 지면의 근거로 쓰지 않습니다.
    db.careerRecords.find({ userId, deletedAt: null, _id: { $in: paths.filter((p) => p.sourceType === "record").map((p) => p.sourceId) } }).toArray(),
    db.answers.find({ userId, _id: { $in: paths.filter((p) => p.sourceType === "answer").map((p) => p.sourceId) } }).toArray(),
    db.jobPostingRequirements.find({ _id: { $in: paths.filter((p) => p.sourceType === "requirement").map((p) => p.sourceId) } }).toArray(),
    db.brews.findOne({ _id: brewId, userId }),
    db.users.findOne({ _id: userId }),
  ]);
  const sourceText = (sourceId: string) => {
    const record = records.find(({ _id }) => _id === sourceId);
    if (record) return `${record.title}\n${record.bodyMd}`;
    const answer = answers.find(({ _id }) => _id === sourceId);
    if (answer) return answer.transcript;
    const requirement = requirements.find(({ _id }) => _id === sourceId);
    return requirement ? `${requirement.label}\n${typeof requirement.sourceSpan.quote === "string" ? requirement.sourceSpan.quote : ""}` : "";
  };
  const analysis = brew ? await db.jobAnalyses.findOne({ _id: brew.jobAnalysisId, userId }) : null;
  const posting = analysis?.jobPostingId ? await db.jobPostings.findOne({ _id: analysis.jobPostingId }) : null;
  const company = posting ? await db.companies.findOne({ _id: posting.companyId }) : null;
  return {
    brewId,
    author: author ? { name: author.displayName } : undefined,
    portfolioPlan: recipe.portfolioPlan ? PortfolioPlanSchema.parse(recipe.portfolioPlan) : null,
    sections: sections.map((row) => ({
      id: row._id,
      title: row.title,
      purpose: row.purpose,
      goal: typeof row.context.goal === "string" ? row.context.goal : "",
      points: Array.isArray(row.context.points) ? row.context.points.filter((v): v is string => typeof v === "string") : [],
      targetLength: row.targetLength,
    })),
    evidence: [...new Map(paths.map((path) => [path.sourceId, { id: path.sourceId, label: path.sourceLabel, text: sourceText(path.sourceId) }])).values()].filter(({ text }) => text.trim().length > 0),
    jobTitle: posting?.title ?? brew?.freeTitle ?? null,
    company: company
      ? {
          name: company.name,
          industry: company.industry ?? null,
          toneSummary: company.toneSummary ?? null,
          brandColors: Array.isArray(company.brandColors) ? company.brandColors.filter((v): v is string => typeof v === "string") : [],
        }
      : null,
    records,
  };
}
