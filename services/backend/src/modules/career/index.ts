import type { CareerService as LegacyCareerService } from "./legacy-mysql-service.js";
import type { CareerPropertySchemaService } from "./property-schema.js";
import type { CareerViewService } from "./views.js";
import type { CategoryMoveService } from "./category-move.js";
import type { RelationService } from "./relations.js";
export { CareerService } from "./service.js";
export { MongoCareerService } from "./service.js";
export { assertActiveRecordsForWrite, purgeTrashedCareerRecord } from "./mongo-record-guard.js";
export { CareerError } from "./errors.js";
export interface CareerApi extends Pick<LegacyCareerService, keyof LegacyCareerService> {
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
}
