/** 명시적인 부정·팀원 기여의 전환만 차단합니다. 일반 의미 충실도는 AI 검토와 사용자 확인이 필요합니다. */
export function claimContradictions(claim: string, evidence: string): string[] {
 if (evidence.includes(claim.trim())) return [];
 const issues: string[] = [];
 const technologies = ["Java", "Spring Boot", "SQL", "MongoDB", "Redis", "Docker", "AWS EC2", "TypeScript", "Node.js"];
 for (const tech of technologies) {
  const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mention = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i");
  if (!mention.test(claim)) continue;
  const negative = new RegExp(`${escaped}(?:[을를은는의로와과·\\s]|사용|개발|활용|경험|프로젝트){0,12}(?:없|않|못)`, "i");
  const positive = new RegExp(`${escaped}[^.\\n]{0,24}(?:구현했|개발했|사용했|활용했|배포했)`, "i");
  if (negative.test(evidence) && positive.test(claim) && !negative.test(claim)) issues.push(`${tech}의 부정 근거를 사용 경험으로 바꿀 수 없습니다.`);
 }
 if (/(?:데이터 구조|스키마|데이터베이스 설계)[^.\n]{0,18}팀원/.test(evidence) && /(?:데이터 구조|스키마|데이터베이스)[^.\n]{0,12}(?:직접 설계|설계했|설계하고)/.test(claim) && !/팀원/.test(claim)) issues.push("팀원의 데이터 설계를 본인의 기여로 바꿀 수 없습니다.");
 return issues;
}
