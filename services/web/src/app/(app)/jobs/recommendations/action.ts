"use server";
import { UuidSchema, type ModelView } from "@expresso/contracts";
import { ApiError } from "@/lib/api/client";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export async function runRecommendation(
  posting: string | undefined,
  _previous: ModelView | string | null,
  form: FormData,
): Promise<ModelView | string> {
  const { accessToken } = await requireSession();
  if (posting !== undefined && !UuidSchema.safeParse(posting).success)
    return "공고 주소를 확인하세요.";
  try {
    return await jobs.recommendations(
      accessToken,
      posting,
      form.get("mode") === "external",
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403)
      return "계정 설정에서 커리어 기록 사용과 공고 분석에 동의한 뒤 다시 시도하세요.";
    if (error instanceof ApiError && error.status === 404)
      return "이 공고를 열 수 없습니다.";
    return "추천 결과를 불러오지 못했습니다. 다시 시도하세요.";
  }
}
