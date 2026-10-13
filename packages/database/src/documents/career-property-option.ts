/** 사용자의 표시 옵션 메타데이터입니다. canonical Record 값과 공유 스키마 버전은 별도 소유입니다. */
export interface CareerPropertyOptionDoc {
  _id: string;
  userId: string;
  categoryId: string;
  propertyId: string;
  optionId: string;
  rawLabel: string;
  version: 1;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}