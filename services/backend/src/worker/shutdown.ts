/** 닫을 수 있는 큐 워커. `force`면 처리 중인 잡을 기다리지 않는다(BullMQ `Worker.close`). */
export interface ClosableWorker {
  close(force?: boolean): Promise<void>;
}

/**
 * Worker 프로세스를 닫는다. **큐 워커를 먼저, 연결은 나중에.**
 *
 * 처리 중인 잡은 끝나거나 실패하면서 DB에 결과를 쓰고, 미룰 잡은 큐로 돌려보낸다. 그 전에 DB · 큐 연결을 닫으면
 * 쓰기가 닫힌 클라이언트에 막혀 잡이 `running`으로 영원히 남는다 — 2026-11-10 운영에서 배포 재시작 뒤 질문
 * 생성 화면이 끝나지 않았다(이슈 #203). 연결을 둘 다 한꺼번에 닫던 것이 원인이었다.
 */
export async function closeWorkerRuntime({ workers, resources, force }: {
  workers: readonly ClosableWorker[];
  /** 워커가 모두 닫힌 뒤에 닫을 것. outbox 감시 · 큐 · DB · 측정기. */
  resources: readonly (() => Promise<unknown>)[];
  force: boolean;
}): Promise<void> {
  await Promise.allSettled(workers.map((worker) => worker.close(force)));
  await Promise.allSettled(resources.map((close) => close()));
}
