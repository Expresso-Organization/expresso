// 과거 마이그레이션과 명시적 preflight는 고정된 0017 변환 규칙을 사용합니다.
export {
  prepareCanonicalCareerCategory, prepareCanonicalCareerRecord, inventoryCanonicalCareerPreparation,
  applyCanonicalCareerPreparation, CanonicalCareerPreparationConflict,
  type CareerPropertyOptionRegistration, type CanonicalPreparationRecord, type CanonicalPreparationConflict,
  type CanonicalStoredCareerValue, type CanonicalRecordPreparation, type CanonicalCategoryPreparation,
  type CanonicalPreparationInventory,
} from "./mongodb-migrations/0017/canonical-preparation.js";