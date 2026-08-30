import type { AnalyticsService as LegacyAnalyticsService } from "./legacy-mysql-service.js";
export { AnalyticsService } from "./service.js";
export { MongoAnalyticsService } from "./service.js";
export type AnalyticsApi = Pick<LegacyAnalyticsService, keyof LegacyAnalyticsService>;
export { type InsightDraft, AnalyticsError, validateInsightDraft } from "./public.js";
