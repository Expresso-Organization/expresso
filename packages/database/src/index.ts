export { migrateMongo as migrate, migrateMongo, type MigrateResult, type MongoMigrateOptions } from "./mongo-migrate.js";
export { loadMongoMigrations, type MongoMigration, type MongoMigrationStep } from "./mongo-migrations.js";
export { mongoCollections, type MongoCollections } from "./collections.js";
export { loadCollectionSpecs, type MongoCollectionSpec } from "./collection-specs.js";
export { acquireMigrationLease, renewMigrationLease, recoverMigrationLease, releaseMigrationLease, MigrationLeaseUnavailable } from "./migration-lease.js";
export { officialPropertyDefinitionId, exactOptionId, legacy0009PropertyDefinitionId } from "./career-property-canonical-mapping.js";
export { inspectCareerPropertyMigration, careerPropertyReferenceLocations, type CareerPropertyInventoryDb, type CareerPropertyPreflightReport, type CareerPropertyMigrationConflict, type CareerPropertyMigrationConflictReason, type CareerPropertyReferenceLocation, type LegacyValueDistribution, type PropertyIdMapping } from "./career-property-inventory.js";
export { reconcileCareerProperties, type CareerPropertyReconciliationMismatch, type CareerPropertyReconciliationMismatchReason, type CareerPropertyReconciliationReport } from "./career-property-reconciliation.js";
export type * from "./documents/index.js";

