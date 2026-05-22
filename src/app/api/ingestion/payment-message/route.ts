import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { classifyTransaction } from "@/lib/ai/classification";
import { logAuditEvent } from "@/lib/audit";
import { hasMessageReadingConsent } from "@/lib/consent";
import { writeIngestionAuditLog } from "@/lib/ingestion/audit-log";
import { writeFailedIngestionRecord } from "@/lib/ingestion/dead-letter";
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
  const seed = requestId
    ? `${userId}:${requestId}:${message}:${receivedAt ?? ""}`
    : `${userId}:${message}:${receivedAt ?? ""}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

export async function POST(request: Request) {
  enforceServerSecretPolicy();
  const startedAt = Date.now();

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

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
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

  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json(
      {
        status: "rejected",
        ingestionId: "unknown",
        error: {
          code: "INVALID_PAYLOAD",
          message: "Request body must include a non-empty string message.",
          retryable: false,
        },
      } satisfies IngestionResponse,
      { status: 400 },
    );
  }

  const ingestionId = buildIngestionId(user.id, message, receivedAt, messageId ?? requestIdHeader);

  const existing = recentResponses.get(ingestionId);
  if (existing) {
    const deduplicatedStatus = existing.status === "accepted"
      ? 202
      : existing.error?.retryable
        ? 503
        : 422;

    return NextResponse.json(
      { ...existing, deduplicated: true } satisfies IngestionResponse,
      { status: deduplicatedStatus },
    );
  }

  let parsed: ReturnType<typeof parsePaymentMessage>;
  try {
    parsed = parsePaymentMessage({ message, receivedAt, sourceHint });
  } catch {
    const rejected: IngestionResponse = {
      status: "rejected",
      ingestionId,
      error: {
        code: "PARSE_EXCEPTION",
        message: "Failed to parse payment message.",
        retryable: true,
      },
    };

    logAuditEvent({
      event: "ingestion_parse_failed",
      userId: user.id,
      route: "/api/ingestion/payment-message",
      reason: "parser_exception",
      metadata: {
        ingestionId,
        retryable: true,
      },
    });

    if (!rejected.error?.retryable) {
      rememberResponse(ingestionId, rejected);
    }

    await writeIngestionAuditLog(supabase, {
      ingestion_batch_id: `payment-message:${ingestionId}`,
      source_type: "sms",
      source_version: "1.0.0",
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
      processing_duration_ms: Date.now() - startedAt,
    }).catch(() => null);

    await writeFailedIngestionRecord(supabase, {
      user_id: user.id,
      ingestion_batch_id: `payment-message:${ingestionId}`,
      source_type: "sms",
      source_version: "1.0.0",
      reason: "Parser threw an unexpected error.",
      retryable: true,
      route: "/api/ingestion/payment-message",
      payload: {
        message,
        receivedAt,
        sourceHint,
      },
    }).catch(() => null);

    return NextResponse.json(rejected, { status: 503 });
  }

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

    if (!rejected.error?.retryable) {
      rememberResponse(ingestionId, rejected);
    }

    await writeIngestionAuditLog(supabase, {
      ingestion_batch_id: `payment-message:${ingestionId}`,
      source_type: "sms",
      source_version: "1.0.0",
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
      processing_duration_ms: Date.now() - startedAt,
    }).catch(() => null);

    await writeFailedIngestionRecord(supabase, {
      user_id: user.id,
      ingestion_batch_id: `payment-message:${ingestionId}`,
      source_type: "sms",
      source_version: "1.0.0",
      reason: parsed.reason,
      retryable: parsed.retryable,
      route: "/api/ingestion/payment-message",
      payload: {
        message,
        receivedAt,
        sourceHint,
      },
    }).catch(() => null);

    return NextResponse.json(rejected, {
      status: parsed.retryable ? 503 : 422,
    });
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

  let persistence: Awaited<ReturnType<typeof persistTransaction>>;
  try {
    persistence = await persistTransaction(supabase, {
      userId: user.id,
      ingestionId,
      parsed: parsed.data,
    });
  } catch {
    const rejected: IngestionResponse = {
      status: "rejected",
      ingestionId,
      error: {
        code: "PERSIST_EXCEPTION",
        message: "Failed to persist transaction metadata.",
        retryable: true,
      },
    };

    logAuditEvent({
      event: "ingestion_persist_failed",
      userId: user.id,
      route: "/api/ingestion/payment-message",
      reason: "persist_exception",
      metadata: {
        ingestionId,
        code: "PERSIST_EXCEPTION",
        retryable: true,
      },
    });

    if (!rejected.error?.retryable) {
      rememberResponse(ingestionId, rejected);
    }

    await writeIngestionAuditLog(supabase, {
      ingestion_batch_id: parsed.data.ingestion_batch_id,
      source_type: parsed.data.source_type,
      source_version: parsed.data.source_version,
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
      processing_duration_ms: Date.now() - startedAt,
    }).catch(() => null);

    await writeFailedIngestionRecord(supabase, {
      user_id: user.id,
      ingestion_batch_id: parsed.data.ingestion_batch_id,
      source_type: parsed.data.source_type,
      source_version: parsed.data.source_version,
      reason: "Persist layer threw an unexpected error.",
      retryable: true,
      route: "/api/ingestion/payment-message",
      payload: {
        ingestionId,
        parsed: parsed.data,
      },
    }).catch(() => null);

    return NextResponse.json(rejected, { status: 503 });
  }

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

    if (!rejected.error?.retryable) {
      rememberResponse(ingestionId, rejected);
    }

    await writeIngestionAuditLog(supabase, {
      ingestion_batch_id: parsed.data.ingestion_batch_id,
      source_type: parsed.data.source_type,
      source_version: parsed.data.source_version,
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
      processing_duration_ms: Date.now() - startedAt,
    }).catch(() => null);

    await writeFailedIngestionRecord(supabase, {
      user_id: user.id,
      ingestion_batch_id: parsed.data.ingestion_batch_id,
      source_type: parsed.data.source_type,
      source_version: parsed.data.source_version,
      reason: persistence.reason,
      retryable: persistence.retryable,
      route: "/api/ingestion/payment-message",
      payload: {
        ingestionId,
        parsed: parsed.data,
      },
    }).catch(() => null);

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

  if (!persistence.deduplicated) {
    let classification: Awaited<ReturnType<typeof classifyTransaction>>;
    try {
      classification = await classifyTransaction({
        merchant: persistence.transaction.merchant,
        amount: persistence.transaction.amount,
        source: persistence.transaction.source,
        reference: persistence.transaction.reference,
      });
    } catch {
      classification = {
        ok: false,
        reason: "Classification threw an unexpected error.",
        retryable: true,
      };
    }

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
  }

  rememberResponse(ingestionId, accepted);

  await writeIngestionAuditLog(supabase, {
    ingestion_batch_id: parsed.data.ingestion_batch_id,
    source_type: parsed.data.source_type,
    source_version: parsed.data.source_version,
    total_rows: 1,
    valid_rows: 1,
    invalid_rows: 0,
    duplicate_rows: persistence.deduplicated ? 1 : 0,
    processing_duration_ms: Date.now() - startedAt,
    linked_transaction_id: persistence.transaction.id,
  }).catch(() => null);

  return NextResponse.json(accepted, { status: 202 });
}
