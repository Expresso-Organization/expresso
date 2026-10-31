"use client";

import { CareerRecordSchema, type CareerPropertyDefinitionV2, type CareerRecord } from "@expresso/contracts";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

/** 웹이 Worker의 outbox 전달 주기(`OUTBOX_POLL_INTERVAL_MS` 기본값 1000)마다 한 번 다시 읽는다. */
export const COMPUTED_REFRESH_INTERVAL_MS = 1_000;
/**
 * 전달 1초와 BullMQ 지수 재시도 첫 세 번(1 · 2 · 4초, `platform/mongo-outbox.ts`의 `backoff`)을 더한 8초에
 * 한 간격을 더한다. 그때까지 값이 오지 않으면 Worker가 멈춘 것으로 보고 그만 읽는다.
 */
export const COMPUTED_REFRESH_DEADLINE_MS = 1_000 + 1_000 + 2_000 + 4_000 + COMPUTED_REFRESH_INTERVAL_MS;

type RecordLike = Pick<CareerRecord, "id" | "version" | "title" | "properties" | "computedProperties" | "propertyValues">;

/**
 * 서버가 이 저장에 계산 작업을 넣었는지 본다. 넣지 않았으면 Worker가 버전을 올리지 않으므로 기다리지 않는다.
 * - `career/service.ts`의 `updateRecord`: 살아 있는 정의마다 저장 값을 JSON으로 비교한다. 제목은 `title` 정의가 있을 때만 센다.
 * - `career/relations.ts`의 `replaceTargets`: 기록 필드는 그대로 두고 버전만 올리지만 항상 계산 작업을 넣는다.
 */
export function savedComputationInput(previous: RecordLike, next: RecordLike, definitions: readonly CareerPropertyDefinitionV2[]): boolean {
  const live = definitions.filter((definition) => definition.deletedAt === null);
  const input = (record: RecordLike, definition: CareerPropertyDefinitionV2) => record.propertyValues !== undefined && definition.type !== "relation"
    ? record.propertyValues.find(value => value.propertyDefinitionId === definition.id) ?? null
    : record.properties[definition.key] ?? null;
  const changed = live.some((definition) => definition.type === "title"
    ? previous.title !== next.title
    : JSON.stringify(input(previous, definition)) !== JSON.stringify(input(next, definition)));
  if (changed) return true;
  return previous.title === next.title && live.some((definition) => definition.type === "relation");
}

/**
 * 수식 · 롤업 값은 Worker가 기록 저장 뒤에 계산해 `computedProperties`에 쓰고 기록 `version`을 올린다.
 * 패널이 계산 입력을 저장했거나 계산 속성 키가 아직 없으면 기록을 다시 읽어, 버전이 올라가고
 * 빠진 키가 모두 생긴 기록으로 바꾼다. 자기가 적용한 버전으로는 다시 돌지 않는다.
 * 돌려주는 값은 다시 읽는 중인지다.
 */
export function useComputedRefresh<T extends RecordLike>(record: T, definitions: readonly CareerPropertyDefinitionV2[], setRecord: Dispatch<SetStateAction<T>>): boolean {
  const computedKeys = useMemo(() => definitions.filter((definition) => definition.deletedAt === null && (definition.type === "formula" || definition.type === "rollup")).map((definition) => definition.key), [definitions]);
  const missing = computedKeys.filter((key) => !record.computedProperties || !Object.hasOwn(record.computedProperties, key)).join("\u0000");
  const hasComputed = computedKeys.length > 0;
  // 마지막으로 본 기록. 버전이 바뀌면 이것과 비교해 계산 입력이 바뀌었는지 본다.
  const seen = useRef<RecordLike>(record);
  // Worker가 이 버전보다 높은 버전을 써야 계산이 끝난 것이다. 기다릴 것이 없으면 null이다.
  const awaiting = useRef<number | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const previous = seen.current;
    seen.current = record;
    if (record.version !== previous.version) awaiting.current = hasComputed && savedComputationInput(previous, record, definitions) ? record.version : null;
    const awaitVersion = awaiting.current;
    const keys = missing ? missing.split("\u0000") : [];
    if (!hasComputed || (awaitVersion === null && keys.length === 0)) return;
    const controller = new AbortController();
    const deadline = Date.now() + COMPUTED_REFRESH_DEADLINE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => { awaiting.current = null; setPending(false); };
    setPending(true);
    const poll = async () => {
      try {
        const response = await fetch(`/api/career/records/${encodeURIComponent(record.id)}`, { cache: "no-store", signal: controller.signal });
        const parsed = response.ok ? CareerRecordSchema.safeParse(((await response.json()) as { data?: unknown }).data) : null;
        const latest = parsed?.success ? parsed.data : null;
        const ready = latest !== null && (awaitVersion === null || latest.version > awaitVersion) && keys.every((key) => latest.computedProperties && Object.hasOwn(latest.computedProperties, key));
        if (latest && ready) {
          // Worker가 쓴 기록은 계산 입력을 바꾸지 않았으므로 다음 비교의 기준으로 먼저 둔다.
          seen.current = { ...seen.current, ...latest };
          settle();
          // 그사이 패널이 더 새 버전을 저장했으면 그 값을 덮지 않는다.
          setRecord((current) => latest.version >= current.version ? { ...current, ...latest } : current);
          return;
        }
      } catch {
        // 연결이 끊긴 한 번은 다음 간격에 다시 읽는다. 화면을 떠나 취소된 요청은 그대로 끝낸다.
        if (controller.signal.aborted) return;
      }
      if (Date.now() + COMPUTED_REFRESH_INTERVAL_MS > deadline) { settle(); return; }
      timer = setTimeout(() => void poll(), COMPUTED_REFRESH_INTERVAL_MS);
    };
    timer = setTimeout(() => void poll(), COMPUTED_REFRESH_INTERVAL_MS);
    return () => { controller.abort(); if (timer) clearTimeout(timer); setPending(false); };
  }, [record, definitions, missing, hasComputed, setRecord]);

  return pending;
}
