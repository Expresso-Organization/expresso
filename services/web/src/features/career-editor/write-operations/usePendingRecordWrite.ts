"use client";
import type { CareerWriteOperation } from "@expresso/contracts";
import { useEffect, useState } from "react";
import { RECORD_WRITE_PENDING_EVENT, recordWriteScope } from "./record-write-client";
import { saveOperation, savedOperation } from "./write-operation-client";
export interface PendingRecordWrite { operationId: string; initial?: CareerWriteOperation }
export function usePendingRecordWrite(recordId: string) {
  const [pending, setPending] = useState<PendingRecordWrite | null>(null);
  useEffect(() => {
    const operationId = savedOperation(recordWriteScope(recordId));
    setPending(operationId ? { operationId } : null);
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ recordId: string; operation: CareerWriteOperation }>).detail;
      if (detail.recordId === recordId) setPending({ operationId: detail.operation.operationId, initial: detail.operation });
    };
    window.addEventListener(RECORD_WRITE_PENDING_EVENT, receive);
    return () => window.removeEventListener(RECORD_WRITE_PENDING_EVENT, receive);
  }, [recordId]);
  return { pending, finish: () => { saveOperation(recordWriteScope(recordId), null); setPending(null); } };
}
