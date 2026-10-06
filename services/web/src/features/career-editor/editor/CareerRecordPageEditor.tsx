"use client";

import type { CareerCategory, CareerRecordListItem } from "@expresso/contracts";

import { useCareerRecordMutations } from "../properties/useCareerRecordMutations";
import { CareerDocumentEditor } from "./CareerDocumentEditor";

export function CareerRecordPageEditor({ record, category }: {
  record: CareerRecordListItem;
  category: CareerCategory;
}) {
  const mutations = useCareerRecordMutations([record]);
  const current = mutations.records.find((item) => item.id === record.id) ?? record;
  return <CareerDocumentEditor recordId={current.id} mode="page" record={current} category={category}
    onRecordCommit={mutations.commitCell} onRecordAccepted={mutations.acceptRecord} />;
}
