"use server";

import { CancelDeletionSchema, NotificationKindSchema } from "@expresso/contracts";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { account, notificationSettings } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";
import { DELETION_CODE_COOKIE, DELETION_CODE_MAX_AGE_SECONDS, DELETION_CODE_PATH } from "@/lib/auth/deletion-code";
import { clearAccessToken } from "@/lib/session";


/** 09 알림 — 한 종류를 켜고 끈다. */
export async function setNotificationPreferenceAction(formData: FormData): Promise<void> {
  const kind = NotificationKindSchema.safeParse(formData.get("kind"));
  if (!kind.success) return;
  const session = await requireSession();
  await notificationSettings.set(session.accessToken, kind.data, formData.get("enabled") === "true");
  revalidatePath("/account");
}

export interface DeletionState {
  error?: string;
}

/**
 * 09 계정 삭제 요청.
 *
 * 요청하면 그 순간부터 이 계정으로는 아무 화면도 열리지 않는다. 그래서 세션 쿠키를
 * 지우고, 한 번 받은 취소 코드를 쿠키에 담아 로그인 없이 열리는 취소 화면으로 보낸다.
 */
export async function requestDeletionAction(_previous: DeletionState, formData: FormData): Promise<DeletionState> {
  if (formData.get("confirm") !== "yes") return { error: "삭제를 확인해 주세요." };
  const session = await requireSession();
  let cancellationToken: string | undefined;
  try {
    cancellationToken = (await account.requestDeletion(session.accessToken)).data.cancellationToken;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return { error: "이미 삭제를 요청한 계정입니다." };
    return { error: "삭제를 요청하지 못했습니다. 다시 시도해 주세요." };
  }
  if (!cancellationToken) return { error: "취소 코드를 받지 못했습니다. 지원 창구로 알려 주세요." };
  (await cookies()).set(DELETION_CODE_COOKIE, cancellationToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: DELETION_CODE_PATH,
    maxAge: DELETION_CODE_MAX_AGE_SECONDS,
  });
  await clearAccessToken();
  redirect("/login/restore");
}

/** 취소 코드를 적어 둔 뒤 화면에서 지운다. */
export async function dismissDeletionCodeAction(): Promise<void> {
  (await cookies()).delete({ name: DELETION_CODE_COOKIE, path: DELETION_CODE_PATH });
  redirect("/login/restore");
}

export interface RestoreState {
  restored?: boolean;
  error?: string;
}

/** 로그인 없이 취소 코드로 삭제 요청을 되돌린다. */
export async function cancelDeletionAction(_previous: RestoreState, formData: FormData): Promise<RestoreState> {
  const parsed = CancelDeletionSchema.safeParse({ cancellationToken: String(formData.get("cancellationToken") ?? "").trim() });
  if (!parsed.success) return { error: "받은 취소 코드를 그대로 붙여 넣어 주세요." };
  try {
    await account.cancelDeletion(parsed.data.cancellationToken);
    (await cookies()).delete({ name: DELETION_CODE_COOKIE, path: DELETION_CODE_PATH });
    return { restored: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { error: "그 코드로 진행 중인 삭제 요청을 찾지 못했습니다." };
    if (error instanceof ApiError && error.status === 409) return { error: "30일이 지나 이미 지우기 시작했습니다. 되돌릴 수 없습니다." };
    return { error: "되돌리지 못했습니다. 다시 시도해 주세요." };
  }
}
