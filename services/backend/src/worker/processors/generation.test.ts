import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { createGenerationProcessor } from "./generation.js";

function setup(options: { completedStatus?: string; notifyFails?: boolean; pageFormat?: "html" | "json-render" | null } = {}) {
  const status = { status: options.completedStatus ?? "done" };
  const service = {
    prepareFreeHtml: vi.fn(async () => ({ userId: "user-1", portfolioId: "portfolio-1", pageFormat: options.pageFormat ?? null, status: { status: "running" } })),
    completeFreeHtml: vi.fn(async () => status),
    failFreeHtml: vi.fn(async () => ({ status: "failed" })),
    process: vi.fn(),
  };
  const page = { service: { generate: vi.fn(async () => ({ qualityStatus: "ready" })) }, generator: {} };
  const notifier = {
    notifyGeneration: vi.fn(async () => {
      if (options.notifyFails) throw new Error("notification store down");
      return { created: true };
    }),
  };
  const processor = createGenerationProcessor(service as never, {} as never, null, page as never, notifier as never);
  const job = { data: { generationJobId: "job-1" } } as unknown as Job<Record<string, unknown>>;
  return { processor, job, service, notifier, status, page };
}

describe("generation processor notifications", () => {
  it("notifies once when the generation is done", async () => {
    const { processor, job, notifier, status } = setup();
    await expect(processor(job)).resolves.toBe(status);
    expect(notifier.notifyGeneration).toHaveBeenCalledWith("user-1", "portfolio-1", "job-1");
  });

  it("keeps the completed result when the notification fails", async () => {
    const { processor, job, service, status } = setup({ notifyFails: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(processor(job)).resolves.toBe(status);
    expect(service.failFreeHtml).not.toHaveBeenCalled();
  });

  it("does not notify when completion did not reach done", async () => {
    const { processor, job, notifier } = setup({ completedStatus: "failed" });
    await processor(job);
    expect(notifier.notifyGeneration).not.toHaveBeenCalled();
  });
});

describe("generation processor page format", () => {
  it.each(["html", "json-render", null] as const)("passes the job's page format (%s) to the page generator", async (pageFormat) => {
    const { processor, job, page } = setup({ pageFormat });
    await processor(job);
    expect(page.service.generate).toHaveBeenCalledWith(
      "user-1",
      "portfolio-1",
      page.generator,
      { generationJobId: "job-1", streamId: "job-1", pageFormat },
    );
  });
});
