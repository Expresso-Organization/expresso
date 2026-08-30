import { createHash } from "node:crypto";

export const analyticsDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export function safeAnalyticsReferrer(value?: string): string | null { if (!value) return null; try { return new URL(value).origin.slice(0, 500); } catch { return null; } }
export function analyticsMinute(at: Date): string { return at.toISOString().slice(0, 16); }
