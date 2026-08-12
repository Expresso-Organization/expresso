"use server";

import { LoginSchema, SignupSchema } from "@expresso/contracts";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { auth } from "@/lib/api/endpoints";
import { clearAccessToken, readAccessToken, writeAccessToken } from "@/lib/session";

export interface AuthFormState {
  /** §13 — 에러는 다음 행동으로 끝난다. 사과문만 남기지 않는다. */
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "displayName", string>>;
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: { email: "이메일과 비밀번호를 확인해 주세요." } };
  }

  try {
    const { data } = await auth.login(parsed.data);
    await writeAccessToken(data.session.accessToken, data.session.expiresAt);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { error: "이메일 또는 비밀번호가 맞지 않습니다. 다시 입력해 주세요." };
    }
    throw error;
  }

  redirect("/home");
}

export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    const fieldErrors: AuthFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email") fieldErrors.email = "유효한 이메일을 넣어주세요.";
      if (field === "password") fieldErrors.password = "10자 이상으로 적어주세요.";
      if (field === "displayName") fieldErrors.displayName = "이름을 적어주세요.";
    }
    return { fieldErrors };
  }

  try {
    const { data } = await auth.signup(parsed.data);
    await writeAccessToken(data.session.accessToken, data.session.expiresAt);
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
