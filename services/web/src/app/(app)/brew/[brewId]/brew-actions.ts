"use server";

import { IdempotencyKeySchema } from "@expresso/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { publicWriteOperationFromError } from "@/lib/api/write-operation-errors";
import { brews, interview } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { brewJobKey } from "./brew-job-key";

/**
 * 위저드가 계약을 부르는 자리.
 *
 * 질문 생성과 레시피(구성) 생성은 **잡**이다 — 요청은 바로 돌아오고 워커가 계약을
 * 돌린다. 화면은 `brew.latestJob`을 보고 기다린다. 폼은 그 잡의 id를
 * `basisJobId`로 함께 보낸다 — 키가 어떻게 정해지는지는 `brewJobKey`에 있다.
 */

function reload(brewId: string): void {
  revalidatePath(`/brew/${brewId}/counter`);
  revalidatePath(`/brew/${brewId}/design`);
}

export async function startInterviewAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  // 같은 화면에서 두 번 눌러도 같은 잡을 가리킨다.
  await brews.startInterview(session.accessToken, brewId, brewJobKey("interview", brewId, formData.get("basisJobId")));
  reload(brewId);
}

/**
 * AI 대화를 마치고 디자인 선택으로 간다. 구성(레시피)은 화면 단계 없이 여기서 맡긴다 — 디자인을 고르는 동안
 * 만들어지고, 그 전에 만들기를 눌러도 구성이 끝나는 대로 생성이 이어진다.
 *
 * 키가 브루마다 하나라 여러 번 눌러도 같은 잡이다. 성공한 잡은 다시 돌지 않고, 실패한 잡만 다시 돈다.
 */
export async function continueToDesignAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  await brews.createRecipe(session.accessToken, brewId, `recipe:${brewId}`);
  reload(brewId);
  redirect(`/brew/${brewId}/design`);
}

export async function createRecipeAction(formData: FormData): Promise<void> {
  const brewId = formData.get("brewId");
  if (typeof brewId !== "string") return;
  const session = await requireSession();
  await brews.createRecipe(session.accessToken, brewId, brewJobKey("recipe", brewId, formData.get("basisJobId")));
  reload(brewId);
}

export async function answerQuestionAction(formData: FormData): Promise<Awaited<ReturnType<typeof interview.answer>> | null> {
  const brewId = formData.get("brewId");
  const sessionId = formData.get("sessionId");
  const questionId = formData.get("questionId");
  const transcript = formData.get("transcript");
  if (
    typeof brewId !== "string" || typeof sessionId !== "string"
    || typeof questionId !== "string" || typeof transcript !== "string"
    || !transcript.trim()
  ) return null;

  const session = await requireSession();
  const suppliedKey = formData.get("idempotencyKey");
  const key = typeof suppliedKey === "string" ? IdempotencyKeySchema.parse(suppliedKey) : "answer:" + questionId;
  try {
  const result = await interview.answer(
    session.accessToken,
    sessionId,
    questionId,
    { inputType: "text", transcript: transcript.trim() },
    // 같은 질문에 두 번 보내면 답이 갱신된다 — 새 답이 아니라 고친 답이다.
    key,
  );
  if (!("operationId" in result.data)) reload(brewId);
  return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const operation = publicWriteOperationFromError({ error: { code: error.code, message: error.message, requestId: error.requestId, details: error.details } }, "interview");
      if (operation) return { data: operation };
    }
    throw error;
  }
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
