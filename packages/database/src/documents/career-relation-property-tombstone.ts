import type { CareerRecordRelationDoc } from "./career-editor.js";
export interface CareerRelationInverseDefinitionBinding {
  recordId: string; categoryId: string; categoryVersion: number; schemaVersion: number;
  definitionId: string; version: number; config: Record<string, unknown>;
}
export interface CareerRelationPropertyTombstoneDoc {
  _id: string; userId: string; categoryId: string; propertyId: string; recordId: string; deletionMutationId: string;
  definitionVersion: number; deletedAt: string; categoryVersion: number; schemaVersion: number;
  config: Record<string, unknown>; sourceRecordVersion: number;
  forwardEdges: CareerRecordRelationDoc[]; inverseEdges: CareerRecordRelationDoc[];
  inverseDefinitionBindings: CareerRelationInverseDefinitionBinding[];
  inverseRecordVersions: Record<string, number>; inverseRecordReferenceVersions: Record<string, number>; createdAt: Date;
}
export interface CareerRelationRestorationJournal {
  deletionMutationId: string; propertyId: string;
  forwardEdges: CareerRecordRelationDoc[]; inverseEdges: CareerRecordRelationDoc[];
}