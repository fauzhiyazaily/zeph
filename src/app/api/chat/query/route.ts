import { NextResponse } from "next/server";
import {
  type ChatHistoryTurn,
  runFinanceChatPipeline,
  type ChatContextBudget,
  type ChatContextGoal,
  type ChatContextTransaction,
} from "@/lib/chat/pipeline";
import { logAuditEvent } from "@/lib/audit";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ChatQueryBody = {
  question?: unknown;
  history?: unknown;
};

function sanitizeForLog(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{12,}\b/g, "[redacted-number]")
    .replace(/\b(?:sk|api|key|token|secret)[-_a-z0-9:=]{8,}\b/gi, "[redacted-secret]")
    .slice(0, 120);
}

function inferTopic(question: string) {
  const text = question.toLowerCase();
  if (text.includes("budget") || text.includes("limit")) {
    return "budget";
  }

  if (text.includes("goal") || text.includes("saving") || text.includes("save")) {
    return "goals";
  }

  if (text.includes("spend") || text.includes("spent") || text.includes("total")) {
    return "spend";
  }

  return "general";
}

function sanitizeResponseAnswer(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{12,}\b/g, "[redacted-number]")
    .replace(/\b(?:sk|api|key|token|secret)[-_a-z0-9:=]{8,}\b/gi, "[redacted-secret]")
    .slice(0, 600);
}

function parseQuestion(body: ChatQueryBody) {
  const raw = typeof body.question === "string" ? body.question : "";
  const question = raw.replace(/\s+/g, " ").trim();
  if (question.length < 3) {
    return {
      ok: false as const,
      error: "Question must be at least 3 characters.",
    };
  }

  if (question.length > 400) {
    return {
      ok: false as const,
      error: "Question must be 400 characters or less.",
    };
  }

  return {
    ok: true as const,
    question,
  };
}

function parseHistory(body: ChatQueryBody) {
  if (body.history === undefined) {
    return {
      ok: true as const,
      history: [] as ChatHistoryTurn[],
    };
  }

  if (!Array.isArray(body.history)) {
    return {
      ok: false as const,
      error: "History must be an array of turns.",
    };
  }

  const normalized: ChatHistoryTurn[] = [];
  for (const turn of body.history) {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) {
      return {
        ok: false as const,
        error: "History contains an invalid turn.",
      };
    }

    const role = (turn as { role?: unknown }).role;
    const content = (turn as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return {
        ok: false as const,
        error: "History contains an invalid turn.",
      };
    }

    const cleanContent = content.replace(/\s+/g, " ").trim();
    if (!cleanContent) {
      continue;
    }

    normalized.push({
      role,
      content: cleanContent.slice(0, 400),
    });
  }

  return {
    ok: true as const,
    history: normalized.slice(-10),
  };
}

export async function POST(request: Request) {
  enforceServerSecretPolicy();

  const body = (await request.json().catch(() => null)) as ChatQueryBody | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    logAuditEvent({
      event: "chat_query_rejected",
      route: "/api/chat/query",
      reason: "invalid_payload",
    });
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const parsedQuestion = parseQuestion(body);
  if (!parsedQuestion.ok) {
    logAuditEvent({
      event: "chat_query_rejected",
      route: "/api/chat/query",
      reason: "invalid_question",
      metadata: {
        length: typeof body.question === "string" ? body.question.length : 0,
      },
    });
    return NextResponse.json({ error: parsedQuestion.error }, { status: 400 });
  }

  const parsedHistory = parseHistory(body);
  if (!parsedHistory.ok) {
    logAuditEvent({
      event: "chat_query_rejected",
      route: "/api/chat/query",
      reason: "invalid_history",
    });
    return NextResponse.json({ error: parsedHistory.error }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logAuditEvent({
      event: "chat_query_rejected",
      route: "/api/chat/query",
      reason: "unauthenticated",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: transactionsData, error: transactionsError } = await supabase
    .from("transactions")
    .select("id,date,merchant,amount,category,source,ai_classification")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(200)
    .returns<ChatContextTransaction[]>();

  const { data: budgetsData, error: budgetsError } = await supabase
    .from("budgets")
    .select("id,category,amount_limit,month")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(60)
    .returns<ChatContextBudget[]>();

  const { data: goalsData, error: goalsError } = await supabase
    .from("goals")
    .select("id,target_amount,current_amount,deadline,archived_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(60)
    .returns<ChatContextGoal[]>();

  if (transactionsError || budgetsError || goalsError) {
    logAuditEvent({
      event: "chat_query_failed",
      userId: user.id,
      route: "/api/chat/query",
      reason: "context_load_failed",
    });
    return NextResponse.json(
      {
        error: "Could not load your transaction context. Please retry.",
        retryGuidance: "Retry shortly. If this keeps happening, ask a simpler question to continue.",
      },
      { status: 503 },
    );
  }

  const scopedTransactions = transactionsData ?? [];
  const scopedBudgets = budgetsData ?? [];
  const scopedGoals = goalsData ?? [];

  try {
    const result = await runFinanceChatPipeline({
      question: parsedQuestion.question,
      history: parsedHistory.history,
      transactions: scopedTransactions,
      budgets: scopedBudgets,
      goals: scopedGoals,
    });

    const safeAnswer = sanitizeResponseAnswer(result.answer);

    logAuditEvent({
      event: "chat_query_completed",
      userId: user.id,
      route: "/api/chat/query",
      metadata: {
        provider: result.provider,
        topic: inferTopic(parsedQuestion.question),
        questionLength: parsedQuestion.question.length,
        questionPreview: sanitizeForLog(parsedQuestion.question),
        historyTurnCount: parsedHistory.history.length,
        transactionCount: result.context.transactionCount,
        budgetCount: result.context.budget.budgetCount,
        goalCount: result.context.goals.totalGoals,
      },
    });

    return NextResponse.json({
      status: "success",
      answer: safeAnswer,
      provider: result.provider,
      context: result.context,
    });
  } catch (error) {
    const reason = error instanceof Error ? sanitizeForLog(error.message || error.name) : "pipeline_exception";
    logAuditEvent({
      event: "chat_query_failed",
      userId: user.id,
      route: "/api/chat/query",
      reason,
      metadata: {
        topic: inferTopic(parsedQuestion.question),
      },
    });

    return NextResponse.json(
      {
        error: "The chat assistant is temporarily unavailable. Please retry.",
        retryGuidance:
          "Please retry in a few seconds. You can also rephrase your follow-up with more detail.",
      },
      { status: 503 },
    );
  }
}
