import type { AgentContext, ProposalAction, ProposalStart } from "@expresso/contracts";

/**
 * 제안에서 대화를 시작할 때의 요청문과 연결할 자료. 서버가 쓴다.
 *
 * 모델이 요청문을 쓰게 하지 않는 까닭은 공고와 활동의 글이 바깥에서 온 글이기 때문이다.
 * 그 글이 요청문에 실리면 쓰기 도구를 가진 다음 대화로 넘어간다. 여기서는 자료를 연결로 넘기고,
 * 연결할 수 없는 활동만 제목과 주최를 한 줄로 적는다(줄바꿈을 지우고 길이를 묶는다).
 */
const LABEL: Record<ProposalAction, string> = {
  compare_job: "요건 대조하기",
  start_portfolio: "공고 열고 만들기",
  plan_activity: "참가 계획 세우기",
  strengthen_record: "질문받고 채우기",
};

/** 대화 하나에 연결하는 근거 기록의 수. */
const RECORD_CONTEXTS = 3;

function oneLine(text: string, limit: number): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/[「」]/g, "").trim().slice(0, limit);
}

export function proposalStart(input: {
  action: ProposalAction;
  subject: { kind: "job" | "activity" | "record"; id: string; title: string; host?: string; daysLeft?: number | null };
  recordIds: readonly string[];
}): ProposalStart {
  const { action, subject } = input;
  const records: AgentContext[] = input.recordIds.slice(0, RECORD_CONTEXTS).map((id) => ({ kind: "record", id }));
  if (action === "start_portfolio") return { kind: "link", label: LABEL[action], href: `/jobs/${subject.id}` };
  if (action === "compare_job") {
    return {
      kind: "chat",
      label: LABEL[action],
      prompt: "이 공고의 자격 요건을 내 커리어 기록과 비교해 줘. 근거가 있는 요건과 근거가 약하거나 없는 요건을 나눠서 알려 줘.",
      contexts: [{ kind: "job", id: subject.id }, ...records],
    };
  }
  if (action === "plan_activity") {
    const deadline = typeof subject.daysLeft !== "number" ? "" : subject.daysLeft === 0 ? " 오늘이 접수 마감이야." : ` 접수 마감까지 ${subject.daysLeft}일 남았어.`;
    return {
      kind: "chat",
      label: LABEL[action],
      prompt: `「${oneLine(subject.title, 120)}」(주최: ${oneLine(subject.host ?? "", 60) || "미상"})에 참가하려고 해.${deadline} 연결한 내 기록에서 어떤 경험을 내세울지, 마감까지 무엇을 준비할지 정리해 줘. 기록에 없는 내용은 지어내지 마.`,
      contexts: records,
    };
  }
  return {
    kind: "chat",
    label: LABEL[action],
    prompt: "이 기록에서 역할 · 행동 · 성과가 부족한 부분을 한 번에 하나씩 질문해 줘. 답을 받으면 기록 변경 제안을 만들어 줘. 내가 말하지 않은 수치는 넣지 마.",
    contexts: [{ kind: "record", id: subject.id }],
  };
}
