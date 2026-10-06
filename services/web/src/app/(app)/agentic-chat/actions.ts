"use server";

import {
  CreateJobChatSessionSchema,
  CreateJobChatSessionResponseSchema,
  GetJobChatSessionResponseSchema,
  SendJobChatMessageSchema,
  SendJobChatMessageResponseSchema,
} from "@expresso/contracts";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return "답변이 생성 중이거나 재시도가 필요한 질문이 있습니다. 대화를 다시 불러와 주세요.";
    }

    if (error.status === 403) {
      return "AI 사용 동의 또는 접근 권한을 확인해 주세요.";
    }

    if (error.status === 404) {
      return "대화방 또는 연결된 공고를 찾을 수 없습니다.";
    }

    if (error.status === 503) {
      return "AI 서비스를 사용할 수 없습니다. 서버 설정을 확인해 주세요.";
    }
  }

  return "요청에 실패했습니다. 대화를 다시 불러온 뒤 재시도해 주세요.";
}

// 대화 시작 버튼에서 호출합니다.
export async function createJobChatSession(
  formData: FormData,
): Promise<void> {
  const parsed = CreateJobChatSessionSchema.safeParse({
    jobPostingId: formData.get("jobPostingId"),
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) {
    throw new Error("잘못된 대화방 생성 요청입니다.");
  }

  const authSession = await requireSession();

  const result = await request(
    "/v1/job-chat/sessions",
    CreateJobChatSessionResponseSchema,
    {
      method: "POST",
      accessToken: authSession.accessToken,
      body: parsed.data,
      cache: "no-store",
    },
  );

  // redirect는 내부적으로 예외를 던지므로 catch 안에 넣지 않습니다.
  redirect(
    `/agentic-chat?sessionId=${result.data.id}` as Route,
  );
}

// 저장된 대화 또는 이전 메시지를 불러옵니다.
export async function loadJobChat(
  sessionId: string,
  beforeSequence?: number,
) {
  const parsedId = z.uuid().safeParse(sessionId);

  if (
    !parsedId.success ||
    (beforeSequence !== undefined &&
      (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1))
  ) {
    return {
      ok: false as const,
      error: "잘못된 대화 조회 요청입니다.",
    };
  }

  const authSession = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${parsedId.data}`,
      GetJobChatSessionResponseSchema,
      {
        accessToken: authSession.accessToken,
        query: {
          limit: 100,
          beforeSequence,
        },
        cache: "no-store",
      },
    );

    return {
      ok: true as const,
      data: result.data,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}

// 이번 질문만 전송합니다. 이전 대화는 백엔드가 DB에서 읽습니다.
export async function sendJobChat(input: {
  sessionId: string;
  requestId: string;
  content: string;
}) {
  const parsedId = z.uuid().safeParse(input.sessionId);
  const parsedBody = SendJobChatMessageSchema.safeParse({
    requestId: input.requestId,
    content: input.content,
  });

  if (!parsedId.success || !parsedBody.success) {
    return {
      ok: false as const,
      error: "입력 내용을 확인해 주세요.",
    };
  }

  const authSession = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${parsedId.data}/messages`,
      SendJobChatMessageResponseSchema,
      {
        method: "POST",
        accessToken: authSession.accessToken,
        body: parsedBody.data,
        cache: "no-store",
      },
    );

    return {
      ok: true as const,
      data: result.data,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}