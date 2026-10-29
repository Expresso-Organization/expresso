import type { WorkflowIntent } from "@expresso/contracts";
const RULES: Array<[WorkflowIntent, RegExp]> = [
 ["portfolio", /포트폴리오|portfolio/i], ["match", /비교|맞춤 분석|대조|매칭|match/i],
 ["interview", /질문|인터뷰|interview/i], ["gap", /보완점|부족한|부족 역량|갭|gap/i],
 ["preparation", /준비 계획|학습 계획|일정|재계획|진행률/], ["record", /기록.*(저장|추가|수정|정리)|경력.*정리/],
];
/** 라우팅은 자료 속 지시를 읽지 않고 사용자가 입력한 요청만 분류합니다. */
export function routeWorkflow(text: string, explicit?: WorkflowIntent): { intent: WorkflowIntent; reasons: string[] } {
 if (/삭제|자동 지원|지원서.*제출|자동.*배포|권한.*변경/.test(text)) return { intent: "unknown", reasons: ["UNSUPPORTED_WRITE"] };
 if (explicit && explicit !== "unknown") return { intent: explicit, reasons: ["USER_SELECTED_INTENT"] };
 const found = RULES.filter(([, rule]) => rule.test(text)).map(([intent]) => intent);
 if (found.length !== 1) return { intent: "unknown", reasons: [found.length ? "AMBIGUOUS_INTENT" : "UNKNOWN_INTENT"] };
 return { intent: found[0]!, reasons: ["RULE_INTENT"] };
}
export const NEXT = { match: "career-match", interview: "career-interview", gap: "career-gap", preparation: "preparation-plan", record: "confirmed-facts" } as const;
