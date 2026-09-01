// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { JsonObject } from "./common.js";

export interface DeploymentDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  version: number;
  subdomain: string;
  customDomain?: string | null;
  seoIndexable: boolean;
  contactVisibility: "public" | "on_request" | "hidden";
  publishedAt?: Date | null;
  hasUnpublishedChanges: boolean;
  snapshot: JsonObject;
  seo: JsonObject;
}

export interface DeploymentSlugRedirectDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  oldSlug: string;
  newSlug: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ExportAssetDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  kind: "pdf" | "deck" | "resume_file";
  fileUrl: string;
  pageFormat?: "letter" | "a4" | null;
  downloadCount: number;
  version: number;
  accessNonce: string;
  revokedAt?: Date | null;
  createdAt: Date;
}

export interface ExportJobDoc {
  _id: string;
  userId: string;
  portfolioId: string;
  deploymentId?: string | null;
  kind: "pdf" | "deck";
  pageFormat?: "letter" | "a4" | null;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  idempotencyKey: string;
  requestHash: string;
  assetId?: string | null;
  errorCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAssetDoc {
  _id: string;
  userId: string;
  storageKey: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width: number;
  height: number;
  byteSize: number;
  checksum: string;
  createdAt: Date;
}

export interface MediaVariantDoc {
  _id: string;
  userId: string;
  mediaAssetId: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: Date;
}
