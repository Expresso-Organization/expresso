"use server";

import { DummyAccountKeySchema } from "@expresso/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { admin } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export interface DummyActionState {
  error?: string;
}

const FAILED: Record<"create" | "refill" | "remove", string> = {
  create: "만들지 못했습니다. 다시 시도해 주세요.",
  refill: "다시 채우지 못했습니다. 다시 시도해 주세요.",
  remove: "지우지 못했습니다. 다시 시도해 주세요.",
};

/** 관리 화면 한 줄의 만들기 · 다시 채우기 · 지우기. 어느 것인지는 누른 버튼의 `intent`가 정한다. */
export async function manageDummyAction(_previous: DummyActionState, formData: FormData): Promise<DummyActionState> {
  const key = DummyAccountKeySchema.safeParse(formData.get("key"));
  const intent = formData.get("intent");
  if (!key.success || (intent !== "create" && intent !== "refill" && intent !== "remove")) return { error: FAILED.create };
  const session = await requireSession();
  try {
    if (intent === "create") await admin.create(session.accessToken, key.data);
    else if (intent === "refill") await admin.refill(session.accessToken, key.data);
    else await admin.remove(session.accessToken, key.data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && intent === "create") return { error: "이미 만들어진 계정입니다." };
    return { error: FAILED[intent] };
  }
  revalidatePath("/admin");
  return {};
}

/** 관리자 본인 세션을 그 더미 계정으로 돌리고 홈으로 간다. 쿠키는 그대로다. */
export async function impersonateAction(formData: FormData): Promise<void> {
  const key = DummyAccountKeySchema.safeParse(formData.get("key"));
  if (!key.success) return;
  const session = await requireSession();
  await admin.impersonate(session.accessToken, key.data);
  revalidatePath("/", "layout");
  redirect("/home");
}

/** 대신 로그인을 끝내고 관리 화면으로 돌아간다. */
export async function endImpersonationAction(): Promise<void> {
  const session = await requireSession();
  await admin.endImpersonation(session.accessToken);
  revalidatePath("/", "layout");
  redirect("/admin");
}
