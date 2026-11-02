import { CareerWriteOperationResponseSchema, UuidSchema, type CareerWriteOperation } from "@expresso/contracts";
const prefix = "ex-career-write:v1:";
export async function durableWriteKey(scope: string, input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const name = prefix + scope + ":request:" + digest;
  let key: string | null = null;
  try { key = sessionStorage.getItem(name); } catch {}
  if (!key || !UuidSchema.safeParse(key).success) {
    key = crypto.randomUUID();
    try { sessionStorage.setItem(name, key); } catch {}
  }
  return key;
}
export function savedOperation(scope: string): string | null {
  try { const value = sessionStorage.getItem(prefix + scope + ":operation"); return UuidSchema.safeParse(value).success ? value : null; } catch { return null; }
}
export function saveOperation(scope: string, id: string | null): void {
  try { const name = prefix + scope + ":operation"; if (id) sessionStorage.setItem(name, UuidSchema.parse(id)); else sessionStorage.removeItem(name); } catch {}
}
export async function readWriteOperation(id: string, signal?: AbortSignal): Promise<CareerWriteOperation> {
  const response = await fetch("/api/career/write-operations/" + encodeURIComponent(UuidSchema.parse(id)), { cache: "no-store", ...(signal ? { signal } : {}) });
  if (!response.ok) { const error = new Error(response.status === 401 || response.status === 404 ? "이 작업에 접근할 수 없습니다." : "작업 상태를 확인하지 못했습니다."); Object.assign(error, { status: response.status }); throw error; }
  const parsed = CareerWriteOperationResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.data.operationId !== id) throw new Error("작업 상태 응답을 확인하지 못했습니다.");
  return parsed.data.data;
}
export function clearDurableWriteKeys(scope: string): void {
  try {
    const start = prefix + scope + ":request:";
    for (const name of Object.keys(sessionStorage)) if (name.startsWith(start)) sessionStorage.removeItem(name);
  } catch {}
}