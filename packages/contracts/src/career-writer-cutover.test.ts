import { describe, expect, it } from "vitest";
import { CareerWriterMoveSchema } from "./career-writer.js";
const categoryId="00000000-0000-4000-8000-000000000051";
const propertyId="00000000-0000-4000-8000-000000000052";
describe("Career product Move compatibility",()=>{
  it("preserves the product choice to discard unmapped values",()=>{
    const input={targetCategoryId:categoryId,previewToken:"p".repeat(32),discardUnmappedPropertyIds:[propertyId]};
    expect(CareerWriterMoveSchema.safeParse(input).success).toBe(true);
    expect(CareerWriterMoveSchema.parse(input)).toEqual(input);
  });
  it("retains the existing preserve-all request shape",()=>{
    const input={targetCategoryId:categoryId,previewToken:"p".repeat(32)};
    expect(CareerWriterMoveSchema.parse(input)).toEqual(input);
  });
  it("rejects malformed discard IDs and more than 200 entries",()=>{
    const input={targetCategoryId:categoryId,previewToken:"p".repeat(32)};
    expect(CareerWriterMoveSchema.safeParse({...input,discardUnmappedPropertyIds:["unsafe"]}).success).toBe(false);
    expect(CareerWriterMoveSchema.safeParse({...input,discardUnmappedPropertyIds:Array(201).fill(propertyId)}).success).toBe(false);
  });
});
