import { CareerDocumentSchema, CareerEditCommandSchema } from "@expresso/editor";
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
  SocketEnvelopeSchema.extend({ type: z.literal("proposal"), proposalId: UuidSchema, baseDocumentVersion: z.number().int().nonnegative() }),
  SocketEnvelopeSchema.extend({ type: z.literal("error"), code: z.enum(["AUTH", "ORIGIN", "PROTOCOL", "SIZE", "RATE_LIMIT", "VERSION_CONFLICT"]), message: z.string().min(1).max(500) }),
]);
export { CareerEditCommandSchema };
export type CareerDocumentBootstrap = z.infer<typeof CareerDocumentBootstrapSchema>;
export type CareerSocketClientMessage = z.infer<typeof CareerSocketClientMessageSchema>;
export type CareerSocketServerMessage = z.infer<typeof CareerSocketServerMessageSchema>;
