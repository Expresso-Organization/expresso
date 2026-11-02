import { z } from "zod";
import { UuidSchema } from "./common.js";
/** 원문 label이 자연 idempotency key이며 사용자 ID는 인증 principal에서만 결정합니다. */
export const CareerRegisterPropertyOptionSchema=z.strictObject({label:z.string().max(200)});
export const CareerPropertyOptionResponseSchema=z.strictObject({data:z.strictObject({id:UuidSchema,name:z.string().max(200)}),version:z.literal(1)});
export type CareerRegisterPropertyOption=z.infer<typeof CareerRegisterPropertyOptionSchema>;
export type CareerPropertyOptionResponse=z.infer<typeof CareerPropertyOptionResponseSchema>;
