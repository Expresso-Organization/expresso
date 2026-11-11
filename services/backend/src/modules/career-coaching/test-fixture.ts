import { randomUUID } from "node:crypto";
import type { AnalyticsDashboard } from "@expresso/contracts";
export function dashboard(): AnalyticsDashboard { return {portfolio:{id:randomUUID(),title:"테스트 포트폴리오"},deployment:{id:randomUUID()},period:{preset:"30d",start:"2026-10-01",end:"2026-10-30"},coverage:{pendingDates:[]},metrics:{visits:50,completes:10,contactClicks:0},insight:{state:"none"}} as unknown as AnalyticsDashboard; }
