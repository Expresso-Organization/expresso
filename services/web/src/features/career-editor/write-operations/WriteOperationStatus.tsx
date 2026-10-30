"use client";
import type { CareerWriteOperation } from "@expresso/contracts";
import { useEffect, useRef, useState } from "react";
import { readWriteOperation, saveOperation } from "./write-operation-client";
export function WriteOperationStatus({ operationId, initial, scope, producer, recordId, onCompleted }: {
  operationId: string; initial?: CareerWriteOperation | null | undefined; scope: string; producer: CareerWriteOperation["producer"]; recordId?: string;
  onCompleted(operation: CareerWriteOperation): void | Promise<void>;
}) {
  const [operation, setOperation] = useState(initial ?? null);
  const [issue, setIssue] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [round, setRound] = useState(0);
  const completed = useRef<string | null>(null);
  const callback = useRef(onCompleted); callback.current = onCompleted;
  useEffect(() => {
    let active = true, attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setOperation(initial ?? null); setIssue(null); setStopped(false);
    async function poll() {
      try {
        const value = await readWriteOperation(operationId, controller.signal);
        if (!active) return;
        if (value.producer !== producer || (recordId && value.recordId !== recordId)) throw new Error("작업이 요청한 기록과 일치하지 않습니다.");
        setOperation(value);
        if (value.state === "completed") {
          if (completed.current !== operationId) {
            await callback.current(value);
            if (!active) return;
            completed.current = operationId;
            saveOperation(scope, null);
          }
          return;
        }
        if (value.state === "cancelled" || value.state === "recovery-required") { setStopped(true); return; }
        if (++attempts < 30) timer = setTimeout(() => void poll(), 2_000);
        else setStopped(true);
      } catch (error) {
        if (!active) return;
        if ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 404) saveOperation(scope, null);
        setIssue(error instanceof Error ? error.message : "작업 상태를 확인하지 못했습니다.");
        setStopped(true);
      }
    }
    void poll();
    return () => { active = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [operationId, producer, recordId, scope, round]);
  const terminal = operation?.state === "recovery-required" || operation?.state === "cancelled";
  const message = operation?.state === "completed" ? "변경 적용이 완료되었습니다." : operation?.state === "recovery-required" ? "복구 확인이 필요합니다. 적용된 변경을 다시 실행하지 않습니다."
    : operation?.state === "cancelled" ? "작업이 취소되었습니다. 현재 적용 상태를 확인해 주세요."
      : operation?.state === "retry" ? "변경 적용 중입니다. 자동 복구를 기다리고 있습니다." : "변경 적용 중입니다.";
  return <div role={issue || terminal ? "alert" : "status"} aria-live="polite"><p>{issue ?? message}</p>{stopped && !terminal ? <button type="button" onClick={() => setRound(value => value + 1)}>상태 다시 확인</button> : null}</div>;
}