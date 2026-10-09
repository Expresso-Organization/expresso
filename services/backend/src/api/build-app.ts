import Fastify, {
  LogController,
  type FastifyInstance,
} from "fastify";
import websocket from "@fastify/websocket";

import type { RuntimeConfig } from "../config/runtime-config.js";
import type { AiClient } from "../platform/ai/client.js";
import {
  createLoggerOptions,
  createRequestId,
} from "../platform/observability.js";

import type { ReadinessCheck } from "../modules/system/readiness.js";
import { registerSystemRoutes } from "../modules/system/routes.js";

import type { IdentityApi } from "../modules/identity/index.js";
import { registerIdentityRoutes } from "../modules/identity/routes.js";
import type { GoogleIdTokenVerifier } from "../modules/identity/google.js";

import type { EntitlementApi } from "../modules/entitlements/index.js";
import { registerEntitlementRoutes } from "../modules/entitlements/routes.js";

import type { CareerApi } from "../modules/career/index.js";
import { registerCareerRoutes } from "../modules/career/routes.js";

import type {
  JobMarketApi,
  JobBoardApi,
} from "../modules/jobs/index.js";
import { registerJobMarketRoutes } from "../modules/jobs/routes.js";
import { registerJobBoardRoutes } from "../modules/jobs/board-routes.js";
import type {
  JobIngestApi,
  JobUrlImporter,
} from "../modules/jobs/ingest/index.js";

import type { JobAnalysisApi } from "../modules/job-analysis/index.js";
import { registerJobAnalysisRoutes } from "../modules/job-analysis/routes.js";

import type { JobChatApi } from "../modules/job-chat/index.js";
import { registerJobChatRoutes } from "../modules/job-chat/routes.js";
import { registerJobChatP2Routes } from "../modules/job-chat/p2-routes.js";

import type {
  JobCareerMatchApi,
} from "../modules/job-career-match/index.js";
import {
  registerJobCareerMatchRoutes,
} from "../modules/job-career-match/routes.js";

import type { MaterialsApi } from "../modules/materials/index.js";
import { registerMaterialsRoutes } from "../modules/materials/routes.js";

import type { InterviewApi } from "../modules/interview/index.js";
import { registerInterviewRoutes } from "../modules/interview/routes.js";

import type { RecipeApi } from "../modules/recipe/index.js";
import { registerRecipeRoutes } from "../modules/recipe/routes.js";

import type {
  CompanyResearchApi,
} from "../modules/company-research/index.js";
import {
  registerCompanyResearchRoutes,
} from "../modules/company-research/routes.js";

import type { BrewJobApi } from "../modules/brew-jobs/index.js";
import { registerBrewJobRoutes } from "../modules/brew-jobs/routes.js";

import type {
  DesignSystemService,
} from "../modules/design-systems/service.js";
import {
  registerDesignSystemRoutes,
} from "../modules/design-systems/routes.js";

import type { TemplateApi } from "../modules/templates/index.js";
import { registerTemplateRoutes } from "../modules/templates/routes.js";

import type { GenerationApi } from "../modules/generation/index.js";
import { registerGenerationRoutes } from "../modules/generation/routes.js";

import type {
  PortfolioEditingApi,
} from "../modules/portfolio-editing/index.js";
import {
  registerPortfolioEditingRoutes,
} from "../modules/portfolio-editing/routes.js";

import type { PortfolioReadApi } from "../modules/portfolios/index.js";
import { registerPortfolioRoutes } from "../modules/portfolios/routes.js";

import type { LayoutApi } from "../modules/layout/index.js";
import { registerLayoutRoutes } from "../modules/layout/routes.js";

import type { ConsentApi } from "../modules/consent/index.js";
import { registerConsentRoutes } from "../modules/consent/routes.js";

import type { PublishingApi } from "../modules/publishing/index.js";
import { registerPublishingRoutes } from "../modules/publishing/routes.js";

import type { MediaApi } from "../modules/media/index.js";
import { registerMediaRoutes } from "../modules/media/routes.js";

import type { PageApi } from "../modules/page/index.js";
import type { PageStream } from "../modules/page/stream.js";
import type { PageGenerator } from "../modules/page/generator.js";
import { registerPageRoutes } from "../modules/page/routes.js";

import type { AnalyticsApi } from "../modules/analytics/index.js";
import { registerAnalyticsRoutes } from "../modules/analytics/routes.js";

import type { EngagementApi } from "../modules/engagement/index.js";
import { registerEngagementRoutes } from "../modules/engagement/routes.js";

import type {
  AccountLifecycleApi,
} from "../modules/account-lifecycle/index.js";
import {
  registerAccountLifecycleRoutes,
} from "../modules/account-lifecycle/routes.js";

