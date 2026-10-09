import { notFound } from "next/navigation";
import { z } from "zod";

import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import JobChat from "./JobChat";

export default async function AgenticChatPage({
  searchParams,
}: {
  searchParams: Promise<{
    jobPostingId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const parsed = z.uuid().safeParse(query.jobPostingId);

  if (!parsed.success) {
    notFound();
  }

  const session = await requireSession();

  const { data: job } = await jobs.posting(
    session.accessToken,
    parsed.data,
  );

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1>Agentic Chat</h1>

      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          marginBottom: 24,
        }}
      >
        <small>연결된 채용공고</small>
        <h2>{job.title}</h2>

        <details>
          <summary>공고 원문 확인</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {job.descriptionRaw}
          </p>
        </details>
      </section>

      <JobChat key={parsed.data} jobPostingId={parsed.data} />
    </main>
  );
}