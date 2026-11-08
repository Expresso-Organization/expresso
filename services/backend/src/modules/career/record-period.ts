import { CareerPropertyValueV2Schema } from "@expresso/contracts";
import { mongoCollections, type CareerRecordDoc } from "@expresso/database";
import type { ClientSession, Db } from "mongodb";

export interface RecordPeriod {
  start: string;
  end: string | null;
}

/** 기록의 기간은 `period` 날짜 속성에 있다. 없는 기록(스킬 · 수상)은 null이다. */
export function recordPeriod(record: Pick<CareerRecordDoc, "properties">): RecordPeriod | null {
  const parsed = CareerPropertyValueV2Schema.safeParse(record.properties.period);
  if (!parsed.success || parsed.data.type !== "date" || !parsed.data.value.start) return null;
  return { start: parsed.data.value.start.slice(0, 10), end: parsed.data.value.end?.slice(0, 10) ?? null };
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/** 겹치는 기간은 한 번만 센다. 끝이 없는 기간은 `at`까지다. */
export function mergedYears(periods: readonly RecordPeriod[], at: Date): number {
  const now = at.getUTCFullYear() * 12 + at.getUTCMonth();
  const ranges = periods
    .map((period) => [monthIndex(period.start), period.end ? monthIndex(period.end) : now] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((left, right) => left[0] - right[0]);
  let months = 0;
  let cursor = Number.NEGATIVE_INFINITY;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    months += end - Math.max(start, cursor);
    cursor = end;
  }
  return months / 12;
}

/** 연차 요건을 재는 기간. 재직 · 연구 같은 `experience` 범주의 기록만 경력으로 친다. */
export async function careerYearsOf(
  db: Db,
  records: readonly Pick<CareerRecordDoc, "categoryId" | "properties">[],
  at: Date,
  session?: ClientSession,
): Promise<number> {
  const categoryIds = [...new Set(records.map((record) => record.categoryId))];
  const categories = await mongoCollections(db).careerCategories
    .find({ _id: { $in: categoryIds }, key: "experience" }, session ? { session } : {})
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  const experience = new Set(categories.map((category) => category._id));
  return mergedYears(
    records.flatMap((record) => {
      if (!experience.has(record.categoryId)) return [];
      const period = recordPeriod(record);
      return period ? [period] : [];
    }),
    at,
  );
}
