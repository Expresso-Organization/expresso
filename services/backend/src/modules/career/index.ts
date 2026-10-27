import type { CareerService } from "./service.js";
import type { CareerPropertySchemaService } from "./property-schema.js";
import type { CareerViewService } from "./views.js";
import type { CategoryMoveService } from "./category-move.js";
import type { RelationService } from "./relations.js";
import type { CareerComputationService } from "../career-computation/index.js";
export { CareerService } from "./service.js";
export { MongoCareerService } from "./service.js";
export { assertActiveRecordsForWrite, purgeTrashedCareerRecord } from "./mongo-record-guard.js";
export { CareerError } from "./errors.js";
export { cleanupChangedFields, type RecordCleaner } from "./record-cleaner.js";
export { multiSelectValueByNames } from "./select-options.js";
export { careerRecordText, careerRecordTextReader, readableCareerProperties } from "./record-text.js";
type CareerCoreMethod = "listCategories" | "listRecords" | "createCategory" | "createRecord" | "getRecord" | "updateRecord"
  | "createLink" | "listLinks" | "getDeleteImpact" | "trashRecord" | "restoreRecord"
  | "recomputeSkill" | "listSkills" | "listSkillEvidence" | "getProfile" | "saveProfile";
export interface CareerApi extends Pick<CareerService, CareerCoreMethod> {
  /** 라우트 단위 테스트가 필요한 부분만 조립할 수 있게 선택적으로 둡니다. */
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
  listTrashedRecords?: CareerService["listTrashedRecords"];
}
