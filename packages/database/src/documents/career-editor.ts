import type { Binary } from "mongodb";
import type { JsonValue } from "./common.js";

export type CareerEditorActor = "user" | "ai" | "migration";

export interface CareerDocumentSnapshotDoc {
  _id: string;
  userId: string;
  recordId: string;
  documentVersion: number;
  /** 하위 저장 클라이언트가 사용하는 별칭입니다. 새 쓰기는 documentVersion을 사용합니다. */
  version?: number;
  schemaVersion: number;
  content: JsonValue;
  stateVector: Binary;
  serverSequence: number;
  checksum: string;
  actor: CareerEditorActor;
  createdAt: Date;
}

export interface CareerDocumentUpdateDoc {
  _id: string;
  recordId: string;
  userId: string;
  clientId: string;
  clientSequence: number;
  serverSequence: number;
  update: Binary;
  byteLength: number;
  updateHash: string;
  actor: CareerEditorActor;
  receivedAt: Date;
  compactedAt: Date | null;
}

export interface CareerRecordRevisionDoc {
  _id: string;
  userId: string;
  recordId: string;
  actor: "user" | "ai" | "migration";
  summary: string;
  beforeVersion: number;
  afterVersion: number;
  snapshotId?: string | null;
  proposalId?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface CareerRecordRelationDoc {
  _id: string;
  userId: string;
  sourceRecordId: string;
  sourcePropertyId: string;
  targetRecordId: string;
  inversePropertyId?: string | null;
  cardinality: "single" | "multiple";
  deletePolicy: "restrict" | "nullify";
  createdBy: "user" | "ai";
  createdAt: Date;
  updatedAt: Date;
}

export interface CareerAiProposalDoc {
  _id: string;
  userId: string;
  recordId: string;
  status: "draft" | "streaming" | "ready" | "applied" | "rejected" | "cancelled" | "expired" | "conflicted";
  baseDocumentVersion: number;
  selection: { blockIds: string[]; from?: number; to?: number };
  prompt: string;
  summary: string | null;
  commands: JsonValue[];
  propertyChanges: JsonValue[];
  progress: { phase: "preparing" | "generating" | "validating"; completed: number; total?: number } | null;
  beforeSnapshotId: string | null;
  afterSnapshotId: string | null;
  beforeChecksum: string | null;
  afterChecksum: string | null;
  revisionId: string | null;
  appliedDocumentVersion: number | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
