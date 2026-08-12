"use server";

import {
  MetricKeySchema,
  WidgetSpanSchema,
  WidgetVisualizationSchema,
  type AnalyticsPeriodPreset,
} from "@expresso/contracts";
import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/client";
import { analytics } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 07이 손을 대는 두 가지.
 *
 * 화면을 여는 것으로는 아무것도 계산하지 않는다 — 집계도, 해설도 사용자가
 * 누를 때 시작한다. 해설은 모델을 부르는 일이라 특히 그렇다(§8.3).
 */
export interface AnalyticsActionResult {
  /** 큐에 넣은 날 수. */
  queued?: number;
  narrative?: string;
  /** 표본이 모자라 계약을 부르지 않았을 때. */
  short?: { sampleSize: number; minimumSample: number };
  error?: string;
}

function period(formData: FormData): AnalyticsPeriodPreset {
  const value = formData.get("period");
  return value === "7d" || value === "all" ? value : "30d";
}

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "AI 사용 동의가 필요합니다. 설정에서 켜 주세요.";
    if (error.status === 409) return error.message.includes("order")
      ? "지면이 그 사이에 바뀌었습니다. 새로고침해 주세요."
      : "아직 배포하지 않은 포트폴리오입니다.";
    if (error.status === 422) return error.message;
    if (error.status === 503) return "지금은 해설을 쓸 수 없습니다.";
  }
  return "읽지 못했습니다. 다시 시도해 주세요.";
}

/** "지금 집계" — 아직 계산되지 않은 날을 큐에 넣는다. 결과는 워커가 채운다. */
export async function aggregateAction(
  _previous: AnalyticsActionResult,
  formData: FormData,
): Promise<AnalyticsActionResult> {
  const portfolioId = formData.get("portfolioId");
  if (typeof portfolioId !== "string") return {};
  const session = await requireSession();
  try {
    const { data } = await analytics.aggregate(session.accessToken, portfolioId, period(formData));
    revalidatePath("/analytics");
    return { queued: data.queued.length };
  } catch (error) {
    return { error: message(error) };
  }
}

/** "해설 읽기" — §8.3 분석 해설. 표본이 모자라면 계약을 부르지 않고 그대로 말한다. */
export async function insightAction(
  _previous: AnalyticsActionResult,
  formData: FormData,
): Promise<AnalyticsActionResult> {
  const portfolioId = formData.get("portfolioId");
  if (typeof portfolioId !== "string") return {};
  const session = await requireSession();
  try {
    const { data } = await analytics.insight(session.accessToken, portfolioId, period(formData));
    if (data.visibility === "hidden") {
      return { short: { sampleSize: data.sampleSize, minimumSample: data.minimumSample } };
    }
    revalidatePath("/analytics");
    return { narrative: data.narrative };
  } catch (error) {
    return { error: message(error) };
  }
}

// ── 07b · 07c 위젯 ────────────────────────────────────────────────────

/**
 * 위젯을 놓고 · 고치고 · 지운다.
 *
 * 전부 폼 하나로 온다. `intent`가 무엇을 할지 정하고, 나머지 칸은 그 일에
 * 필요한 것만 읽는다 — 07b의 지표 하나든 07c의 그림 하나든 서버에서는 같은 문이다.
 */
export async function widgetAction(
  _previous: AnalyticsActionResult,
  formData: FormData,
): Promise<AnalyticsActionResult> {
  const intent = formData.get("intent");
  const portfolioId = formData.get("portfolioId");
  const widgetId = formData.get("widgetId");
  const session = await requireSession();

  try {
    if (intent === "edit" && typeof portfolioId === "string") {
      await analytics.editLayout(session.accessToken, portfolioId, period(formData));
    } else if (intent === "reset" && typeof portfolioId === "string") {
      await analytics.resetLayout(session.accessToken, portfolioId);
    } else if (intent === "add" && typeof portfolioId === "string") {
      const metricKey = MetricKeySchema.safeParse(formData.get("metricKey"));
      if (!metricKey.success) return { error: "그런 지표가 없습니다." };
      const at = Number(formData.get("index"));
      await analytics.addWidget(session.accessToken, portfolioId, {
        metricKey: metricKey.data,
        ...(Number.isInteger(at) && at >= 0 ? { index: at } : {}),
        period: period(formData),
      });
    } else if (intent === "reorder" && typeof portfolioId === "string") {
      const widgetIds = formData.getAll("widgetIds").filter((id): id is string => typeof id === "string");
      if (widgetIds.length === 0) return {};
      await analytics.reorderWidgets(session.accessToken, portfolioId, widgetIds);
    } else if (intent === "update" && typeof widgetId === "string") {
      const visualization = WidgetVisualizationSchema.safeParse(formData.get("visualization"));
      const span = WidgetSpanSchema.safeParse(Number(formData.get("span")));
      const compare = formData.get("compareTo");
      await analytics.updateWidget(session.accessToken, widgetId, {
        ...(visualization.success ? { visualization: visualization.data } : {}),
        ...(span.success ? { span: span.data } : {}),
        ...(compare === null ? {} : { compareTo: compare === "prev_period" ? "prev_period" : null }),
      });
    } else if (intent === "delete" && typeof widgetId === "string") {
      await analytics.deleteWidget(session.accessToken, widgetId);
    } else {
      return {};
    }
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath("/analytics");
  return {};
}
