import { ReplaceResumeSchema } from "@expresso/contracts";
import { afterAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/build-app.js";
import type { RuntimeConfig } from "../../src/config/runtime-config.js";
import type { AccountLifecycleService } from "../../src/modules/account-lifecycle/service.js";
import type { AnalyticsService } from "../../src/modules/analytics/service.js";
import type { CareerService } from "../../src/modules/career/service.js";
import type { EngagementService } from "../../src/modules/engagement/service.js";
import type { EntitlementService } from "../../src/modules/entitlements/service.js";
import type { GenerationService } from "../../src/modules/generation/service.js";
import type { IdentityService } from "../../src/modules/identity/service.js";
import type { InterviewService } from "../../src/modules/interview/service.js";
import type { JobAnalysisService } from "../../src/modules/job-analysis/service.js";
import type { JobMarketService } from "../../src/modules/jobs/service.js";
import type { MaterialsService } from "../../src/modules/materials/service.js";
import type { PortfolioEditingService } from "../../src/modules/portfolio-editing/service.js";
import type { PublishingService } from "../../src/modules/publishing/service.js";
import type { RecipeService } from "../../src/modules/recipe/service.js";
import type { BrewJobService } from "../../src/modules/brew-jobs/service.js";
import type { ConsentService } from "../../src/modules/consent/service.js";
import type { TemplateService } from "../../src/modules/templates/service.js";

const uuid = "11111111-1111-4111-8111-111111111111";
const config: RuntimeConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 4_000, logLevel: "silent",
  databaseUrl: "postgres://127.0.0.1:1/unused", redisUrl: "redis://127.0.0.1:1",
  outboxPollIntervalMs: 1_000, outboxBatchSize: 25, outboxMaxAttempts: 5, queuePrefix: "security-gate",
};
const identity = { async verifyAccessToken() { return null; } } as IdentityService;
const unavailable = {};
const app = buildApi({
  config, identityService: identity,
  entitlementService: unavailable as EntitlementService,
  careerService: unavailable as CareerService,
  jobMarketService: unavailable as JobMarketService,
  jobAnalysisService: unavailable as JobAnalysisService,
  materialsService: unavailable as MaterialsService,
  interviewService: unavailable as InterviewService,
  recipeService: unavailable as RecipeService,
  brewJobService: unavailable as BrewJobService,
  consentService: unavailable as ConsentService,
  templateService: unavailable as TemplateService,
  generationService: unavailable as GenerationService,
  portfolioEditingService: unavailable as PortfolioEditingService,
  publishingService: unavailable as PublishingService,
  analyticsService: unavailable as AnalyticsService,
  engagementService: unavailable as EngagementService,
  accountLifecycleService: unavailable as AccountLifecycleService,
});

describe("release security route inventory", () => {
  afterAll(async () => app.close());

  it("requires bearer authentication before every owner-scoped route handler", async () => {
    const protectedRoutes = [
      ["GET", "/v1/me"], ["DELETE", `/v1/identity/sessions/${uuid}`],
      ["GET", "/v1/entitlements/export.document"], ["GET", "/v1/career/categories"],
      ["POST", "/v1/career/records"], ["GET", `/v1/career/records/${uuid}`],
      ["POST", "/v1/jobs/submissions"], ["GET", `/v1/job-analyses/${uuid}`],
      ["GET", "/v1/consents"], ["POST", "/v1/consents"],
      ["DELETE", "/v1/consents/career_records"],
      ["POST", "/v1/brews"], ["GET", `/v1/brews/${uuid}`],
      ["POST", `/v1/brews/${uuid}/interview-sessions`],
      ["GET", `/v1/brew-jobs/${uuid}`],
      ["GET", `/v1/recipes/${uuid}`], ["GET", `/v1/recipes/${uuid}/template-previews`],
      ["POST", "/v1/generation-jobs"], ["POST", `/v1/portfolios/${uuid}/deployments`],
      ["DELETE", `/v1/portfolios/${uuid}/publication`], ["POST", `/v1/portfolios/${uuid}/exports`],
      ["POST", `/v1/assets/${uuid}/signed-url`], ["POST", `/v1/deployments/${uuid}/analytics/aggregate`],
      ["GET", "/v1/notification-preferences"], ["GET", "/v1/home"], ["GET", "/v1/search?q=test"],
      ["GET", "/v1/account/export"], ["POST", "/v1/account/deletion"],
    ] as const;
    for (const [method, url] of protectedRoutes) {
      const response = await app.inject({ method, url });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    }
  });

  it("rejects mass assignment, oversized fields, and unsupported resume file types", async () => {
    const event = {
      eventId: uuid, slug: "valid-slug", sessionId: "session-security-0001", type: "visit",
      occurredAt: "2026-08-09T00:00:00.000Z", userId: uuid,
    };
    const response = await app.inject({ method: "POST", url: "/v1/analytics/events", payload: event });
    expect(response.statusCode).toBe(400);
    expect(ReplaceResumeSchema.safeParse({ fileUrl: "uploads/payload.exe" }).success).toBe(false);
    expect(ReplaceResumeSchema.safeParse({ fileUrl: `uploads/${"x".repeat(2_000)}.pdf` }).success).toBe(false);
    expect(ReplaceResumeSchema.safeParse({ fileUrl: "uploads/resume.pdf" }).success).toBe(true);
  });
});
