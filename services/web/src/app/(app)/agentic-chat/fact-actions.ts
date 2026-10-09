"use server";

import {
  ApproveChatFactSchema,
  CareerCategoriesResponseSchema,
  ChatFactListResponseSchema,
  ChatFactResponseSchema,
  CreateChatFactSchema,
} from "@expresso/contracts";
import { z } from "zod";

import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "접근 권한과 커리어 기록 AI 사용 동의를 확인해 주세요.";
    }

    if (error.status === 409) {
      return "이미 처리되었거나 내용이 변경되었습니다. 목록을 다시 불러와 주세요.";
    }

    if (error.status === 503) {
      return "AI 서비스를 사용할 수 없습니다.";
    }
  }

  return "처리하지 못했습니다. 카테고리와 입력 내용을 확인하고 다시 시도해 주세요.";
}

export async function loadChatFacts(sessionId: string) {
  const id = z.uuid().parse(sessionId);
  const auth = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${id}/facts`,
      ChatFactListResponseSchema,
      {
        accessToken: auth.accessToken,
        cache: "no-store",
      },
    );

    return { ok: true as const, data: result.data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}

export async function loadFactCategories() {
  const auth = await requireSession();

  try {
    const result = await request(
      "/v1/career/categories",
      CareerCategoriesResponseSchema,
      {
        accessToken: auth.accessToken,
        cache: "no-store",
      },
    );

    return { ok: true as const, data: result.data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}

export async function createChatFact(input: {
  sessionId: string;
  requestId: string;
  messageIds: string[];
}) {
  const id = z.uuid().parse(input.sessionId);

  const body = CreateChatFactSchema.parse({
    requestId: input.requestId,
    messageIds: input.messageIds,
  });

  const auth = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${id}/facts`,
      ChatFactResponseSchema,
      {
        method: "POST",
        accessToken: auth.accessToken,
        body,
        cache: "no-store",
      },
    );

    return { ok: true as const, data: result.data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}

export async function approveChatFact(input: {
  sessionId: string;
  factId: string;
  categoryId: string;
  title: string;
  bodyMd: string;
}) {
  const sessionId = z.uuid().parse(input.sessionId);
  const factId = z.uuid().parse(input.factId);

  const body = ApproveChatFactSchema.parse({
    categoryId: input.categoryId,
    title: input.title,
    bodyMd: input.bodyMd,
  });

  const auth = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${sessionId}/facts/${factId}/approve`,
      ChatFactResponseSchema,
      {
        method: "POST",
        accessToken: auth.accessToken,
        body,
        cache: "no-store",
      },
    );

    return { ok: true as const, data: result.data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}

export async function rejectChatFact(
  sessionIdValue: string,
  factIdValue: string,
) {
  const sessionId = z.uuid().parse(sessionIdValue);
  const factId = z.uuid().parse(factIdValue);
  const auth = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${sessionId}/facts/${factId}/reject`,
      ChatFactResponseSchema,
      {
        method: "POST",
        accessToken: auth.accessToken,
        cache: "no-store",
      },
    );

    return { ok: true as const, data: result.data };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}