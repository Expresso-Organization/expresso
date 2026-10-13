import { z } from "zod";

export const CareerRecordStatusSchema = z.enum(["draft", "organized", "verified"]);