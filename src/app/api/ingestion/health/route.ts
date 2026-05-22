import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { getIngestionHealthSnapshot } from "@/lib/ingestion/health";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/ingestion/health
 *
 * Returns the current in-process ingestion health snapshot including:
 * - Pipeline success rate, replay success rate, duplicate detection rate
 * - Dead-letter queue depth, fingerprint collision count
 * - Active anomaly entries with severity classification
 * - Overall severity level (info | warning | critical)
 *
 * Requires authenticated session. Intended for operational dashboards
 * and governance monitoring consumers.
 */
export async function GET() {
  enforceServerSecretPolicy();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logAuditEvent({
      event: "ingestion_health_denied",
      route: "/api/ingestion/health",
      reason: "unauthenticated",
    });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = getIngestionHealthSnapshot();

  return NextResponse.json(snapshot, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Ingestion-Severity": snapshot.overall_severity,
    },
  });
}
