"use server";

import type { ConsentScope } from "@expresso/contracts";
import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { consents } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 동의를 주고 끈다.
 *
 * 승낙은 **범위별로** 받는다. 공고만 주고 기록은 안 줄 수 있어야 하므로
 * 체크박스 두 개가 각각 서 있고, 아무것도 고르지 않은 채 넘어갈 수도 있다 —
 * 그때는 AI 기능이 잠기고 나중에 설정에서 켤 수 있다.
 */
function readScopes(formData: FormData): ConsentScope[] {
  const scopes: ConsentScope[] = [];
  if (formData.get("job_posting_analysis") === "on") scopes.push("job_posting_analysis");
  if (formData.get("career_records") === "on") scopes.push("career_records");
  return scopes;
}

export async function grantConsentAction(formData: FormData): Promise<void> {
  const policyVersion = Number(formData.get("policyVersion"));
  const next = formData.get("next");
  const scopes = readScopes(formData);

  if (scopes.length > 0 && Number.isInteger(policyVersion)) {
    const session = await requireSession();
    await consents.grant(session.accessToken, scopes, policyVersion);
  }
  revalidatePath("/account");
  // 아무것도 안 골라도 다음으로 간다. 동의는 강요할 수 있는 것이 아니다.
  if (typeof next === "string" && next.startsWith("/")) redirect(next as Route);
}

export async function revokeConsentAction(formData: FormData): Promise<void> {
  const scope = formData.get("scope");
  if (scope !== "job_posting_analysis" && scope !== "career_records") return;
  const session = await requireSession();
  await consents.revoke(session.accessToken, scope);
  revalidatePath("/account");
}
