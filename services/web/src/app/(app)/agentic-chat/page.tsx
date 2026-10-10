import { randomUUID } from "node:crypto";

import { GetJobChatSessionResponseSchema } from "@expresso/contracts";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ApiError, request } from "@/lib/api/client";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { createJobChatSession } from "./actions";
import JobChat from "./JobChat";
import CareerMatch from "./CareerMatch";

export default async function AgenticChatPage({
  searchParams,
}: {
  searchParams: Promise<{
    jobPostingId?: string | string[];
    sessionId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const authSession = await requireSession();

  let initialData:
    | z.infer<typeof GetJobChatSessionResponseSchema>["data"]
    | null = null;

  let jobPostingId: string;

  if (query.sessionId !== undefined) {
    const parsed = z.uuid().safeParse(query.sessionId);

    if (!parsed.success) {
      notFound();
    }

    try {
      const result = await request(
        `/v1/job-chat/sessions/${parsed.data}`,
        GetJobChatSessionResponseSchema,
        {
          accessToken: authSession.accessToken,
          query: { limit: 100 },
          cache: "no-store",
        },
      );

      initialData = result.data;
      jobPostingId = result.data.session.jobPostingId;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }

      throw error;
    }
  } else {
    const parsed = z.uuid().safeParse(query.jobPostingId);

    if (!parsed.success) {
      notFound();
    }

    jobPostingId = parsed.data;
  }

  const { data: job } = await jobs
    .posting(authSession.accessToken, jobPostingId)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }

      throw error;
    });

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

      {initialData ? (
        <div key={initialData.session.id}>
          <JobChat
            initialData={initialData}
          />

          <CareerMatch
            sessionId={initialData.session.id}
          />
        </div>
      ) : (
        <section>
          <p>
            대화를 시작하면 질문과 답변이 저장되어
            새로고침 후에도 이어서 대화할 수 있습니다.
          </p>

          <form action={createJobChatSession}>
            <input
              type="hidden"
              name="jobPostingId"
              value={jobPostingId}
            />
            <input
              type="hidden"
              name="requestId"
              value={randomUUID()}
            />
            <button type="submit">대화 시작</button>
          </form>
        </section>
      )}
    </main>
  );
}