// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { Binary } from "mongodb";
import type { JsonValue, JsonObject } from "./common.js";

export interface CompanyDoc {
  _id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  toneSummary?: string | null;
  dedupeKey?: string | null;
  tonePalette?: JsonObject | null;
  avatarBackground?: string | null;
  avatarColor?: string | null;
  brandColors: JsonValue;
  toneImpression?: string | null;
  initial?: string | null;
  logoData?: Binary | null;
  logoMediaType?: string | null;
  logoSourceUrl?: string | null;
  logoChecksum?: string | null;
  logoReadAt?: Date | null;
}

export interface JobPostingDoc {
  analysisVersion?: number;
  _id: string;
  companyId: string;
  source: "api" | "partner" | "user_input";
  externalId?: string | null;
  title: string;
  descriptionRaw: string;
  requirements: JsonValue;
  expiresAt?: Date | null;
  dedupeHash: string;
  sourceUrl?: string | null;
  createdAt: Date;
  normalizedAt?: Date | null;
  location?: string | null;
  workType?: string | null;
  experienceLabel?: string | null;
  employmentType?: string | null;
  salaryNote?: string | null;
  jobFamily?: string | null;
  duties: JsonValue[];
  preferred: JsonValue[];
  hiringProcess: JsonValue[];
  processNote?: string | null;
  notice?: string | null;
  team?: string | null;
  deadlineNote?: string | null;
  sourceBoard?: string | null;
  locationRegion?: string | null;
  experienceNote?: string | null;
  factsReadAt?: Date | null;
  experienceMinYears?: number | null;
}

export interface JobPostingRequirementDoc {
  _id: string;
  jobPostingId: string;
  orderNo: number;
  label: string;
  kind: "must" | "nice" | "tone";
  sourceSpan: JsonObject;
  extractorVersion: number;
  extractedAt: Date;
  axis?: "technology" | "impact" | "role" | "conditions" | null;
}

export interface JobSourceDoc {
  _id: string;
  provider: "greenhouse" | "lever" | "ashby" | "work24";
  token: string;
  displayName: string;
  isActive: boolean;
  lastRunAt?: Date | null;
  lastStatus?: "succeeded" | "failed" | null;
  lastError?: string | null;
  lastSeenCount: number;
  lastAddedCount: number;
  createdAt: Date;
  siteUrl?: string | null;
}

export interface RecentSearchDoc {
  _id: string;
  userId: string;
  queryText: string;
  conditions: JsonValue[];
  resultCount: number;
  createdAt: Date;
}
