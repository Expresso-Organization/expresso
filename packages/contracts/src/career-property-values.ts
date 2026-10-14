import { z } from "zod";
import { CareerPropertyValueV2Schema } from "./career-properties.js";

export const CareerPropertyValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(100),
  CareerPropertyValueV2Schema,
]);

export const CareerPropertiesSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  CareerPropertyValueSchema,
);
