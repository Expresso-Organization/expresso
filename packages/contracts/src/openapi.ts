import { z } from "zod";

import {
  ApiErrorResponseSchema,
  CursorPaginationQuerySchema,
  IdempotencyHeadersSchema,
  IfMatchHeaderSchema,
  PageInfoSchema,
  ResourceVersionSchema,
} from "./common.js";
import {
  JobEnvelopeBaseSchema,
  JobProgressEventSchema,
} from "./jobs.js";
import {
  AuthenticatedUserSchema,
  CurrentUserResponseSchema,
  IdentitySessionIdParamsSchema,
  IssuedIdentitySessionSchema,
} from "./identity.js";
import {
  EntitlementCapabilityParamsSchema,
  EntitlementDecisionResponseSchema,
  EntitlementDecisionSchema,
  EntitlementUsageSchema,
} from "./entitlements.js";
import {
  CareerCategoriesResponseSchema,
  CareerCategorySchema,
  CareerDeleteImpactSchema,
  CareerRecordResponseSchema,
  CareerRecordSchema,
  CareerSkillSchema,
  CareerSkillEvidenceResponseSchema,
  CareerViewSchema,
  CreateCareerRecordSchema,
  RecomputeCareerSkillSchema,
  UpdateCareerRecordSchema,
} from "./career.js";
import {
  ExplainableMatchSchema,
  InterpretedJobSearchSchema,
  JobDemandSummarySchema,
  JobRequirementsSchema,
  JobSearchConditionSchema,
  SubmitJobPostingSchema,
  SubmittedJobPostingSchema,
} from "./job-market.js";
import {
  JobAnalysisExtractionSchema,
  JobAnalysisResultSchema,
  JobAnalysisStatusSchema,
  ReanalysisRequestResultSchema,
  RequirementCoverageSchema,
} from "./job-analysis.js";
import {
  BrewMaterialSchema,
  BrewMaterialsSchema,
  CreateBrewSchema,
  UpdateBrewMaterialsSchema,
} from "./materials.js";
import {
  InterviewAnswerResultSchema,
  InterviewAnswerSchema,
  InterviewQuestionBasisSchema,
  InterviewQuestionSchema,
  InterviewSessionSchema,
  SaveInterviewAnswerSchema,
} from "./interview.js";
import {
  RecipeEditResultSchema,
  RecipeEditSchema,
  RecipeEvidencePathSchema,
  RecipeItemSchema,
  RecipeSchema,
  RecipeSectionSchema,
} from "./recipe.js";
import {
  TemplatePreviewSchema,
  TemplatePreviewsSchema,
  TemplateStyleSchema,
} from "./templates.js";
import {
  GenerationJobStatusSchema,
  GenerationOutputSchema,
  SubmitGenerationSchema,
} from "./generation.js";
import {
  ApplyPortfolioEditResultSchema,
  PortfolioEditCommandSchema,
  PortfolioEditProposalSchema,
  RestorePortfolioSchema,
} from "./portfolio-editing.js";
import {
  DeploymentSchema,
  PublicPortfolioSchema,
  PublishPortfolioSchema,
  ReplaceResumeSchema,
  SignedAssetSchema,
  SubmitExportSchema,
} from "./publishing.js";
import {
  AnalyticsEventSchema,
  DashboardViewInputSchema,
  DerivedMetricInputSchema,
  InsightSchema,
} from "./analytics.js";
import {
  HomeReadModelSchema,
  NotificationPreferenceSchema,
  NotificationSchema,
  UnifiedSearchItemSchema,
  UnifiedSearchQuerySchema,
} from "./engagement.js";
import { AccountExportSchema, CancelDeletionSchema, DeletionRequestSchema } from "./account-lifecycle.js";

function jsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { target: "draft-2020-12" });
}

