import type { AgentConversation, AgentToolResult, ConversationDigest } from "@expresso/contracts";

/**
 * 지난 대화의 요지. 저장된 대화에서 규칙으로 뽑는다. 순수 함수만 둔다.
 *
 * 모델이 쓴 요약이 아니다 — 사용자가 한 말, 완료한 도구 결과, 마지막 답변의 앞부분을 그대로 옮긴다.
 * 그래서 대화에 없는 일이 요지에 들어가지 않고, 만드는 데 AI 호출이 들지 않는다.
 */

const clip = (text: string, max: number) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

/** 도구 결과 하나가 남긴 일. 사용자가 승인하지 않은 초안과 실패한 호출은 요지에 넣지 않는다. */
function outcome(tool: AgentToolResult): string | null {
  if (tool.status !== "complete") return null;
  if (tool.recordDraft) return tool.recordDraft.status === "approved" ? `커리어 기록 저장: ${tool.recordDraft.title}` : null;
  if (tool.savedRecord) return tool.savedRecord.undone ? null : `커리어 기록 저장: ${tool.savedRecord.title}`;
  if (tool.commitment) return `약속: ${tool.commitment.title} (${tool.commitment.dueOn}까지)`;
  if (tool.diagnosis) { const count = (status: string) => tool.diagnosis!.items.filter(item => item.status === status).length; return `목표 진단: 공고 ${tool.diagnosis.sampleSize}건 기준 · 확인 ${count("confirmed") + count("partial")} · 미확인 ${count("unconfirmed")} · 부족 ${count("gap")}`; }
  if (tool.goalDraft) {
    if (tool.goalDraft.status !== "approved") return null;
    const changes = ([["하고 싶은 일", tool.goalDraft.work], ["일하고 싶은 곳", tool.goalDraft.place], ["시기와 상황", tool.goalDraft.timing]] as const).filter(([, value]) => value !== null).map(([label, value]) => `${label} → ${value}`);
    return `구직 목표 변경: ${changes.join(" · ")}`;
  }
  if (tool.planDraft) return tool.planDraft.status === "approved" ? `준비 계획 승인: ${tool.planDraft.title} (주 ${tool.planDraft.settings.weeklyHours}시간 · ${tool.planDraft.settings.weeks}주)` : null;
  if (tool.replanDraft) return tool.replanDraft.status === "approved" ? `준비 계획 재배치 승인 (주 ${tool.replanDraft.settings.weeklyHours}시간 · ${tool.replanDraft.settings.weeks}주)` : null;
  if (tool.pageEdit) return tool.pageEdit.undone ? null : `포트폴리오 지면 고침: ${tool.pageEdit.label}`;
  if (tool.gapReview) return `보완점 정리: ${tool.gapReview.items.length}개`;
  if (tool.review) return `요건 대조: 요건 ${tool.review.items.length}개`;
  if (tool.ui?.kind === "choice" && tool.ui.answer) {
    const { options, answer } = tool.ui;
    return `${tool.ui.prompt} → ${options.filter(option => answer.optionIds.includes(option.id)).map(option => option.label).join(", ")}`;
  }
  if (tool.ui?.kind === "form" && tool.ui.answer) {
    const { fields, answer } = tool.ui;
    return `${tool.ui.prompt} → ${answer.values.map(value => `${fields.find(field => field.id === value.id)?.label ?? value.id}: ${value.text}`).join(", ")}`;
  }
  return null;
}

export function digestConversation(conversation: Pick<AgentConversation, "id" | "title" | "updatedAt" | "messages">): ConversationDigest {
  // 선택지에서 고른 답은 결과 줄에 질문과 함께 남으므로 「한 말」에서는 뺀다.
  const spoken = conversation.messages.filter(message => message.role === "user" && !message.reply && message.text.trim());
  const picked = spoken.length <= 3 ? spoken : [spoken[0]!, spoken[1]!, spoken.at(-1)!];
  const outcomes = conversation.messages.flatMap(message => message.tools.map(outcome)).filter((line): line is string => line !== null);
  const lastAnswer = [...conversation.messages].reverse().find(message => message.role === "assistant" && message.text.trim())?.text ?? "";
  return {
    conversationId: conversation.id, title: clip(conversation.title, 120), updatedAt: conversation.updatedAt,
    said: picked.map(message => clip(message.text, 200)),
    outcomes: outcomes.slice(-8).map(line => clip(line, 300)),
    lastAnswer: clip(lastAnswer, 300),
  };
}
