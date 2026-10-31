import { CareerPropertyMutationStatusResponseSchema, CareerResumePropertyMutationSchema, UuidSchema, type CareerPropertyMutationStatus } from "@expresso/contracts";

export async function readPropertyMutationJson(url: string, signal: AbortSignal | undefined, issue: string, init: RequestInit = {}): Promise<unknown> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let abort!: () => void;
  let timer!: ReturnType<typeof setTimeout>;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => { controller.abort(signal?.reason); reject(signal?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      const error = new Error("요청 시간이 초과되었습니다. 속성 변경 상태를 다시 확인해 주세요.");
      controller.abort(error); reject(error);
    }, 30_000);
  });
  try {
    // 응답 본문까지 요청별 제한을 적용하고 중단을 무시하는 전송도 정리합니다.
    return await Promise.race([interrupted, (async () => {
      const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(issue + " (" + response.status + ")");
      const body: unknown = await response.json().catch(() => null);
      controller.signal.throwIfAborted();
      return body;
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function resumeCareerPropertyMutation(mutationId: string, signal?: AbortSignal): Promise<CareerPropertyMutationStatus> {
  const id = UuidSchema.parse(mutationId);
  const body = await readPropertyMutationJson("/api/career/property-mutations/" + id + "/resume", signal, "속성 변경을 다시 시작하지 못했습니다.", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(CareerResumePropertyMutationSchema.parse({})),
  });
  const result = CareerPropertyMutationStatusResponseSchema.safeParse(body);
  if (!result.success) throw new Error("속성 변경 응답을 확인하지 못했습니다.");
  if (result.data.data.id !== id) throw new Error("속성 변경 응답이 작업과 일치하지 않습니다.");
  return result.data.data;
}
export async function waitForCareerPropertyMutation(mutationId: string, categoryId: string, { signal, onStatus }: {
  signal: AbortSignal;
  onStatus?(status: CareerPropertyMutationStatus): void;
}): Promise<CareerPropertyMutationStatus> {
  const id = UuidSchema.parse(mutationId), category = UuidSchema.parse(categoryId);
  for (;;) {
    signal.throwIfAborted();
    const body = await readPropertyMutationJson("/api/career/property-mutations/" + id, signal, "속성 변경 상태를 확인하지 못했습니다.");
    signal.throwIfAborted();
    const parsed = CareerPropertyMutationStatusResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error("속성 변경 상태 응답을 확인하지 못했습니다.");
    const status = parsed.data.data;
    if (status.id !== id || status.categoryId !== category) throw new Error("속성 변경 응답이 작업과 일치하지 않습니다.");
    onStatus?.(status);
    if (status.status === "completed" || status.status === "failed") return status;
    if (!status.active) throw new Error("속성 변경 작업 상태를 확인해 주세요.");
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1_000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}