"use client";

import { useState, type FormEvent } from "react";

import { sendJobChat, type ChatMessage } from "./actions";

export default function JobChat({
  jobPostingId,
}: {
  jobPostingId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();
    if (!content || pending) return;

    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setPending(true);
    setError("");

    try {
      const result = await sendJobChat({
        jobPostingId,
        messages: next.slice(-20),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages([
        ...next,
        { role: "assistant", content: result.answer },
      ]);
      setInput("");
    } catch {
      setError("요청 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <p>
        선택한 공고를 참고해 답변합니다.
        예: “이 공고의 주요 업무와 필수 기술을 설명해줘.”
      </p>

      <div aria-live="polite">
        {messages.map((message, index) => (
          <article
            key={index}
            style={{
              padding: 16,
              marginBottom: 12,
              background:
                message.role === "user" ? "#eef2ff" : "#f5f5f5",
              borderRadius: 12,
            }}
          >
            <strong>
              {message.role === "user" ? "나" : "AI"}
            </strong>

            <p style={{ whiteSpace: "pre-wrap" }}>
              {message.content}
            </p>
          </article>
        ))}
      </div>

      {error && <p role="alert">{error}</p>}

      <form onSubmit={handleSubmit}>
        <label htmlFor="job-chat-input">
          공고에 대해 질문하기
        </label>

        <textarea
          id="job-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={4000}
          rows={4}
          disabled={pending}
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
          }}
        />

        <button
          type="submit"
          disabled={pending || !input.trim()}
        >
          {pending ? "답변 생성 중…" : "보내기"}
        </button>
      </form>
    </section>
  );
}