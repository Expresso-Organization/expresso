import { careerSwitch } from "./career-switch.js";
import { dataAnalyst } from "./data-analyst.js";
import { mlResearch } from "./ml-research.js";
import { newgrad } from "./newgrad.js";
import { staffPlatform } from "./staff-platform.js";
import type { Persona } from "./types.js";

export { personaEmail, type Persona, type PersonaPropertyValue, type PersonaRecord } from "./types.js";

/** 기록이 적은 사람부터 많은 사람 순서. 관리 화면도 이 순서로 그린다. */
export const PERSONAS: readonly Persona[] = [newgrad, careerSwitch, dataAnalyst, mlResearch, staffPlatform];