export const expressoOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Expresso API",
    version: "1.0.0",
  },
  paths: {},
  components: {
    schemas: {
      ApiErrorResponse: jsonSchema(ApiErrorResponseSchema),
      CursorPaginationQuery: jsonSchema(CursorPaginationQuerySchema),
      PageInfo: jsonSchema(PageInfoSchema),
      ResourceVersion: jsonSchema(ResourceVersionSchema),
      IdempotencyHeaders: jsonSchema(IdempotencyHeadersSchema),
      IfMatchHeader: jsonSchema(IfMatchHeaderSchema),
      JobEnvelopeBase: jsonSchema(JobEnvelopeBaseSchema),
      JobProgressEvent: jsonSchema(JobProgressEventSchema),
      AuthenticatedUser: jsonSchema(AuthenticatedUserSchema),
      CurrentUserResponse: jsonSchema(CurrentUserResponseSchema),
      IdentitySessionIdParams: jsonSchema(IdentitySessionIdParamsSchema),
      IssuedIdentitySession: jsonSchema(IssuedIdentitySessionSchema),
      EntitlementUsage: jsonSchema(EntitlementUsageSchema),
      EntitlementDecision: jsonSchema(EntitlementDecisionSchema),
      EntitlementCapabilityParams: jsonSchema(EntitlementCapabilityParamsSchema),
      EntitlementDecisionResponse: jsonSchema(EntitlementDecisionResponseSchema),
      CareerCategory: jsonSchema(CareerCategorySchema),
      CareerCategoriesResponse: jsonSchema(CareerCategoriesResponseSchema),
      CareerRecord: jsonSchema(CareerRecordSchema),
      CareerRecordResponse: jsonSchema(CareerRecordResponseSchema),
      CreateCareerRecord: jsonSchema(CreateCareerRecordSchema),
      UpdateCareerRecord: jsonSchema(UpdateCareerRecordSchema),
      CareerView: jsonSchema(CareerViewSchema),
      CareerDeleteImpact: jsonSchema(CareerDeleteImpactSchema),
      RecomputeCareerSkill: jsonSchema(RecomputeCareerSkillSchema),
      CareerSkill: jsonSchema(CareerSkillSchema),
      CareerSkillEvidenceResponse: jsonSchema(CareerSkillEvidenceResponseSchema),
      SubmitJobPosting: jsonSchema(SubmitJobPostingSchema),
      SubmittedJobPosting: jsonSchema(SubmittedJobPostingSchema),
      JobSearchCondition: jsonSchema(JobSearchConditionSchema),
      InterpretedJobSearch: jsonSchema(InterpretedJobSearchSchema),
      JobRequirements: jsonSchema(JobRequirementsSchema),
      ExplainableMatch: jsonSchema(ExplainableMatchSchema),
      JobDemandSummary: jsonSchema(JobDemandSummarySchema),
      JobAnalysisExtraction: jsonSchema(JobAnalysisExtractionSchema),
      RequirementCoverage: jsonSchema(RequirementCoverageSchema),
      JobAnalysisStatus: jsonSchema(JobAnalysisStatusSchema),
      JobAnalysisResult: jsonSchema(JobAnalysisResultSchema),
      ReanalysisRequestResult: jsonSchema(ReanalysisRequestResultSchema),
      CreateBrew: jsonSchema(CreateBrewSchema),
      BrewMaterial: jsonSchema(BrewMaterialSchema),
      BrewMaterials: jsonSchema(BrewMaterialsSchema),
      UpdateBrewMaterials: jsonSchema(UpdateBrewMaterialsSchema),
      InterviewQuestionBasis: jsonSchema(InterviewQuestionBasisSchema),
      InterviewQuestion: jsonSchema(InterviewQuestionSchema),
      InterviewAnswer: jsonSchema(InterviewAnswerSchema),
      InterviewSession: jsonSchema(InterviewSessionSchema),
      SaveInterviewAnswer: jsonSchema(SaveInterviewAnswerSchema),
      InterviewAnswerResult: jsonSchema(InterviewAnswerResultSchema),
      RecipeEvidencePath: jsonSchema(RecipeEvidencePathSchema),
      RecipeItem: jsonSchema(RecipeItemSchema),
      RecipeSection: jsonSchema(RecipeSectionSchema),
      Recipe: jsonSchema(RecipeSchema),
      RecipeEdit: jsonSchema(RecipeEditSchema),
      RecipeEditResult: jsonSchema(RecipeEditResultSchema),
      TemplateStyle: jsonSchema(TemplateStyleSchema),
      TemplatePreview: jsonSchema(TemplatePreviewSchema),
      TemplatePreviews: jsonSchema(TemplatePreviewsSchema),
      SubmitGeneration: jsonSchema(SubmitGenerationSchema),
      GenerationJobStatus: jsonSchema(GenerationJobStatusSchema),
      GenerationOutput: jsonSchema(GenerationOutputSchema),
      PortfolioEditCommand: jsonSchema(PortfolioEditCommandSchema),
      PortfolioEditProposal: jsonSchema(PortfolioEditProposalSchema),
      ApplyPortfolioEditResult: jsonSchema(ApplyPortfolioEditResultSchema),
      RestorePortfolio: jsonSchema(RestorePortfolioSchema),
      PublishPortfolio: jsonSchema(PublishPortfolioSchema),
      Deployment: jsonSchema(DeploymentSchema),
      PublicPortfolio: jsonSchema(PublicPortfolioSchema),
      SubmitExport: jsonSchema(SubmitExportSchema),
      ReplaceResume: jsonSchema(ReplaceResumeSchema),
      SignedAsset: jsonSchema(SignedAssetSchema),
      AnalyticsEvent: jsonSchema(AnalyticsEventSchema),
      DashboardViewInput: jsonSchema(DashboardViewInputSchema),
      DerivedMetricInput: jsonSchema(DerivedMetricInputSchema),
      Insight: jsonSchema(InsightSchema),
      NotificationPreference: jsonSchema(NotificationPreferenceSchema),
      Notification: jsonSchema(NotificationSchema),
      UnifiedSearchQuery: jsonSchema(UnifiedSearchQuerySchema),
      UnifiedSearchItem: jsonSchema(UnifiedSearchItemSchema),
      HomeReadModel: jsonSchema(HomeReadModelSchema),
      AccountExport: jsonSchema(AccountExportSchema),
      DeletionRequest: jsonSchema(DeletionRequestSchema),
      CancelDeletion: jsonSchema(CancelDeletionSchema),
    },
  },
} as const;

export type ExpressoOpenApiDocument = typeof expressoOpenApiDocument;
