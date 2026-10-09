"use client";

import type {
  GetJobChatSessionResponse,
  JobChatMessage,
} from "@expresso/contracts";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { loadJobChat, sendJobChat } from "./actions";

type ChatData = GetJobChatSessionResponse["data"];

type RetryQuestion = {
  requestId: string;
  content: string;
};

function mergeMessages(
  current: JobChatMessage[],
  incoming: JobChatMessage[],
): JobChatMessage[] {
  const byId = new Map(
    current.map((message) => [message.id, message]),
  );

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

export default function JobChat({
  initialData,
}: {
  initialData: ChatData;
}) {
  const sessionId = initialData.session.id;

  const [messages, setMessages] = useState(initialData.messages);
  const [generation, setGeneration] = useState(
    initialData.generation,
  );
  const [nextBeforeSequence, setNextBeforeSequence] = useState(
    initialData.nextBeforeSequence,
  );

  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryQuestion, setRetryQuestion] =
    useState<RetryQuestion | null>(null);

  // state가 갱신되기 전의 연속 클릭도 방지합니다.
  const sendingRef = useRef(false);
  const loadingRef = useRef(false);

  const generating = generation.status === "generating";

  // DB에 저장된 실패 질문에서 재시도 내용을 복원합니다.
  const failedMessage =
    generation.status === "failed"
      ? messages.find(
          (message) =>
            message.role === "user" &&
            message.requestId === generation.requestId,
        )
      : undefined;

  const retryTarget =
    failedMessage
      ? {
          requestId: failedMessage.requestId,
          content: failedMessage.content,
        }
      : retryQuestion;

  async function refreshChat() {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const result = await loadJobChat(sessionId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages((current) =>
        mergeMessages(current, result.data.messages),
      );
      setGeneration(result.data.generation);

      // 이미 이전 메시지를 읽었다면 페이지 위치를 유지합니다.
      setNextBeforeSequence((current) =>
        current === null
          ? null
          : Math.min(
              current,
              result.data.nextBeforeSequence ?? current,
            ),
      );

      setError("");

      if (result.data.generation.status === "completed") {
        setRetryQuestion(null);
      }
    } catch {
      setError("대화를 불러오지 못했습니다.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }
// 다른 탭이나 새로고침 전에 시작된 답변의 완료를 확인합니다.
  useEffect(() => {
    if (generation.status !== "generating") return;

    let cancelled = false;
    let running = false;

    const timer = window.setInterval(async () => {
      if (running || sendingRef.current) return;
      running = true;

      try {
        const result = await loadJobChat(sessionId);

        if (cancelled) return;

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessages((current) =>
          mergeMessages(current, result.data.messages),
        );
        setGeneration(result.data.generation);

        if (result.data.generation.status === "completed") {
          setRetryQuestion(null);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("대화 상태를 확인하지 못했습니다.");
        }
      } finally {
        running = false;
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [generation.status, sessionId]);

  async function submitQuestion(question: RetryQuestion) {
    if (sendingRef.current || generating || loading) return;

    sendingRef.current = true;
    setPending(true);
    setError("");
    setRetryQuestion(question);

    try {
      const result = await sendJobChat({
        sessionId,
        requestId: question.requestId,
        content: question.content,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages((current) =>
        mergeMessages(current, [
          result.data.userMessage,
          result.data.assistantMessage,
        ]),
      );

      setGeneration({
        status: "completed",
        requestId: question.requestId,
      });

      setRetryQuestion(null);
      setInput("");
    } catch {
      setError(
        "요청에 실패했습니다. 대화를 다시 불러온 뒤 재시도해 주세요.",
      );
    } finally {
      sendingRef.current = false;
      setPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();

    if (
      !content ||
      retryTarget ||
      pending ||
      generating ||
      loading
    ) {
      return;
    }

    await submitQuestion({
      requestId: crypto.randomUUID(),
      content,
    });
  }

  async function loadOlderMessages() {
    if (
      nextBeforeSequence === null ||
      loadingRef.current ||
      sendingRef.current
    ) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    try {
      const result = await loadJobChat(
        sessionId,
        nextBeforeSequence,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages((current) =>
        mergeMessages(current, result.data.messages),
      );
      setNextBeforeSequence(result.data.nextBeforeSequence);
      setError("");
    } catch {
      setError("이전 메시지를 불러오지 못했습니다.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <section>
      <p>
        선택한 공고를 참고해 답변합니다.
        질문과 답변은 대화방에 저장됩니다.
      </p>

      <button
        type="button"
        onClick={() => void refreshChat()}
        disabled={pending || loading}
      >
        {loading ? "불러오는 중…" : "대화 다시 불러오기"}
      </button>

      {nextBeforeSequence !== null && (
        <button
          type="button"
          onClick={() => void loadOlderMessages()}
          disabled={pending || loading}
          style={{ marginLeft: 8 }}
        >
          이전 메시지 보기
        </button>
      )}

      <div aria-live="polite" style={{ marginTop: 16 }}>
        {messages.map((message) => (
          <article
            key={message.id}
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

      {(pending || generating) && (
        <p role="status">답변을 생성하고 있습니다…</p>
      )}

      {error && <p role="alert">{error}</p>}

      {retryTarget && !pending && !generating && (
        <div>
          <p>이전 질문의 답변을 다시 요청할 수 있습니다.</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void submitQuestion(retryTarget)}
          >
            같은 질문 재시도
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <label htmlFor="job-chat-input">
          공고에 대해 질문하기
        </label>

        <textarea
          id="job-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={4000}
          rows={4}
          disabled={
            pending || generating || loading || Boolean(retryTarget)
          }
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
          }}
        />

        <button
          type="submit"
          disabled={
            pending ||
            generating ||
            loading ||
            Boolean(retryTarget) ||
            !input.trim()
          }
        >
          {pending ? "답변 생성 중…" : "보내기"}
        </button>
      </form>
    </section>
  );
}