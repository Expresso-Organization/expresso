import { CareerEditCommandSchema } from "@expresso/editor/commands";
import { CareerDocumentSchema } from "@expresso/editor/document";
import { z } from "zod";
import { CareerRecordSchema } from "./career.js";
import { UuidSchema } from "./common.js";

export const CareerDocumentBootstrapSchema = z.strictObject({
  record: CareerRecordSchema, document: CareerDocumentSchema, snapshotVersion: z.number().int().nonnegative(),
  documentVersion: z.number().int().nonnegative(), stateVectorBase64: z.string().base64().max(1_398_104),
  pendingUpdateCount: z.number().int().nonnegative(), sessionToken: z.string().min(32).max(4_096),
});
const SocketEnvelopeSchema = z.strictObject({ protocolVersion: z.literal(1), recordId: UuidSchema, sessionId: UuidSchema });
export const CareerSocketClientMessageSchema = z.discriminatedUnion("type", [
  SocketEnvelopeSchema.extend({ type: z.literal("sync"), stateVectorBase64: z.string().base64().max(1_398_104), lastAckSequence: z.number().int().nonnegative() }),
  SocketEnvelopeSchema.extend({ type: z.literal("update"), clientId: UuidSchema, clientSequence: z.number().int().nonnegative(), updateBase64: z.string().base64().max(1_398_104) }),
  SocketEnvelopeSchema.extend({ type: z.literal("awareness"), actor: z.enum(["user", "ai"]), payload: z.record(z.string(), z.unknown()) }),
  SocketEnvelopeSchema.extend({ type: z.literal("ack"), sequence: z.number().int().nonnegative() }),
]);
export const CareerSocketServerMessageSchema = z.discriminatedUnion("type", [
  SocketEnvelopeSchema.extend({ type: z.literal("ready"), sequence: z.number().int().nonnegative(), documentVersion: z.number().int().nonnegative() }),
  SocketEnvelopeSchema.extend({ type: z.literal("update"), sequence: z.number().int().nonnegative(), updateBase64: z.string().base64().max(1_398_104), actor: z.enum(["user", "ai", "migration"]) }),
  SocketEnvelopeSchema.extend({ type: z.literal("ack"), sequence: z.number().int().nonnegative(), documentVersion: z.number().int().nonnegative() }),
  SocketEnvelopeSchema.extend({ type: z.literal("proposal"), proposalId: UuidSchema, baseDocumentVersion: z.number().int().nonnegative(), status: z.enum(["draft", "streaming", "ready", "applied", "rejected", "cancelled", "expired", "conflicted"]), progress: z.strictObject({ phase: z.enum(["preparing", "generating", "validating"]), completed: z.number().int().nonnegative(), total: z.number().int().positive().optional() }).nullable() }),
  SocketEnvelopeSchema.extend({ type: z.literal("awareness"), actor: z.enum(["user", "ai"]), payload: z.record(z.string(), z.unknown()) }),
  SocketEnvelopeSchema.extend({ type: z.literal("error"), code: z.enum(["AUTH", "ORIGIN", "PROTOCOL", "SIZE", "RATE_LIMIT", "VERSION_CONFLICT"]), message: z.string().min(1).max(500) }),
]);
export { CareerEditCommandSchema };
export type CareerDocumentBootstrap = z.infer<typeof CareerDocumentBootstrapSchema>;
export type CareerSocketClientMessage = z.infer<typeof CareerSocketClientMessageSchema>;
export type CareerSocketServerMessage = z.infer<typeof CareerSocketServerMessageSchema>;

export const AppendCareerUpdateSchema = z.strictObject({
  recordId: UuidSchema, clientId: UuidSchema, clientSequence: z.number().int().positive(),
  expectedSequence: z.number().int().nonnegative().optional(), updateBase64: z.string().base64().max(1_398_104),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
export const CareerUpdateAckSchema = z.strictObject({ recordId: UuidSchema, clientId: UuidSchema, clientSequence: z.number().int().positive(), serverSequence: z.number().int().positive(), documentVersion: z.number().int().nonnegative() });
export const CareerRevisionSchema = z.strictObject({
  id: UuidSchema,
  recordId: UuidSchema,
  actor: z.enum(["user", "ai", "migration"]),
  summary: z.string().min(1).max(500),
  beforeVersion: z.number().int().nonnegative(),
  afterVersion: z.number().int().nonnegative(),
  snapshotId: UuidSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const CareerRevisionsResponseSchema = z.strictObject({ data: z.array(CareerRevisionSchema) });
export const RestoreCareerRevisionSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative() });
export type AppendCareerUpdate = z.infer<typeof AppendCareerUpdateSchema>;
export type CareerUpdateAck = z.infer<typeof CareerUpdateAckSchema>;
export type CareerRevision = z.infer<typeof CareerRevisionSchema>;
