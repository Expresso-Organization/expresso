import Fastify, { LogController, type FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../config/runtime-config.js";
import type { ReadinessCheck } from "../modules/system/readiness.js";
import { registerSystemRoutes } from "../modules/system/routes.js";
import type { IdentityService } from "../modules/identity/service.js";
import { registerIdentityRoutes } from "../modules/identity/routes.js";
import type { GoogleIdTokenVerifier } from "../modules/identity/google.js";
import type { EntitlementService } from "../modules/entitlements/service.js";
import { registerEntitlementRoutes } from "../modules/entitlements/routes.js";
import { createAuthenticateRequest } from "./plugins/auth-context.js";
import type { CareerService } from "../modules/career/service.js";
import { registerCareerRoutes } from "../modules/career/routes.js";
import type { JobMarketService } from "../modules/jobs/service.js";
import { registerJobMarketRoutes } from "../modules/jobs/routes.js";
import type { JobIngestService, JobUrlImporter } from "../modules/jobs/ingest/index.js";
import type { JobBoardService } from "../modules/jobs/board-service.js";
import { registerJobBoardRoutes } from "../modules/jobs/board-routes.js";
import type { JobAnalysisService } from "../modules/job-analysis/service.js";
import { registerJobAnalysisRoutes } from "../modules/job-analysis/routes.js";
import type { MaterialsService } from "../modules/materials/service.js";
import { registerMaterialsRoutes } from "../modules/materials/routes.js";
import type { InterviewService } from "../modules/interview/service.js";
import { registerInterviewRoutes } from "../modules/interview/routes.js";
import type { RecipeService } from "../modules/recipe/service.js";
import type { CompanyResearchService } from "../modules/company-research/service.js";
import { registerCompanyResearchRoutes } from "../modules/company-research/routes.js";
import type { BrewJobService } from "../modules/brew-jobs/service.js";
import { registerBrewJobRoutes } from "../modules/brew-jobs/routes.js";
import { registerRecipeRoutes } from "../modules/recipe/routes.js";
import type { TemplateService } from "../modules/templates/service.js";
import { registerTemplateRoutes } from "../modules/templates/routes.js";
import type { GenerationService } from "../modules/generation/service.js";
import { registerGenerationRoutes } from "../modules/generation/routes.js";
import type { PortfolioEditingService } from "../modules/portfolio-editing/service.js";
import { registerPortfolioEditingRoutes } from "../modules/portfolio-editing/routes.js";
import type { PortfolioReadService } from "../modules/portfolios/service.js";
import { registerPortfolioRoutes } from "../modules/portfolios/routes.js";
import type { LayoutService } from "../modules/layout/service.js";
import type { ConsentService } from "../modules/consent/service.js";
import { registerConsentRoutes } from "../modules/consent/routes.js";
import { registerLayoutRoutes } from "../modules/layout/routes.js";
import type { PublishingService } from "../modules/publishing/service.js";
import { registerPublishingRoutes } from "../modules/publishing/routes.js";
import type { MediaService } from "../modules/media/service.js";
import { registerMediaRoutes } from "../modules/media/routes.js";
import { registerPageRoutes } from "../modules/page/routes.js";
import type { PageStream } from "../modules/page/stream.js";
import type { PageGenerator } from "../modules/page/generator.js";
import type { PageService } from "../modules/page/service.js";
import type { AnalyticsService } from "../modules/analytics/service.js";
import { registerAnalyticsRoutes } from "../modules/analytics/routes.js";
import type { EngagementService } from "../modules/engagement/service.js";
import { registerEngagementRoutes } from "../modules/engagement/routes.js";
import type { AccountLifecycleService } from "../modules/account-lifecycle/service.js";
import { registerAccountLifecycleRoutes } from "../modules/account-lifecycle/routes.js";
import {
  createLoggerOptions,
  createRequestId,
} from "../platform/observability.js";
import { registerErrorHandler } from "./error-handler.js";

export interface BuildApiOptions {
  config: RuntimeConfig;
  readinessChecks?: readonly ReadinessCheck[];
  identityService?: IdentityService;
  /** 없으면 Google 로그인 경로가 503으로 답한다. */
  googleIdTokenVerifier?: GoogleIdTokenVerifier;
  entitlementService?: EntitlementService;
  careerService?: CareerService;
  jobMarketService?: JobMarketService;
  jobIngestService?: JobIngestService;
  jobUrlImporter?: JobUrlImporter;
  jobBoardService?: JobBoardService;
  jobAnalysisService?: JobAnalysisService;
  materialsService?: MaterialsService;
  interviewService?: InterviewService;
  recipeService?: RecipeService;
  companyResearchService?: CompanyResearchService;
  brewJobService?: BrewJobService;
  templateService?: TemplateService;
  generationService?: GenerationService;
  portfolioEditingService?: PortfolioEditingService;
  portfolioReadService?: PortfolioReadService;
  layoutService?: LayoutService;
  consentService?: ConsentService;
  publishingService?: PublishingService;
  mediaService?: MediaService;
  pageService?: PageService;
  /** 자유 생성 지면을 쓰려면 서비스와 생성기가 **둘 다** 있어야 한다. */
  pageGenerator?: PageGenerator;
  /** 만들어지는 지면을 흘려보내는 통로. 없으면 그 자리가 503이다. */
  pageStream?: PageStream | null;
  analyticsService?: AnalyticsService;
  engagementService?: EngagementService;
  accountLifecycleService?: AccountLifecycleService;
}

export function buildApi(options: BuildApiOptions): FastifyInstance {
  const app = Fastify({
    logger: createLoggerOptions(options.config.logLevel),
    genReqId: createRequestId,
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    requestTimeout: options.config.requestTimeoutMs ?? 30_000,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    void reply.header("x-request-id", request.id);
    return payload;
  });

  registerErrorHandler(app);

  void app.register(registerSystemRoutes, {
    readinessChecks: options.readinessChecks ?? [],
  });

  if (options.identityService) {
    registerIdentityRoutes(app, {
      identityService: options.identityService,
      ...(options.googleIdTokenVerifier
        ? { googleIdTokenVerifier: options.googleIdTokenVerifier }
        : {}),
    });
    if (options.entitlementService) {
      registerEntitlementRoutes(app, {
        entitlementService: options.entitlementService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.careerService) {
      registerCareerRoutes(app, {
        careerService: options.careerService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.jobMarketService) {
      registerJobMarketRoutes(app, {
        jobMarketService: options.jobMarketService,
        jobIngestService: options.jobIngestService,
        jobUrlImporter: options.jobUrlImporter,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    // 읽기 라우트를 먼저 건다 — `/jobs/postings/:id`가 쓰기 라우트와 같은 자리다.
    if (options.jobBoardService) {
      registerJobBoardRoutes(app, {
        service: options.jobBoardService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.jobAnalysisService) {
      registerJobAnalysisRoutes(app, {
        jobAnalysisService: options.jobAnalysisService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.materialsService) {
      registerMaterialsRoutes(app, {
        materialsService: options.materialsService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.companyResearchService) {
      registerCompanyResearchRoutes(app, {
        service: options.companyResearchService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.brewJobService) {
      registerBrewJobRoutes(app, {
        service: options.brewJobService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
      if (options.interviewService) {
        registerInterviewRoutes(app, {
          interviewService: options.interviewService,
          brewJobService: options.brewJobService,
          authenticateRequest: createAuthenticateRequest(options.identityService),
        });
      }
      if (options.recipeService) {
        registerRecipeRoutes(app, {
          recipeService: options.recipeService,
          brewJobService: options.brewJobService,
          authenticateRequest: createAuthenticateRequest(options.identityService),
        });
      }
    }
    if (options.templateService) {
      registerTemplateRoutes(app, {
        templateService: options.templateService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.generationService) {
      registerGenerationRoutes(app, {
        generationService: options.generationService,
        pageStream: options.pageStream ?? null,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.portfolioReadService) {
      registerPortfolioRoutes(app, {
        service: options.portfolioReadService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.consentService) {
      registerConsentRoutes(app, {
        service: options.consentService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.layoutService) {
      registerLayoutRoutes(app, {
        service: options.layoutService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.portfolioEditingService) {
      registerPortfolioEditingRoutes(app, {
        service: options.portfolioEditingService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.mediaService) {
      registerMediaRoutes(app, {
        service: options.mediaService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.pageService && options.pageGenerator) {
      registerPageRoutes(app, {
        service: options.pageService,
        generator: options.pageGenerator,
        stream: options.pageStream ?? null,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.publishingService) {
      registerPublishingRoutes(app, {
        service: options.publishingService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.analyticsService) {
      registerAnalyticsRoutes(app, {
        service: options.analyticsService,
        identityService: options.identityService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.engagementService) {
      registerEngagementRoutes(app, {
        service: options.engagementService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
    if (options.accountLifecycleService) {
      registerAccountLifecycleRoutes(app, {
        service: options.accountLifecycleService,
        authenticateRequest: createAuthenticateRequest(options.identityService),
      });
    }
  }

  return app;
}
