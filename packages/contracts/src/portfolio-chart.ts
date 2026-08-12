import { z } from "zod";

/**
 * 지면 위의 그림.
 *
 * 포트폴리오에서 눈이 먼저 가는 자리는 문장이 아니라 **그림**이다. 그런데 지금까지
 * 지면이 그릴 수 있는 것은 글자뿐이었고, 수치는 `metric` 하나로 크게 세우는 것이
 * 전부였다. 큰 숫자 셋을 나란히 놓는 것과 그 셋을 **막대로 견주는 것**은 다른
 * 정보다.
 *
 * 어휘는 새로 만들지 않는다 — 07 분석 위젯이 이미 쓰는 것을 그대로 가져온다
 * (`0038_widget_visualizations.sql`). 어느 그림에 어떤 데이터가 필요한지는 여기서
 * 정하고, 그리는 일은 렌더러가 SVG로 한다. **이미지가 아니라 그림이라 업로드가
 * 필요 없다** — 근거에 있는 수치만으로 선다.
 */

export const CHART_VISUALIZATIONS = ["bar", "donut", "gauge", "spark"] as const;
export const ChartVisualizationSchema = z.enum(CHART_VISUALIZATIONS);

/**
 * 점 하나.
 *
 * `value`는 **근거에 적힌 숫자 그대로**다 — 근거가 "3,000만 건"이면 3000이고
 * 단위는 `unit`에 "만 건"으로 적는다. 30000000으로 펴서 적으면 근거 검증이
 * 지어낸 수로 본다(`ungroundedNumbers`는 글에 적힌 숫자를 그대로 대조한다).
 * 그래서 **한 그림 안의 점들은 같은 표기를 써야** 막대의 비율이 맞는다.
 */
export const ChartPointSchema = z.strictObject({
  label: z.string().min(1).max(40),
  value: z.number().finite(),
});

/**
 * 그림 하나. `metric`과 같은 규율을 따른다 — 여기 적힌 수는 전부 근거에 있어야
 * 하고, 기록에서 나온 것만 쓴다.
 */
export const PortfolioChartSchema = z
  .strictObject({
    visualization: ChartVisualizationSchema,
    /** 이 그림이 무엇을 재는가. 그림 옆에 그대로 적힌다. */
    caption: z.string().min(1).max(80),
    /** 값의 단위 — "분" · "%" · "건". 없으면 숫자만 적는다. */
    unit: z.string().max(8).optional(),
    /** gauge의 100% 자리. 다른 그림에서는 쓰지 않는다. */
    max: z.number().finite().positive().optional(),
    points: z.array(ChartPointSchema).min(1).max(8),
  })
  .superRefine((chart, context) => {
    const issue = (message: string, path: string) =>
      context.addIssue({ code: "custom", message, path: [path] });

    // 하나짜리 막대는 막대가 아니라 그냥 수치다. 그건 metric이 한다.
    if (chart.visualization === "bar" && chart.points.length < 2) {
      issue("bar는 견줄 것이 둘 이상일 때 씁니다. 하나면 metric으로 쓰세요", "points");
    }
    if (chart.visualization === "donut") {
      if (chart.points.length < 2) issue("donut은 나눠 담을 몫이 둘 이상이어야 합니다", "points");
      if (chart.points.some(({ value }) => value < 0)) {
        issue("donut의 몫은 음수가 될 수 없습니다", "points");
      }
    }
    if (chart.visualization === "spark" && chart.points.length < 3) {
      issue("spark는 흐름을 보이는 그림입니다. 점이 셋은 있어야 합니다", "points");
    }
    if (chart.visualization === "gauge") {
      if (chart.points.length !== 1) issue("gauge는 값 하나를 채웁니다", "points");
      if (chart.max === undefined) issue("gauge에는 100% 자리(max)가 필요합니다", "max");
      else if (chart.points.some(({ value }) => value > chart.max!)) {
        issue("gauge의 값이 max를 넘습니다", "points");
      }
    } else if (chart.max !== undefined) {
      issue("max는 gauge에만 씁니다", "max");
    }
  });

export type ChartVisualization = z.infer<typeof ChartVisualizationSchema>;
export type PortfolioChart = z.infer<typeof PortfolioChartSchema>;

/** 블록 content에 저장된 그림을 읽는다. 옛 블록이나 깨진 값은 null이다. */
export function parseChartContent(content: unknown): PortfolioChart | null {
  const parsed = PortfolioChartSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** 그림에 적힌 모든 수. 근거 검증이 이 문자열을 본다. */
export function chartNumbers(chart: PortfolioChart): string {
  return [
    ...chart.points.map(({ value }) => String(value)),
    ...(chart.max === undefined ? [] : [String(chart.max)]),
  ].join(" ");
}
