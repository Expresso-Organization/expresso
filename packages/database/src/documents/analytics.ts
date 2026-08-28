// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { Decimal128 } from "mongodb";
import type { JsonValue, JsonObject } from "./common.js";

export interface AnalyticsEventReceiptDoc {
  _id: string;
  userId: string;
  deploymentId: string;
  eventType: "visit" | "complete" | "section_view" | "contact_click" | "file_download" | "link_click";
  visitorHash: string;
  payloadHash: string;
  payloadBytes: number;
  occurredAt: Date;
  receivedAt: Date;
}

export interface AnnotationDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  date: string;
  label: string;
  note: string;
}

export interface VisitEventDoc {
  _id: string;
  userId: string;
  deploymentId: string;
  sessionId: string;
  referrer?: string | null;
  orgDomain?: string | null;
  isOwner: boolean;
  startedAt: Date;
  eventId?: string | null;
  completed: boolean;
  durationMs?: number | null;
}

export interface ConversionEventDoc {
  _id: string;
  userId: string;
  visitEventId: string;
  kind: "contact_click" | "file_download" | "link_click";
  target: string;
  eventId?: string | null;
  occurredAt: Date;
}

export interface DashboardViewDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  name: string;
  period: "7d" | "30d" | "all";
  isDefault: boolean;
}

export interface DerivedMetricDoc {
  _id: string;
  userId: string;
  name: string;
  numeratorKey: string;
  denominatorKey: string;
}

export interface InsightDoc {
  _id: string;
  userId: string;
  deploymentId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  narrative: string;
  evidenceMetrics: JsonValue;
  suggestions: JsonValue[];
  generatedAt: Date;
}

export interface MetricDailyDoc {
  _id: string;
  userId: string;
  deploymentId: string;
  date: string;
  metricKey: string;
  value: Decimal128;
  sampleSize: number;
}

export interface NotificationDoc {
  _id: string;
  userId: string;
  kind: "deadline" | "saved_search" | "generation" | "traffic";
  targetUrl: string;
  dedupeKey: string;
  readAt?: Date | null;
  dedupeDate: string;
  deliveryStatus: "queued" | "sending" | "sent" | "failed" | "suppressed";
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string | null;
  createdAt: Date;
  deliveredAt?: Date | null;
}

export interface NotificationPreferenceDoc {
  kind: "deadline" | "saved_search" | "generation" | "traffic";
  enabled: boolean;
  updatedAt: Date;
}

export interface SavedSearchDoc {
  _id: string;
  userId: string;
  queryText: string;
  filters: JsonObject;
  notify: boolean;
  lastRunAt?: Date | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SectionViewDoc {
  _id: string;
  userId: string;
  visitEventId: string;
  portfolioSectionId: string;
  dwellMs: number;
  scrollDepth: Decimal128;
  exited: boolean;
  eventId?: string | null;
  occurredAt: Date;
}

export interface WidgetDoc {
  _id: string;
  userId: string;
  dashboardViewId: string;
  metricKey?: string | null;
  derivedMetricId?: string | null;
  visualization: "number" | "spark" | "line" | "bar" | "donut" | "list" | "note";
  compareTo?: "prev_period" | "other_portfolio" | "industry" | null;
  position: JsonObject;
}
