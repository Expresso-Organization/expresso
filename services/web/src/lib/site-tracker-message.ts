import { z } from "zod";

/**
 * 공개 사이트 iframe 안의 추적 스크립트가 부모에게 보내는 알림.
 *
 * iframe은 출처가 없는(sandbox) 문서라 직접 요청을 보낼 수 없다. 스크립트는 본 것만
 * 알리고, 이벤트 식별자 · 세션 · 시각은 부모(`SiteFrame`)가 붙인다.
 */
export const SITE_TRACKER_SOURCE_TAG = "expresso-site";

export const SiteTrackerMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ source: z.literal(SITE_TRACKER_SOURCE_TAG), kind: z.literal("complete") }),
  z.strictObject({
    source: z.literal(SITE_TRACKER_SOURCE_TAG),
    kind: z.literal("section"),
    /** 섹션 목록(`outline`)에서 몇 번째인가. 0부터. */
    index: z.number().int().nonnegative(),
    /** 화면 절반 이상을 차지하기 시작했으면 true, 벗어났으면 false. */
    visible: z.boolean(),
    scrollDepth: z.number().min(0).max(1),
  }),
  z.strictObject({
    source: z.literal(SITE_TRACKER_SOURCE_TAG),
    kind: z.enum(["contact", "download", "link"]),
    target: z.string().min(1).max(500),
  }),
]);

export type SiteTrackerMessage = z.infer<typeof SiteTrackerMessageSchema>;
