import type { CareerService as LegacyCareerService } from "./legacy-mysql-service.js";
import type { CareerPropertySchemaService } from "./property-schema.js";
import type { CareerViewService } from "./views.js";
import type { CategoryMoveService } from "./category-move.js";
import type { RelationService } from "./relations.js";
import type { CareerComputationService } from "../career-computation/index.js";
export { CareerService } from "./service.js";
export { MongoCareerService } from "./service.js";
export { assertActiveRecordsForWrite, purgeTrashedCareerRecord } from "./mongo-record-guard.js";
export { CareerError } from "./errors.js";
export { MongoCanonicalCareerPropertySchemaService } from "./canonical-property-schema.js";
export { CanonicalPropertyMutationWorker } from "./property-mutation.js";
export { createSpringPropertyMutationPort } from "./spring-property-mutation-port.js";
export type { SpringPropertyMutationPort, SpringPropertyMutationTransport } from "./spring-property-mutation-port.js";
export interface CareerApi extends Pick<LegacyCareerService, keyof LegacyCareerService> {
  /** 인증된 요청 수명 안에서만 session을 전달하며 durable job에는 저장하지 않습니다. */
  forSession?: (token:string,userId:string)=>CareerApi;
  createRecordOperation?: (userId:string,key:string,input:import("@expresso/contracts").CreateCareerRecord)=>Promise<import("./product-facade.js").CareerProductCreateOperationResult>;
  updateRecordOperation?: (userId:string,recordId:string,expectedVersion:number,input:import("@expresso/contracts").UpdateCareerRecord)=>Promise<import("./product-facade.js").CareerProductUpdateOperationResult>;
  getWriteOperation?: (userId:string,operationId:string)=>Promise<import("@expresso/contracts").CareerWriteOperationResponse>;
  getPropertyMutationStatus?: (userId: string, mutationId: string) => Promise<import("@expresso/contracts").CareerPropertyMutationStatusResponse>;
  resumePropertyMutation?: (userId: string, mutationId: string) => Promise<import("@expresso/contracts").CareerPropertyMutationStatusResponse>;
  registerPropertyOption?: import("./canonical-property-schema.js").MongoCanonicalCareerPropertySchemaService["registerOption"];
  /** Mongo v2 구현이 연결된 서비스에서 제공됩니다. 레거시 SQL 서비스와의 롤아웃 호환을 위해 선택적입니다. */
  previewChange?: CareerPropertySchemaService["previewChange"];
  applyChange?: CareerPropertySchemaService["applyChange"];
  restoreProperty?: CareerPropertySchemaService["restoreProperty"];
  listViewConfigurations?: CareerViewService["list"];
  createViewConfiguration?: CareerViewService["create"];
  updateViewConfiguration?: CareerViewService["update"];
  duplicateViewConfiguration?: CareerViewService["duplicate"];
  deleteViewConfiguration?: CareerViewService["delete"];
  reorderViewConfigurations?: CareerViewService["reorder"];
  queryViewConfiguration?: CareerViewService["query"];
  replaceTargets?: RelationService["replaceTargets"];
  listRelationTargets?: RelationService["listTargets"];
  removeRelationTargetsForRecord?: RelationService["removeForRecord"];
  previewCategoryMove?: CategoryMoveService["preview"];
  commitCategoryMove?: CategoryMoveService["commit"];
  previewFormula?: CareerComputationService["previewFormula"];
  previewRollup?: CareerComputationService["previewRollup"];
}

export { CareerProducerCoordinator, createCareerProducerIntent, careerProducerFingerprint, validateCareerProducerIntent, careerProducerSource, careerProducerScopeFilter } from "./prepared-producer.js";
export type { CareerProducerBusinessPort, CareerProducerDocumentPort } from "./prepared-producer.js";

export { createSpringCareerProducerPort, createCareerProducerCredential } from "./spring-producer-port.js";
export type { CareerProducerCredentialProvider, CareerProducerHttpTransport } from "./spring-producer-port.js";

export { CanonicalCareerReadService } from "./canonical-reads.js";
export { getCareerWriteOperation, publicCareerWriteOperation } from "./write-operation-status.js";
export { translateCareerProductProperties } from "./product-write-values.js";
export { AiRecordCleaner, RecordCleanupError, cleanupProperties, cleanupChangedFields, type RecordCleaner, type CleanupContext } from "./record-cleaner.js";
export { CAREER_PRODUCER_COLLECTIONS } from "./prepared-producer.js";
export type { CareerProducerRecoveryPolicy } from "./prepared-producer.js";
export { careerProducerOperationId, careerProducerInputFingerprint } from "./prepared-producer.js";
export { PreparedCareerProductWrites } from "./prepared-product-writes.js";
export { createCareerProductFacade } from "./product-facade.js";
export { createSpringPropertyMutationHttpTransport, createCareerPropertyMutationCredential } from "./spring-property-mutation-http.js";
export { canonicalRecordReadDefinitions } from "./canonical-read-context.js";