import type {
  CareerDocumentApi,
} from "../modules/career-editor/index.js";
import {
  registerCareerDocumentRoutes,
} from "../modules/career-editor/routes.js";
import {
  registerCareerDocumentSocket,
} from "../modules/career-editor/socket.js";

import { createAuthenticateRequest } from "./plugins/auth-context.js";
import { registerErrorHandler } from "./error-handler.js";

import type { JobChatFactService } from "../modules/job-chat/fact-service.js";
import { registerJobChatFactRoutes } from "../modules/job-chat/fact-routes.js";

export interface BuildApiOptions {
  config: RuntimeConfig;
  readinessChecks?: readonly ReadinessCheck[];

  jobChatAi?: AiClient | null;
  jobChatService?: JobChatApi;
  jobCareerMatchService?: JobCareerMatchApi;
  jobChatFactService?: JobChatFactService;

  identityService?: IdentityApi;

  /** 없으면 Google 로그인 경로가 503으로 답한다. */
  googleIdTokenVerifier?: GoogleIdTokenVerifier;

  entitlementService?: EntitlementApi;
  careerService?: CareerApi;
  jobMarketService?: JobMarketApi;
  jobIngestService?: JobIngestApi;
  jobUrlImporter?: JobUrlImporter;
  jobBoardService?: JobBoardApi;
  jobAnalysisService?: JobAnalysisApi;
  materialsService?: MaterialsApi;
  interviewService?: InterviewApi;
  recipeService?: RecipeApi;
  companyResearchService?: CompanyResearchApi;
  brewJobService?: BrewJobApi;
  designSystemService?: DesignSystemService;
  templateService?: TemplateApi;
  generationService?: GenerationApi;
  portfolioEditingService?: PortfolioEditingApi;
  portfolioReadService?: PortfolioReadApi;
  layoutService?: LayoutApi;
  consentService?: ConsentApi;
  publishingService?: PublishingApi;
  mediaService?: MediaApi;
  pageService?: PageApi;

  /** 자유 생성 지면은 서비스와 생성기가 모두 필요하다. */
  pageGenerator?: PageGenerator;

  /** 생성되는 지면을 전달하는 통로. */
  pageStream?: PageStream | null;

  analyticsService?: AnalyticsApi;
  engagementService?: EngagementApi;
  accountLifecycleService?: AccountLifecycleApi;
  careerDocumentService?: CareerDocumentApi;
}

