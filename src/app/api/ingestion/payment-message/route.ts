import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { classifyTransaction } from "@/lib/ai/classification";
import { logAuditEvent } from "@/lib/audit";
import { hasMessageReadingConsent } from "@/lib/consent";
import { parsePaymentMessage, type ParsedTransaction } from "@/lib/ingestion/payment-message";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { persistTransaction } from "@/lib/transactions/persistence";

type IngestionResponse = {
  status: "accepted" | "rejected";
  ingestionId: string;
  deduplicated?: boolean;
  transactionId?: string;
  normalizedTransaction?: ParsedTransaction;
  aiClassification?: {
    label: "wise" | "useless";
    reason: string;
    provider: "anthropic" | "heuristic";
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

const recentResponses = new Map<string, IngestionResponse>();

function rememberResponse(ingestionId: string, response: IngestionResponse) {
  recentResponses.set(ingestionId, response);

  if (recentResponses.size > 200) {
    const oldestKey = recentResponses.keys().next().value;
    if (oldestKey) {
      recentResponses.delete(oldestKey);
    }
  }
}

function buildIngestionId(userId: string, message: string, receivedAt?: string, requestId?: string) {
  const seed = requestId ?? `${userId}:${message}:${receivedAt ?? ""}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

export async function POST(request: Request) {
  enforceServerSecretPolicy();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logAuditEvent({
      event: "ingestion_denied",
      route: "/api/ingestion/payment-message",
      reason: "unauthenticated",
    });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasMessageReadingConsent(user)) {
    logAuditEvent({
      event: "ingestion_denied",
      userId: user.id,
      route: "/api/ingestion/payment-message",
      reason: "message_reading_consent_missing",
    });

    return NextResponse.json(
      {
        error:
          "Payment message ingestion is blocked because consent is not enabled.",
      },
      { status: 403 },
    );
  }

  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      {
        status: "rejected",
        ingestionId: "unknown",
        error: {
          code: "INVALID_PAYLOAD",
          message: "Request body must be a valid JSON object.",
          retryable: false,
        },
      } satisfies IngestionResponse,
      { status: 400 },
    );
  }

  const body = payload as {
    message?: unknown;
    receivedAt?: unknown;
    sourceHint?: unknown;
    messageId?: unknown;
  };

  const message = typeof body.message === "string" ? body.message : "";
  const receivedAt = typeof body.receivedAt === "string" ? body.receivedAt : undefined;
  const sourceHint = typeof body.sourceHint === "string" ? body.sourceHint : undefined;
  const messageId = typeof body.messageId === "string" ? body.messageId : undefined;
  const requestIdHeader = request.headers.get("x-message-id") ?? undefined;

  const ingestionId = buildIngestionId(user.id, message, receivedAt, messageId ?? requestIdHeader);

  const existing = recentResponses.get(ingestionId);
  if (existing) {
    return NextResponse.json(
      { ...existing, deduplicated: true } satisfies IngestionResponse,
      { status: existing.status === "accepted" ? 202 : 422 },
    );
  }

  const parsed = parsePaymentMessage({ message, receivedAt, sourceHint });

  if (!parsed.ok) {
    const rejected: IngestionResponse = {
      status: "rejected",
      ingestionId,
      error: {
        code: "PARSE_FAILED",
        message: parsed.reason,
        retryable: parsed.retryable,
      },
    };

    logAuditEvent({
      event: "ingestion_parse_failed",
      userId: user.id,
      route: "/api/ingestion/payment-message",
      reason: parsed.reason,
      metadata: {
        ingestionId,
        retryable: parsed.retryable,
      },
    });

    rememberResponse(ingestionId, rejected);
    return NextResponse.json(rejected, { status: 422 });
  }

  logAuditEvent({
    event: "ingestion_parsed",
    userId: user.id,
    route: "/api/ingestion/payment-message",
    metadata: {
      ingestionId,
      source: parsed.data.source,
      amount: parsed.data.amount,
    },
  });

  const persistence = await persistTransaction(supabase, {
    userId: user.id,
    ingestionId,
    parsed: parsed.data,
  });

  if (!persistence.ok) {
    const rejected: IngestionResponse = {
      status: "rejected",
      ingestionId,
      error: {
        code: persistence.code,
        message: "Failed to persist transaction metadata.",
        retryable: persistence.retryable,
      },
    };

    logAuditEvent({
      event: "ingestion_persist_failed",
      userId: user.id,
      route: "/api/ingestion/payment-message",
      reason: persistence.reason,
      metadata: {
        ingestionId,
        code: persistence.code,
        retryable: persistence.retryable,
      },
    });

    rememberResponse(ingestionId, rejected);
    return NextResponse.json(rejected, {
      status: persistence.retryable ? 503 : 422,
    });
  }

  const accepted: IngestionResponse = {
    status: "accepted",
    ingestionId,
    deduplicated: persistence.deduplicated,
    transactionId: persistence.transaction.id,
    normalizedTransaction: parsed.data,
  };

  const classification = await classifyTransaction({
    merchant: persistence.transaction.merchant,
    amount: persistence.transaction.amount,
    source: persistence.transaction.source,
    reference: persistence.transaction.reference,
  });

  if (classification.ok) {
    const { error: classificationWriteError } = await supabase
      .from("transactions")
      .update({
        ai_classification: classification.label,
        ai_reason: classification.reason,
        ai_raw_classification: classification.label,
        ai_raw_reason: classification.reason,
        ai_user_classification: null,
        ai_user_reason: null,
        ai_review_state: "pending",
        ai_override_at: null,
      })
      .eq("id", persistence.transaction.id)
      .eq("user_id", user.id);

    if (classificationWriteError) {
      logAuditEvent({
        event: "classification_persist_failed",
        userId: user.id,
        route: "/api/ingestion/payment-message",
        reason: classificationWriteError.message,
        metadata: {
          ingestionId,
          transactionId: persistence.transaction.id,
        },
      });
    } else {
      accepted.aiClassification = {
        label: classification.label,
        reason: classification.reason,
        provider: classification.provider,
      };
    }
  } else {
    logAuditEvent({
      event: "classification_failed",
      userId: user.id,
      route: "/api/ingestion/payment-message",
      reason: classification.reason,
      metadata: {
        ingestionId,
        retryable: classification.retryable,
      },
    });
  }

  rememberResponse(ingestionId, accepted);

  return NextResponse.json(accepted, { status: 202 });
}
