import { z } from "zod";
import { CareerPropertyValueV2Schema } from "./career-properties.js";
export const CareerPropertyValueSchema = CareerPropertyValueV2Schema;
export const CareerPropertiesSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), CareerPropertyValueSchema);