export function buildApi(
  options: BuildApiOptions,
): FastifyInstance {
  const app = Fastify({
    logger: createLoggerOptions(options.config.logLevel),
    genReqId: createRequestId,
    logController: new LogController({
      requestIdLogLabel: "requestId",
    }),
    requestTimeout:
      options.config.requestTimeoutMs ?? 30_000,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    void reply.header("x-request-id", request.id);
    return payload;
  });

  registerErrorHandler(app);

  // WebSocket 플러그인을 HTTP 라우트보다 먼저 등록한다.
  void app.register(websocket);

  void app.after(() => {
    if (
      options.identityService &&
      options.careerDocumentService
    ) {
      registerCareerDocumentSocket(app, {
        service: options.careerDocumentService,
        identityService: options.identityService,
        signingSecret:
          options.config.assetSigningSecret ??
          "expresso-local-asset-signing-secret",
        ...(options.config.careerSocketAllowedOrigin
          ? {
              allowedOrigin:
                options.config.careerSocketAllowedOrigin,
            }
          : {}),
      });
    }
  });

  void app.register(registerSystemRoutes, {
    readinessChecks: options.readinessChecks ?? [],
  });

  if (options.identityService) {
    const authenticateRequest = createAuthenticateRequest(
      options.identityService,
    );

    registerIdentityRoutes(app, {
      identityService: options.identityService,
      ...(options.googleIdTokenVerifier
        ? {
            googleIdTokenVerifier:
              options.googleIdTokenVerifier,
          }
        : {}),
    });

    if (options.entitlementService) {
      registerEntitlementRoutes(app, {
        entitlementService: options.entitlementService,
        authenticateRequest,
      });
    }

    if (options.careerService) {
      registerCareerRoutes(app, {
        careerService: options.careerService,
        authenticateRequest,
      });
    }

    if (options.careerDocumentService) {
      registerCareerDocumentRoutes(app, {
        service: options.careerDocumentService,
        authenticateRequest,
      });
    }

    if (options.jobMarketService) {
      registerJobMarketRoutes(app, {
        jobMarketService: options.jobMarketService,
        ...(options.jobIngestService
          ? { jobIngestService: options.jobIngestService }
          : {}),
        ...(options.jobUrlImporter
          ? { jobUrlImporter: options.jobUrlImporter }
          : {}),
        authenticateRequest,
      });
    }

    if (options.jobBoardService) {
      registerJobBoardRoutes(app, {
        service: options.jobBoardService,
        authenticateRequest,
      });
    }

    if (options.jobAnalysisService) {
      registerJobAnalysisRoutes(app, {
        jobAnalysisService: options.jobAnalysisService,
        authenticateRequest,
      });
    }

    // P1: 공고 기반 채팅
    if (
      options.jobBoardService &&
      options.consentService
    ) {
      registerJobChatRoutes(app, {
        ai: options.jobChatAi ?? null,
        jobBoardService: options.jobBoardService,
        consentService: options.consentService,
        authenticateRequest,
      });
    }

    // P2: 대화 저장·복구
    // P4: 현재 경력과 P3 분석 결과를 채팅에 연결
    if (
      options.jobBoardService &&
      options.consentService &&
      options.jobChatService
    ) {
      registerJobChatP2Routes(app, {
        ai: options.jobChatAi ?? null,
        jobChatService: options.jobChatService,
        jobBoardService: options.jobBoardService,
        consentService: options.consentService,

        ...(options.careerService
          ? { careerService: options.careerService }
          : {}),

        ...(options.jobCareerMatchService
          ? {
              jobCareerMatchService:
                options.jobCareerMatchService,
            }
          : {}),

        authenticateRequest,

        generationLeaseMs:
          (options.config.aiTimeoutMs ?? 180_000) * 3 +
          60_000,
      });
    }

    // P3: 공고 × 경력 맞춤 분석
    if (options.jobCareerMatchService) {
      registerJobCareerMatchRoutes(app, {
        jobCareerMatchService:
          options.jobCareerMatchService,
        authenticateRequest,
      });
    }

    // P5: 경력 후보 생성·승인·거절
    if (options.jobChatFactService) {
      registerJobChatFactRoutes(app, {
        service: options.jobChatFactService,
        authenticateRequest,
      });
    }

    if (options.materialsService) {
      registerMaterialsRoutes(app, {
        materialsService: options.materialsService,
        authenticateRequest,
      });
    }

    if (options.companyResearchService) {
      registerCompanyResearchRoutes(app, {
        service: options.companyResearchService,
        authenticateRequest,
      });
    }

    if (options.brewJobService) {
      registerBrewJobRoutes(app, {
        service: options.brewJobService,
        authenticateRequest,
      });

      if (options.interviewService) {
        registerInterviewRoutes(app, {
          interviewService: options.interviewService,
          brewJobService: options.brewJobService,
          authenticateRequest,
        });
      }

      if (options.recipeService) {
        registerRecipeRoutes(app, {
          recipeService: options.recipeService,
          brewJobService: options.brewJobService,
          authenticateRequest,
        });
      }
    }

    if (options.designSystemService) {
      registerDesignSystemRoutes(app, {
        service: options.designSystemService,
        authenticateRequest,
      });
    }

    if (options.templateService) {
      registerTemplateRoutes(app, {
        templateService: options.templateService,
        authenticateRequest,
      });
    }

    if (options.generationService) {
      registerGenerationRoutes(app, {
        generationService: options.generationService,
        pageStream: options.pageStream ?? null,
        authenticateRequest,
      });
    }

    if (options.portfolioReadService) {
      registerPortfolioRoutes(app, {
        service: options.portfolioReadService,
        authenticateRequest,
      });
    }

    if (options.consentService) {
      registerConsentRoutes(app, {
        service: options.consentService,
        authenticateRequest,
      });
    }

    if (options.layoutService) {
      registerLayoutRoutes(app, {
        service: options.layoutService,
        authenticateRequest,
      });
    }

    if (options.portfolioEditingService) {
      registerPortfolioEditingRoutes(app, {
        service: options.portfolioEditingService,
        authenticateRequest,
      });
    }

    if (options.mediaService) {
      registerMediaRoutes(app, {
        service: options.mediaService,
        authenticateRequest,
      });
    }

    if (options.pageService) {
      registerPageRoutes(app, {
        service: options.pageService,
        ...(options.pageGenerator
          ? { generator: options.pageGenerator }
          : {}),
        stream: options.pageStream ?? null,
        authenticateRequest,
      });
    }

    if (options.publishingService) {
      registerPublishingRoutes(app, {
        service: options.publishingService,
        authenticateRequest,
      });
    }

    if (options.analyticsService) {
      registerAnalyticsRoutes(app, {
        service: options.analyticsService,
        identityService: options.identityService,
        authenticateRequest,
      });
    }

    if (options.engagementService) {
      registerEngagementRoutes(app, {
        service: options.engagementService,
        authenticateRequest,
      });
    }

    if (options.accountLifecycleService) {
      registerAccountLifecycleRoutes(app, {
        service: options.accountLifecycleService,
        authenticateRequest,
      });
    }
  }

  return app;
}