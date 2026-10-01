"use server";

import { z } from "zod";

import { request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";

const MessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const InputSchema = z.strictObject({
  jobPostingId: z.uuid(),
  messages: z.array(MessageSchema).min(1).max(20),
});

const ResponseSchema = z.strictObject({
  data: z.strictObject({
    jobPostingId: z.uuid(),
    answer: z.string().min(1).max(12000),
  }),
});

export type ChatMessage = z.infer<typeof MessageSchema>;

export async function sendJobChat(input: {
  jobPostingId: string;
  messages: ChatMessage[];
}): Promise<
  | { ok: true; answer: string }
  | { ok: false; error: string }
> {
  const parsed = InputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "입력 내용을 확인해 주세요.",
    };
  }

  const session = await requireSession();

  try {
    const result = await request(
      "/v1/job-chat/messages",
      ResponseSchema,
      {
        method: "POST",
        accessToken: session.accessToken,
        body: parsed.data,
      },
    );

    return {
      ok: true,
      answer: result.data.answer,
    };
  } catch {
    return {
      ok: false,
      error:
        "AI 응답을 가져오지 못했습니다. 서버와 AI 설정을 확인해 주세요.",
    };
  }
}