"use server";

import { revalidatePath } from "next/cache";

import { brews, interview } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 위저드가 계약을 부르는 자리.
 *
 * 질문 생성과 레시피 생성은 **잡**이다 — 요청은 바로 돌아오고 워커가 계약을
 * 돌린다. 화면은 `brew.latestJob`을 보고 기다린다.
 */

function reload(brewId: string): void {
  revalidatePath(`/brew/${brewId}/counter`);
  revalidatePath(`/brew/${brewId}/outline`);
}

export async function startInterviewAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  // 잡 하나면 충분하다. 같은 brew에 두 번 눌러도 같은 잡을 가리킨다.
  await brews.startInterview(session.accessToken, brewId, `interview:${brewId}`);
  reload(brewId);
}

export async function createRecipeAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  await brews.createRecipe(session.accessToken, brewId, `recipe:${brewId}`);
  reload(brewId);
}

export async function answerQuestionAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  const sessionId = formData.get("sessionId");
  const questionId = formData.get("questionId");
  const transcript = formData.get("transcript");
  if (
    typeof brewId !== "string" || typeof sessionId !== "string"
    || typeof questionId !== "string" || typeof transcript !== "string"
    || !transcript.trim()
  ) return;

  const session = await requireSession();
  await interview.answer(
    session.accessToken,
    sessionId,
    questionId,
    { inputType: "text", transcript: transcript.trim() },
    // 같은 질문에 두 번 보내면 답이 갱신된다 — 새 답이 아니라 고친 답이다.
    `answer:${questionId}`,
  );
  reload(brewId);
}

export async function replaceQuestionAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  const sessionId = formData.get("sessionId");
  const questionId = formData.get("questionId");
  if (typeof brewId !== "string" || typeof sessionId !== "string"
    || typeof questionId !== "string") return;
  const session = await requireSession();
  await interview.replaceQuestion(session.accessToken, sessionId, questionId);
  reload(brewId);
}
