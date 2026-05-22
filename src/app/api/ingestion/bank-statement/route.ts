import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { importBankStatementForUser } from "@/lib/ingestion/bank-statements";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type UploadResponse = {
  status: "accepted" | "rejected";
  deduplicated?: boolean;
  document?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          status: "rejected",
          error: {
            code: "INVALID_CONTENT_TYPE",
            message: "Request must be multipart/form-data.",
            retryable: false,
          },
        } satisfies UploadResponse,
        { status: 400 },
      );
    }

    enforceServerSecretPolicy();

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logAuditEvent({
        event: "financial_document_upload_denied",
        route: "/api/ingestion/bank-statement",
        reason: "unauthenticated",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData().catch(() => null);
    const fileValue = formData?.get("statement");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        {
          status: "rejected",
          error: {
            code: "MISSING_FILE",
            message: "Attach a bank statement file before uploading.",
            retryable: false,
          },
        } satisfies UploadResponse,
        { status: 400 },
      );
    }

    const imported = await importBankStatementForUser(supabase, user.id, fileValue);
    if (!imported.ok) {
      logAuditEvent({
        event: "financial_document_upload_failed",
        userId: user.id,
        route: "/api/ingestion/bank-statement",
        reason: imported.code,
      });

      return NextResponse.json(
        {
          status: "rejected",
          error: {
            code: imported.code,
            message: imported.message,
            retryable: imported.retryable,
          },
        } satisfies UploadResponse,
        { status: imported.retryable ? 503 : 422 },
      );
    }

    return NextResponse.json(
      {
        status: "accepted",
        deduplicated: imported.deduplicated,
        document: imported.document,
      } satisfies UploadResponse,
      { status: imported.deduplicated ? 200 : 201 },
    );
  } catch (err) {
    console.error("[bank-statement] Unhandled error:", err);
    return NextResponse.json(
      {
        status: "rejected",
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again.",
          retryable: true,
        },
      } satisfies UploadResponse,
      { status: 500 },
    );
  }
}
