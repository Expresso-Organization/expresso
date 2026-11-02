import {latestCareerProposal} from "./proposal-order.js";
import {
  AiProposalApplyRequestSchema,
  AiProposalUndoRequestSchema,
  AiProposalCancelRequestSchema,
  AiProposalRejectRequestSchema,
  AiProposalApplyResponseSchema,
  AiProposalUndoResponseSchema,
  CareerProducerScopeSchema,
  CareerWriteOperationResponseSchema,
  type AiProposalApplyResponse,
  type AiProposalUndoResponse,
  type CareerWriteOperationResponse,
  type CareerProducerScope,
  type CareerProducerIntent,
  type AiEditProposalDetail,
} from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { requireActiveUser } from "../identity/index.js";
import {
  CanonicalCareerReadService,
  publicCareerWriteOperation,
  validateCareerProducerIntent,
  careerProducerOperationId,
  careerProducerInputFingerprint,
  type CareerProducerCoordinator,
} from "../career/index.js";
import { PreparedAiProposalService } from "./prepared-ai-proposals.js";
import type { CareerDocumentApi } from "./service.js";
import { CareerDocumentError } from "./errors.js";

export type ProductAiProposalIntegrationOptions = { requireBusinessOwner?: () => void };
export type AiApplyOperationResult =
  | { status: 200; body: AiProposalApplyResponse }
  | { status: 202; body: CareerWriteOperationResponse };
export type AiUndoOperationResult =
  | { status: 200; body: AiProposalUndoResponse }
  | { status: 202; body: CareerWriteOperationResponse };

function operationId(action: "apply" | "undo", userId: string, proposalId: string, input: unknown, key?: string) {
  if (key !== undefined && (key.length < 1 || key.length > 200)) {
    throw new CareerDocumentError(400, "AI Idempotency-Key is invalid");
  }
  return careerProducerOperationId({
    producer: "ai-proposal", userId, sourceId: proposalId, kind: action,
    idempotencyKey: key ?? careerProducerInputFingerprint(input),
  });
}

/** 제품의 AI 변경은 기존 owner intent만 실행하며 legacy 업무 쓰기로 되돌아가지 않습니다. */
export class ProductAiProposalIntegration {
  readonly prepared: PreparedAiProposalService;
  private publisher?: (recordId: string, detail: AiEditProposalDetail) => void;

  constructor(
    readonly context: MongoContext,
    readonly documents: CareerDocumentApi,
    readonly coordinator: Pick<CareerProducerCoordinator, "execute" | "cancel">,
    readonly reads = new CanonicalCareerReadService(context),
    private readonly options: ProductAiProposalIntegrationOptions = {},
  ) {
    this.prepared = new PreparedAiProposalService(context, documents, coordinator);
  }

  setPublisher(publisher: (recordId: string, detail: AiEditProposalDetail) => void) {
    this.publisher = publisher;
  }

  private async source(userId: string, recordId: string, proposalId: string) {
    return inTransaction(this.context, async tx => {
      await requireActiveUser(tx, userId);
      const row = await mongoCollections(tx.db).careerAiProposals.findOne(
        { _id: proposalId, userId, recordId }, { session: tx.session },
      );
      if (!row) throw new CareerDocumentError(404, "AI proposal not found");
      return row;
    });
  }

  async execute(raw: CareerProducerScope): Promise<CareerProducerIntent> {
    const scope = CareerProducerScopeSchema.parse(raw);
    const intent = await this.prepared.execute(scope);
    if (intent.state === "completed") {
      const recordId = intent.document?.recordId ?? (intent.business?.kind === "patch" ? intent.business.recordId : "");
      const row = await this.source(scope.userId, recordId, scope.sourceId);
      if((await latestCareerProposal(this.context,scope.userId,row.recordId))?._id===row._id)this.publisher?.(row.recordId, await this.documents.getAiProposal(scope.userId, row.recordId, row._id));
    }
    return intent;
  }

  private async run(scope: CareerProducerScope, recordId: string): Promise<CareerProducerIntent> {
    try {
      return await this.execute(scope);
    } catch (error) {
      const row = await this.source(scope.userId, recordId, scope.sourceId);
      const current = row.writerIntegration && validateCareerProducerIntent(row.writerIntegration);
      if (!current || current.operationId !== scope.operationId || current.fingerprint !== scope.fingerprint || current.state === "cancelled") throw error;
      return current;
    }
  }

  private pending(intent: CareerProducerIntent): CareerWriteOperationResponse {
    const operation = publicCareerWriteOperation(intent);
    if (!["pending", "running", "retry"].includes(operation.state)) {
      throw Object.assign(new CareerDocumentError(409, "AI operation requires recovery"), {
        publicErrorCode: "RECOVERY_REQUIRED", publicDetails: { operation },
      });
    }
    return CareerWriteOperationResponseSchema.parse({ data: operation });
  }

  async applyOperation(userId: string, recordId: string, raw: unknown, key?: string): Promise<AiApplyOperationResult> {
    const input = AiProposalApplyRequestSchema.parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    if (input.propertyChangeIndexes.length && this.options.requireBusinessOwner) {
      const row = await this.source(userId, recordId, input.proposalId);
      if (!row.writerIntegration) this.options.requireBusinessOwner();
    }
    const scope = await this.prepared.prepare(userId, recordId, {
      ...input, operationId: operationId("apply", userId, input.proposalId, input, key),
    });
    const intent = await this.run(scope, recordId);
    if (intent.state !== "completed") return { status: 202, body: this.pending(intent) };
    return { status: 200, body: AiProposalApplyResponseSchema.parse({
      data: await this.documents.getAiProposal(userId, recordId, input.proposalId),
    }) };
  }

  async undoOperation(userId: string, recordId: string, raw: unknown, key?: string): Promise<AiUndoOperationResult> {
    const input = AiProposalUndoRequestSchema.parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    const row = await this.source(userId, recordId, input.proposalId);
    if (row.status !== "applied") throw new CareerDocumentError(409, "AI proposal undo is unavailable");
    const current = row.writerIntegration && validateCareerProducerIntent(row.writerIntegration);
    if (current?.state === "completed" && current.businessResult && !current.document && !row.beforeSnapshotId && !row.revisionId) {
      return { status: 200, body: AiProposalUndoResponseSchema.parse({ data: {
        outcome: "no-document-target", scope: "none", businessChangesRetained: true,
      } }) };
    }
    const scope = await this.prepared.prepareUndo(userId, recordId, {
      ...input, operationId: operationId("undo", userId, input.proposalId, input, key),
    });
    const intent = await this.run(scope, recordId);
    if (intent.state !== "completed") return { status: 202, body: this.pending(intent) };
    return { status: 200, body: AiProposalUndoResponseSchema.parse(await this.documents.bootstrap(userId, recordId)) };
  }

  async terminate(userId: string, recordId: string, raw: unknown, status: "cancelled" | "rejected"): Promise<boolean> {
    const input = (status === "cancelled" ? AiProposalCancelRequestSchema : AiProposalRejectRequestSchema).parse(raw);
    if (input.recordId !== recordId) throw new CareerDocumentError(404, "AI proposal not found");
    const row = await this.source(userId, recordId, input.proposalId);
    if (!row.writerIntegration) return false;
    const scope = CareerProducerScopeSchema.parse(validateCareerProducerIntent(row.writerIntegration));
    await this.prepared[status === "cancelled" ? "cancel" : "reject"](scope);
    if((await latestCareerProposal(this.context,userId,recordId))?._id===input.proposalId)this.publisher?.(recordId, await this.documents.getAiProposal(userId, recordId, input.proposalId));
    return true;
  }
}
