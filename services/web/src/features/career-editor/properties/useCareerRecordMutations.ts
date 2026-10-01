"use client";

import type { CareerPropertyDefinitionV2, CareerRecord, CareerRecordListItem } from "@expresso/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { replaceCanonicalPropertyValue, type CareerPropertyEditorValue } from "./canonical-property-values";

type PendingCell = { recordId: string; definition: CareerPropertyDefinitionV2; value: CareerPropertyEditorValue | null; revision: number };

export function careerRecordListItem(record: CareerRecord): CareerRecordListItem {
  const propertiesEmpty = record.propertyValues !== undefined
    ? record.propertyValues.length === 0
    : Object.keys(record.properties).length === 0;
  return { ...record, categoryKey: "", isEmpty: record.title === "" && record.bodyMd === "" && propertiesEmpty,
    periodFrom: null, periodTo: null, linkCount: 0, usedInCount: 0 };
}

export function useCareerRecordMutations(initialRecords: CareerRecordListItem[]) {
  const [records, setRecords] = useState(initialRecords);
  const [cellIssues, setCellIssues] = useState<Map<string, string>>(new Map());
  const recordsRef = useRef(records);
  const recordQueues = useRef(new Map<string, Promise<void>>());
  const pendingCells = useRef(new Map<string, PendingCell>());
  const failedCells = useRef(new Map<string, Omit<PendingCell, "revision">>());
  const revision = useRef(0);

  useEffect(() => { recordsRef.current = records; }, [records]);

  const replaceRecords = useCallback((updater: (current: CareerRecordListItem[]) => CareerRecordListItem[]) => {
    const next = updater(recordsRef.current);
    recordsRef.current = next;
    setRecords(next);
  }, []);

  function applyCell(record: CareerRecordListItem, definition: CareerPropertyDefinitionV2,
    value: CareerPropertyEditorValue | null): CareerRecordListItem {
    if (definition.key === "title") return { ...record, title: value?.type === "title" ? value.value : "" };
    return { ...record, propertyValues: replaceCanonicalPropertyValue(record, definition, value) };
  }

  function applyPending(record: CareerRecordListItem): CareerRecordListItem {
    let next = record;
    for (const pending of pendingCells.current.values()) {
      if (pending.recordId === record.id) next = applyCell(next, pending.definition, pending.value);
    }
    return next;
  }

  async function saveCell(pending: PendingCell) {
    const key = `${pending.recordId}:${pending.definition.id}`;
    async function attempt(base: CareerRecordListItem, retry: boolean): Promise<CareerRecordListItem> {
      const optimistic = applyPending(base);
      const body = pending.definition.key === "title"
        ? { title: optimistic.title }
        : { propertyValues: optimistic.propertyValues };
      const response = await fetch(`/api/career/records/${pending.recordId}`, {
        method: "PATCH", headers: { "content-type": "application/json", "if-match": `"v${base.version}"` },
        body: JSON.stringify(body),
      });
      if ((response.status === 409 || response.status === 412) && retry) {
        const latestResponse = await fetch(`/api/career/records/${pending.recordId}`);
        if (!latestResponse.ok) throw new Error("최신 기록을 불러오지 못했습니다.");
        const latestPayload = await latestResponse.json() as { data: CareerRecord };
        const latest = careerRecordListItem(latestPayload.data);
        replaceRecords((current) => current.map((record) => record.id === latest.id ? applyPending(latest) : record));
        return attempt(latest, false);
      }
      if (!response.ok) throw new Error(response.status === 409 || response.status === 412
        ? "다른 곳에서 바뀐 값과 충돌했습니다." : "값을 저장하지 못했습니다.");
      const payload = await response.json() as { data: CareerRecord };
      return careerRecordListItem(payload.data);
    }

    const base = recordsRef.current.find((record) => record.id === pending.recordId);
    if (!base) return;
    try {
      const saved = await attempt(base, true);
      if (pendingCells.current.get(key)?.revision === pending.revision) pendingCells.current.delete(key);
      failedCells.current.delete(key);
      setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
      replaceRecords((current) => current.map((record) => record.id === saved.id ? applyPending({ ...record, ...saved }) : record));
    } catch (error) {
      if (pendingCells.current.get(key)?.revision !== pending.revision) return;
      pendingCells.current.delete(key);
      failedCells.current.set(key, { recordId: pending.recordId, definition: pending.definition, value: pending.value });
      const message = error instanceof Error ? error.message : "값을 저장하지 못했습니다.";
      setCellIssues((current) => new Map(current).set(key, message));
      const latestResponse = await fetch(`/api/career/records/${pending.recordId}`).catch(() => null);
      if (latestResponse?.ok) {
        const latestPayload = await latestResponse.json() as { data: CareerRecord };
        replaceRecords((current) => current.map((record) => record.id === pending.recordId
          ? applyPending(careerRecordListItem(latestPayload.data)) : record));
      }
    }
  }

  const commitCell = useCallback(async (recordId: string, definition: CareerPropertyDefinitionV2,
    value: CareerPropertyEditorValue | null) => {
    const key = `${recordId}:${definition.id}`;
    const pending = { recordId, definition, value, revision: ++revision.current };
    pendingCells.current.set(key, pending);
    failedCells.current.delete(key);
    setCellIssues((current) => { if (!current.has(key)) return current; const next = new Map(current); next.delete(key); return next; });
    try {
      replaceRecords((current) => current.map((record) => record.id === recordId
        ? applyCell(record, definition, value) : record));
    } catch (error) {
      pendingCells.current.delete(key);
      setCellIssues((current) => new Map(current).set(key, error instanceof Error ? error.message : "값을 저장하지 못했습니다."));
      return;
    }
    const previous = recordQueues.current.get(recordId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(() => saveCell(pending));
    recordQueues.current.set(recordId, queued);
    await queued;
  }, [replaceRecords]);

  const retryCell = useCallback((recordId: string, propertyId: string) => {
    const failed = failedCells.current.get(`${recordId}:${propertyId}`);
    if (failed) void commitCell(failed.recordId, failed.definition, failed.value);
  }, [commitCell]);

  const acceptRecord = useCallback((accepted: CareerRecordListItem) => {
    replaceRecords((current) => current.map((record) => record.id === accepted.id ? { ...record, ...accepted } : record));
  }, [replaceRecords]);

  return { records, setRecords, cellIssues, recordsRef, recordQueues, replaceRecords,
    applyPending, commitCell, retryCell, acceptRecord };
}
