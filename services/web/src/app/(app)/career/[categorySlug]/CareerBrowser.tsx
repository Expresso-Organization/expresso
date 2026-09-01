"use client";

import type { CareerCategory, CareerRecordListItem, CareerViewConfiguration } from "@expresso/contracts";
import { CareerViewShell } from "@/features/career-editor/views/CareerViewShell";

export function CareerBrowser({ category, records, initialView }: { category: CareerCategory; records: readonly CareerRecordListItem[]; initialView: CareerViewConfiguration }) {
  return <CareerViewShell category={category} initialView={initialView} initialPage={{ data: [...records], page: { hasNextPage: false, nextCursor: null } }} />;
}
