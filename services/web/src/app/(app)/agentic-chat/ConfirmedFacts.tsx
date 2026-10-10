"use client";

import type {
  ChatFact,
  JobChatMessage,
} from "@expresso/contracts";

import { useEffect, useRef, useState } from "react";

import {
  approveChatFact,
  createChatFact,
  loadChatFacts,
  loadFactCategories,
  rejectChatFact,
} from "./fact-actions";

type Category = {
  id: string;
  name: string;
};

function FactCard({
  fact,
  categories,
  disabled,
  onApprove,
  onReject,
}: {
  fact: ChatFact;
  categories: Category[];
  disabled: boolean;
  onApprove: (input: {
    categoryId: string;
    title: string;
    bodyMd: string;
  }) => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [title, setTitle] = useState(fact.title);
  const [bodyMd, setBodyMd] = useState(fact.bodyMd);
  const [categoryId, setCategoryId] = useState("");

  return (
    <article
      style={{
        padding: 16,
        marginTop: 16,
        border: "1px solid #ddd",
        borderRadius: 8,
      }}
    >
      <h3>{fact.title}</h3>

      <p>
        상태:{" "}
        {fact.status === "pending"
          ? "승인 대기"
          : fact.status === "approved"
            ? "승인 완료"
            : "거절"}
      </p>

      <details>
        <summary>사용자 발언 근거 확인</summary>

        {fact.sources.map((source) => (
          <blockquote
            key={source.messageId}
            style={{ whiteSpace: "pre-wrap" }}
          >
            {source.quote}
          </blockquote>
        ))}
      </details>

      {fact.status === "pending" ? (
        <>
          <p>
            사실과 다른 내용을 수정하세요.
            승인 전에는 경력에 저장되지 않습니다.
          </p>

          <label>
            저장할 카테고리
            <select
              value={categoryId}
              disabled={disabled}
              onChange={(event) =>
                setCategoryId(event.target.value)
              }
            >
              <option value="">카테고리 선택</option>

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", marginTop: 8 }}>
            제목
            <input
              value={title}
              maxLength={300}
              disabled={disabled}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <label style={{ display: "block", marginTop: 8 }}>
            경력 내용
            <textarea
              value={bodyMd}
              maxLength={20000}
              rows={8}
              disabled={disabled}
              onChange={(event) =>
                setBodyMd(event.target.value)
              }
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <button
            type="button"
            disabled={
              disabled ||
              !categoryId ||
              !title.trim() ||
              !bodyMd.trim()
            }
            onClick={() =>
              void onApprove({
                categoryId,
                title,
                bodyMd,
              })
            }
          >
            승인하고 경력에 저장
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => void onReject()}
            style={{ marginLeft: 8 }}
          >
            거절
          </button>
        </>
      ) : (
        <>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {fact.approvedBodyMd ?? fact.bodyMd}
          </p>

          {fact.recordId && (
            <p>내 커리어에 새 기록으로 저장되었습니다.</p>
          )}
        </>
      )}
    </article>
  );
}

export default function ConfirmedFacts({
  sessionId,
  messages,
  disabled = false,
}: {
  sessionId: string;
  messages: Array<
    Pick<JobChatMessage, "id" | "role" | "content">
  >;
  disabled?: boolean;
}) {
  const [facts, setFacts] = useState<ChatFact[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const workingRef = useRef(false);

  // 응답이 끊겨도 같은 선택에는 같은 requestId로 재시도
  const createRequestRef = useRef<{
    signature: string;
    requestId: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [factResult, categoryResult] =
          await Promise.all([
            loadChatFacts(sessionId),
            loadFactCategories(),
          ]);

        if (cancelled) return;

        if (factResult.ok) {
          setFacts(factResult.data);
        } else {
          setError(factResult.error);
        }

        if (categoryResult.ok) {
          setCategories(categoryResult.data);
        } else {
          setError(categoryResult.error);
        }
      } catch {
        if (!cancelled) {
          setError("경력 후보를 불러오지 못했습니다.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const userMessages = messages.filter(
    (message) =>
      message.role === "user" &&
      message.content !==
        "내 경력에서 보완할 경험을 질문해줘.",
  );

  const blocked = disabled || pending;

  function updateFact(fact: ChatFact) {
    setFacts((current) => [
      fact,
      ...current.filter((item) => item.id !== fact.id),
    ]);
  }

  async function run(task: () => Promise<void>) {
    if (workingRef.current || disabled) return;

    workingRef.current = true;
    setPending(true);
    setError("");
    setNotice("");

    try {
      await task();
    } catch {
      setError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      workingRef.current = false;
      setPending(false);
    }
  }

  async function create() {
    await run(async () => {
      const ids = [...selected].sort();

      if (ids.length === 0 || ids.length > 10) {
        setError("답변을 1~10개 선택하세요.");
        return;
      }

      const signature = JSON.stringify(ids);

      if (
        createRequestRef.current?.signature !== signature
      ) {
        createRequestRef.current = {
          signature,
          requestId: crypto.randomUUID(),
        };
      }

      const result = await createChatFact({
        sessionId,
        requestId: createRequestRef.current.requestId,
        messageIds: ids,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      updateFact(result.data);
      setSelected([]);
      createRequestRef.current = null;
      setNotice("경력 초안을 만들었습니다. 내용을 검토하세요.");
    });
  }

  async function reload() {
    await run(async () => {
      const result = await loadChatFacts(sessionId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setFacts(result.data);
    });
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>경력 사실 확인</h2>

      <p>
        같은 경험에 관한 답변을 선택하세요.
        사용자 승인을 거친 내용만 경력에 반영합니다.
      </p>

      {userMessages.map((message) => (
        <label
          key={message.id}
          style={{ display: "block", marginBottom: 12 }}
        >
          <input
            type="checkbox"
            checked={selected.includes(message.id)}
            disabled={
              blocked ||
              (
                selected.length >= 10 &&
                !selected.includes(message.id)
              )
            }
            onChange={(event) =>
              setSelected((current) =>
                event.target.checked
                  ? [...current, message.id]
                  : current.filter(
                      (id) => id !== message.id,
                    ),
              )
            }
          />

          <span style={{ whiteSpace: "pre-wrap" }}>
            {" "}{message.content}
          </span>
        </label>
      ))}

      <button
        type="button"
        disabled={blocked || selected.length === 0}
        onClick={() => void create()}
      >
        선택한 답변으로 경력 초안 만들기
      </button>

      <button
        type="button"
        disabled={blocked}
        onClick={() => void reload()}
        style={{ marginLeft: 8 }}
      >
        후보 목록 다시 불러오기
      </button>

      {pending && <p role="status">처리 중…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {facts.map((fact) => (
        <FactCard
          key={fact.id}
          fact={fact}
          categories={categories}
          disabled={blocked}
          onApprove={(input) =>
            run(async () => {
              const result = await approveChatFact({
                sessionId,
                factId: fact.id,
                ...input,
              });

              if (!result.ok) {
                setError(result.error);
                return;
              }

              updateFact(result.data);
              setNotice("승인한 내용을 내 경력에 저장했습니다.");
            })
          }
          onReject={() =>
            run(async () => {
              const result = await rejectChatFact(
                sessionId,
                fact.id,
              );

              if (!result.ok) {
                setError(result.error);
                return;
              }

              updateFact(result.data);
              setNotice("거절했습니다. 경력에 저장하지 않았습니다.");
            })
          }
        />
      ))}
    </section>
  );
}