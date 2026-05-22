"use client";

import { useReducer, useState } from "react";
import {
  initialChatSubmissionState,
  reduceChatSubmissionState,
} from "@/lib/chat/submission-state";

type ChatApiSuccess = {
  status: "success";
  answer: string;
  provider: "anthropic" | "heuristic";
  context: {
    transactionCount: number;
    totalSpend: number;
    topCategories: Array<{ category: string; amount: number }>;
  };
};

type ChatApiError = {
  error?: string;
  retryGuidance?: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export function ChatClient() {
  const [question, setQuestion] = useState("");
  const [state, dispatch] = useReducer(reduceChatSubmissionState, initialChatSubmissionState);
  const [meta, setMeta] = useState<ChatApiSuccess["context"] | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    dispatch({ type: "submit" });

    try {
      const response = await fetch("/api/chat/query", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          question,
          history: turns.slice(-8),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ChatApiError;
        dispatch({
          type: "fail",
          error: payload.error ?? "Request failed. Please retry.",
          retryGuidance:
            payload.retryGuidance ??
            "Retry in a few seconds, or ask a narrower follow-up question.",
        });
        return;
      }

      const payload = (await response.json()) as ChatApiSuccess;
      setMeta(payload.context);
      setTurns((current) => [
        ...current,
        { role: "user", content: question.trim() },
        { role: "assistant", content: payload.answer },
      ]);
      dispatch({ type: "succeed", answer: payload.answer });
      setQuestion("");
    } catch {
      dispatch({
        type: "fail",
        error: "Network error while submitting your question. Please retry.",
        retryGuidance:
          "Check your connection, then retry. If this persists, ask a shorter question first.",
      });
    }
  }

  return (
    <section className="glass-card rounded-2xl border border-slate-300/20 p-5 sm:p-6">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="text-sm font-semibold text-slate-200" htmlFor="chat-question-input">
          Ask a finance question
        </label>
        <textarea
          id="chat-question-input"
          name="question"
          className="min-h-[120px] w-full rounded-xl border border-slate-400/35 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400"
          placeholder="Example: How much did I spend on groceries this month?"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            if (state.status !== "idle") {
              dispatch({ type: "reset" });
            }
          }}
          maxLength={400}
          required
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{question.length}/400</p>
          <button
            type="submit"
            disabled={state.status === "pending" || question.trim().length < 3}
            className="inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.status === "pending" ? "Sending..." : "Submit question"}
          </button>
        </div>
      </form>

      <div className="mt-5 rounded-xl border border-slate-400/25 bg-slate-900/30 p-4">
        {state.status === "pending" ? (
          <p className="text-sm text-amber-200">Pending response: analyzing your recent transaction context.</p>
        ) : null}

        {state.status === "success" && state.answer ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-emerald-200">Success: response generated.</p>
            <p className="text-sm leading-6 text-slate-100">{state.answer}</p>
            {meta ? (
              <p className="text-xs text-slate-400">
                Context used: {meta.transactionCount} transactions, total spend {meta.totalSpend.toFixed(2)}.
              </p>
            ) : null}
          </div>
        ) : null}

        {state.status === "failure" && state.error ? (
          <div className="space-y-2">
            <p className="text-sm text-rose-200">Failure: {state.error}</p>
            {state.retryGuidance ? (
              <p className="text-xs text-rose-100/90">Retry guidance: {state.retryGuidance}</p>
            ) : null}
          </div>
        ) : null}

        {state.status === "idle" ? (
          <p className="text-sm text-slate-300">Submit a question to get a context-aware response.</p>
        ) : null}
      </div>
    </section>
  );
}
