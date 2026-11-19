import Link from "next/link";
import { notFound } from "next/navigation";
import { UuidSchema } from "@expresso/contracts";
import { requireSession } from "@/lib/require-session";
import { jobs } from "@/lib/api/endpoints";
import { Results } from "./results";

export default async function Recommendations({
  searchParams,
}: {
  searchParams: Promise<{ posting?: string }>;
}) {
  const { posting } = await searchParams;
  if (posting !== undefined && !UuidSchema.safeParse(posting).success)
    notFound();
  const session = await requireSession();
  const access = await jobs
    .modelStatus(session.accessToken)
    .catch(() => ({ available: false, decisions: false }));
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Link href={posting ? `/jobs/${posting}` : "/jobs"}>
        ← {posting ? "공고 상세" : "공고 탐색"}
      </Link>
      <h1 className="text-2xl font-semibold">
        {posting ? "요건별 내 경력 근거" : "내 기록으로 공고 추천받기"}
      </h1>
      <p>
        {posting
          ? "공고 요건마다 근거로 쓸 수 있는 기록을 찾습니다."
          : "정리하거나 검증한 커리어 기록을 바탕으로 모집 중인 공고를 최대 10개 추천합니다."}
      </p>
      {access.available ? (
        <Results
          key={posting ?? "all"}
          posting={posting}
          decisions={access.decisions}
        />
      ) : (
        <p role="status">현재 추천 모델에 연결할 수 없습니다.</p>
      )}
    </main>
  );
}
