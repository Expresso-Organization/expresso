"use server";

import {
  AnalyzeJobCareerMatchResponseSchema,
  AnalyzeJobCareerMatchSchema,
  GetJobCareerMatchResponseSchema,
} from "@expresso/contracts";
import { z } from "zod";

import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";

function matchErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "커리어 기록 사용과 공고 분석 동의를 확인해 주세요.";
    }

    if (error.status === 404) {
      return "대화방 또는 연결된 공고를 찾을 수 없습니다.";
    }

    if (error.status === 409) {
      return "다른 분석이 실행 중이거나 입력이 변경되었습니다. 결과를 다시 불러오거나 잠시 후 새로 분석해 주세요.";
    }

    if (error.status === 422) {
      return "경력 기록이 없거나 분석 입력·근거 검증에 실패했습니다. 경력 내용을 확인한 뒤 다시 시도해 주세요.";
    }

    if (error.status === 503) {
      return "AI 또는 경력 조회 서비스를 사용할 수 없습니다. 백엔드 로그를 확인해 주세요.";
    }
  }

  return "맞춤 분석 요청에 실패했습니다. 저장된 결과를 확인한 뒤 재시도해 주세요.";
}

export async function loadJobCareerMatch(sessionId: string) {
  const parsedId = z.uuid().safeParse(sessionId);

  if (!parsedId.success) {
    return {
      ok: false as const,
      error: "잘못된 대화방 ID입니다.",
    };
  }

  const authSession = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${parsedId.data}/career-match`,
      GetJobCareerMatchResponseSchema,
      {
        accessToken: authSession.accessToken,
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
      error: matchErrorMessage(error),
    };
  }
}

export async function analyzeJobCareerMatch(input: {
  sessionId: string;
  requestId: string;
}) {
  const parsedId = z.uuid().safeParse(input.sessionId);
  const parsedBody = AnalyzeJobCareerMatchSchema.safeParse({
    requestId: input.requestId,
  });

  if (!parsedId.success || !parsedBody.success) {
    return {
      ok: false as const,
      error: "잘못된 분석 요청입니다.",
    };
  }

  const authSession = await requireSession();

  try {
    const result = await request(
      `/v1/job-chat/sessions/${parsedId.data}/career-match`,
      AnalyzeJobCareerMatchResponseSchema,
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
      error: matchErrorMessage(error),
    };
  }
}