"use server";

import { SlugSchema } from "@expresso/contracts";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { publishing } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 08b 배포.
 *
 * 배포는 **버전을 하나 더 만드는 일**이다. 덮어쓰지 않으므로 되돌릴 곳이 남고,
 * 주소를 바꿔도 옛 주소가 30일간 새 주소로 넘어간다. 공개 중단조차 문서를
 * 지우지 않는다 — 여기서 되돌릴 수 없는 일은 없다.
 *
 * 네 가지를 **한 문으로** 받는다. 따로 두면 각자 마지막 결과를 들고 있어서,
 * 되돌린 뒤에도 "배포했습니다"가 화면에 남는다.
 */
export interface DeployResult {
  /** 방금 한 일. 화면은 이것만 보고 한 줄을 쓴다. */
  published?: { version: number; slug: string };
  rolledBackTo?: number;
  unpublished?: boolean;
  exportQueued?: "pdf" | "deck";
  error?: string;
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "이 요금제에서는 할 수 없습니다.";
    if (error.status === 404) return "포트폴리오를 찾지 못했습니다.";
    if (error.status === 409 && error.message.includes("generated page")) {
      return "먼저 자유 HTML 페이지를 만든 뒤 배포해 주세요.";
    }
    if (error.status === 409) return "이미 쓰이고 있는 주소입니다. 다른 주소로 해 주세요.";
    if (error.status === 422) return error.message;
  }
  return "하지 못했습니다. 다시 시도해 주세요.";
}

function contactVisibility(value: FormDataEntryValue | null) {
  return value === "public" || value === "on_request" ? value : ("hidden" as const);
}

export async function deployAction(
  _previous: DeployResult,
  formData: FormData,
): Promise<DeployResult> {
  const intent = formData.get("intent");
  const portfolioId = formData.get("portfolioId");
  if (typeof portfolioId !== "string") return {};
  const session = await requireSession();
  const refresh = () => revalidatePath(`/edit/${portfolioId}/deploy`);

  try {
    if (intent === "publish") {
      const slug = SlugSchema.safeParse(String(formData.get("slug") ?? "").trim().toLowerCase());
      if (!slug.success) {
        return { error: "주소는 영문 소문자 · 숫자 · 하이픈으로 3자 이상입니다." };
      }
      const { data } = await publishing.publish(session.accessToken, portfolioId, {
        slug: slug.data,
        seo: { indexable: formData.get("indexable") === "on" },
        contactVisibility: contactVisibility(formData.get("contactVisibility")),
      });
      refresh();
      return { published: { version: data.version, slug: data.slug } };
    }

    if (intent === "rollback") {
      const deploymentId = formData.get("deploymentId");
      if (typeof deploymentId !== "string") return {};
      const { data } = await publishing.rollback(session.accessToken, portfolioId, deploymentId);
      refresh();
      return { rolledBackTo: data.version };
    }

    if (intent === "unpublish") {
      await publishing.unpublish(session.accessToken, portfolioId);
      refresh();
      return { unpublished: true };
    }

    if (intent === "export") {
      const kind = formData.get("kind");
      if (kind !== "pdf" && kind !== "deck") return {};
      await publishing.submitExport(
        session.accessToken,
        portfolioId,
        { kind, pageFormat: kind === "pdf" ? "a4" : null },
        randomUUID(),
      );
      return { exportQueued: kind };
    }
  } catch (error) {
    return { error: message(error) };
  }
  return {};
}
