"use server";

import { LoginSchema, SignupSchema } from "@expresso/contracts";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { safeNext } from "@/lib/auth/next-path";
import { clearPendingLink, readPendingLink } from "@/lib/auth/oauth-cookies";
import { clearAccessToken, readAccessToken, writeAccessToken } from "@/lib/session";

export interface AuthFormState {
  /** §13 — 에러는 다음 행동으로 끝난다. 사과문만 남기지 않는다. */
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "displayName", string>>;
}

type AuthFieldErrors = NonNullable<AuthFormState["fieldErrors"]>;
type AuthField = keyof AuthFieldErrors;

/** 검증 실패를 틀린 칸 아래에 붙인다. 어느 칸이든 이메일 아래에 몰아 두지 않는다. */
function fieldErrorsFrom(
  issues: readonly { path: PropertyKey[] }[],
  messages: Record<AuthField, string>,
): AuthFieldErrors {
  const fieldErrors: AuthFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === "email" || field === "password" || field === "displayName") {
      fieldErrors[field] = messages[field];
    }
  }
  return fieldErrors;
}

/**
 * "로그인 상태 유지" 체크. 폼은 `persistent=1|0`으로 보낸다. 값이 없으면 켬 —
 * 체크가 없는 폼(가입)도 지금까지와 같은 세션을 받게.
 */
function readPersistent(formData: FormData): boolean {
  return formData.get("persistent") !== "0";
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    persistent: readPersistent(formData),
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error.issues, {
        email: "유효한 이메일을 넣어주세요.",
        password: "비밀번호를 입력해 주세요.",
        displayName: "",
      }),
    };
  }

  try {
    const { data } = await auth.login(parsed.data);
    await writeAccessToken(data.session);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { error: "이메일 또는 비밀번호가 맞지 않습니다. 다시 입력해 주세요." };
    }
    throw error;
  }

  redirect(safeNext(formData.get("next")?.toString()));
}

export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    persistent: readPersistent(formData),
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error.issues, {
        email: "유효한 이메일을 넣어주세요.",
        password: "10자 이상으로 적어주세요.",
        displayName: "이름을 적어주세요.",
      }),
    };
  }

  try {
    const { data } = await auth.signup(parsed.data);
    await writeAccessToken(data.session);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return {
        fieldErrors: { email: "이미 가입된 이메일입니다. 로그인해 주세요." },
      };
    }
    throw error;
  }

  // 10b → 10c. 가입 직후에는 온보딩으로 들어간다.
  redirect("/onboarding/goal");
}

/**
 * Google을 기존 비밀번호 계정에 잇는다.
 *
 * 비밀번호 확인이 곧 소유 증명이다. 이 서비스에는 이메일 인증이 없어서
 * "Google 이메일이 같다"만으로는 같은 사람이라고 볼 근거가 없다.
 */
export async function linkGoogleAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const pending = await readPendingLink();
  // 10분이 지났거나 다른 경로로 들어왔다. 처음부터 다시 한다.
  if (!pending) redirect("/login?error=google_expired");

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { fieldErrors: { password: "비밀번호를 입력해 주세요." } };
  }

  try {
    const { data } = await auth.googleLink({
      idToken: pending.idToken,
      nonce: pending.nonce,
      password,
      persistent: pending.persistent,
    });
    await writeAccessToken(data.session);
    await clearPendingLink();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { error: "비밀번호가 맞지 않습니다. 다시 입력해 주세요." };
    }
    if (error instanceof ApiError) {
      await clearPendingLink();
      redirect("/login?error=google_failed");
    }
    throw error;
  }

  redirect(safeNext(pending.next));
}

export async function logoutAction(): Promise<void> {
  const accessToken = await readAccessToken();
  if (accessToken) {
    try {
      await auth.logout(accessToken);
    } catch (error) {
      // 서버 세션이 이미 만료됐어도 브라우저 쪽 쿠키는 반드시 지운다.
      if (!(error instanceof ApiError)) throw error;
    }
  }
  await clearAccessToken();
  redirect("/login");
}
