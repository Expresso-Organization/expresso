import { z } from "zod";
import { CareerProducerBusinessCommandSchema,CareerProducerDocumentCommandSchema,CareerProducerCommitRequestSchema,
 CareerProducerBusinessResultSchema,CareerProducerIntentSchema,PrepareCareerAiProposalSchema,PrepareCareerAiProposalUndoSchema } from "./career-producer.js";
const component=(schema:z.ZodType)=>{const {$schema:_dialect,...result}=z.toJSONSchema(schema,{target:"draft-2020-12",io:"input"});return result;};
// 준비용 component만 노출하며 기존 제품 OpenAPI path를 변경하지 않습니다.
export const careerProducerOpenApiComponents={
 CareerProducerBusinessCommand:component(CareerProducerBusinessCommandSchema),
 CareerProducerDocumentCommand:component(CareerProducerDocumentCommandSchema),
 CareerProducerCommitRequest:component(CareerProducerCommitRequestSchema),
 CareerProducerBusinessResult:component(CareerProducerBusinessResultSchema),
 CareerProducerIntent:component(CareerProducerIntentSchema),
 PrepareCareerAiProposal:component(PrepareCareerAiProposalSchema),
 PrepareCareerAiProposalUndo:component(PrepareCareerAiProposalUndoSchema),
} as const;