"use client";

import type { CareerCategory, CareerRecord } from "@expresso/contracts";
import { createContext, useContext } from "react";

/**
 * 문서 패널에서 저장한 결과를 카테고리 뷰에 알린다.
 * `PropertyList`는 본문 편집기 아래에 있어 prop을 직접 받을 수 없다. `DocumentPanel`이
 * 이 context를 제공하고 `PropertyList`가 저장 · 속성 생성 뒤에 부른다.
 */
export interface CareerRecordSync {
  onRecordChange(record: CareerRecord): void;
  onCategoryChange(category: CareerCategory): void;
}

const NOOP: CareerRecordSync = { onRecordChange: () => undefined, onCategoryChange: () => undefined };
const CareerRecordSyncContext = createContext<CareerRecordSync>(NOOP);

export const CareerRecordSyncProvider = CareerRecordSyncContext.Provider;

export function useCareerRecordSync(): CareerRecordSync {
  return useContext(CareerRecordSyncContext);
}
