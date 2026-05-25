import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import {
  buildCsvReport,
  buildPdfReport,
  parseExportFormat,
  parseExportPeriod,
  resolvePeriodRange,
} from "@/lib/reports/export";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  enforceServerSecretPolicy();

  const url = new URL(request.url);
  const format = parseExportFormat(url.searchParams.get("format"));
  if (!format) {
    return Response.json(
      { error: "Export format must be csv or pdf." },
      { status: 400 },
    );
  }

  const period = parseExportPeriod(url.searchParams.get("period"));
  const range = resolvePeriodRange(period);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("id,date,merchant,amount,source,category,ai_classification,ai_review_state,reference")
    .eq("user_id", user.id)
    .gte("date", range.start.toISOString())
    .lt("date", range.end.toISOString())
    .order("date", { ascending: false });

  if (error) {
    return Response.json(
      { error: "Could not generate export right now. Please retry in a moment." },
      { status: 503 },
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return Response.json(
      { error: "No transactions found for the selected period. Adjust the period and retry." },
      { status: 404 },
    );
  }

  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  if (format === "csv") {
    const csv = buildCsvReport(rows);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"zeph-report-${period}-${dateTag}.csv\"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdfBytes = buildPdfReport(rows, period);
  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"zeph-report-${period}-${dateTag}.pdf\"`,
      "Cache-Control": "no-store",
    },
  });
}