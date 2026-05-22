import { monthBoundsFromKey } from "@/lib/budgets/alert-guidance";
import { currentMonthKey } from "@/lib/budgets/budget-helpers";
import { periodBounds } from "@/lib/insights/category-breakdown";

export type ExportFormat = "csv" | "pdf";
export type ExportPeriod = "this" | "last" | "month";

export type ReportTransactionRow = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  source: string;
  category: string | null;
  ai_classification: "wise" | "useless" | null;
  ai_review_state: "pending" | "accepted" | "overridden";
  reference: string | null;
};

export function parseExportFormat(input: string | null): ExportFormat | null {
  if (input === "csv" || input === "pdf") {
    return input;
  }
  return null;
}

export function parseExportPeriod(input: string | null): ExportPeriod {
  if (input === "last" || input === "month") {
    return input;
  }
  return "this";
}

export function resolvePeriodRange(period: ExportPeriod, now = new Date()) {
  if (period === "month") {
    return monthBoundsFromKey(currentMonthKey(now));
  }

  if (period === "last") {
    return periodBounds(7, now, 7);
  }

  return periodBounds(7, now, 0);
}

function csvEscape(value: string) {
  const normalized = value.replace(/\r?\n/g, " ");
  if (/[",]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function buildCsvReport(rows: ReportTransactionRow[]) {
  const header = [
    "date",
    "merchant",
    "amount",
    "source",
    "category",
    "classification",
    "review_state",
    "reference",
  ].join(",");

  const lines = rows.map((row) => {
    const cells = [
      new Date(row.date).toISOString(),
      row.merchant,
      Number(row.amount).toFixed(2),
      row.source,
      row.category ?? "",
      row.ai_classification ?? "pending",
      row.ai_review_state,
      row.reference ?? "",
    ].map((value) => csvEscape(value));

    return cells.join(",");
  });

  return `${header}\n${lines.join("\n")}`;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildPdfReport(rows: ReportTransactionRow[], period: ExportPeriod) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const lines: string[] = [
    `Zeph spending report (${period})`,
    `Generated at: ${new Date().toISOString()}`,
    `Transactions: ${rows.length}`,
    `Total spend: INR ${total.toFixed(2)}`,
    "",
    "Date | Merchant | Amount | Category | Source",
  ];

  rows.slice(0, 28).forEach((row) => {
    lines.push(
      `${new Date(row.date).toISOString().slice(0, 10)} | ${row.merchant.slice(0, 28)} | INR ${Number(row.amount).toFixed(2)} | ${(row.category ?? "Uncategorized").slice(0, 16)} | ${row.source.toUpperCase()}`,
    );
  });

  if (rows.length > 28) {
    lines.push(`... ${rows.length - 28} additional transactions omitted in PDF summary.`);
  }

  const contentStream = [
    "BT",
    "/F1 10 Tf",
    "50 800 Td",
    ...lines.flatMap((line, index) => {
      const escaped = escapePdfText(line);
      if (index === 0) {
        return [`(${escaped}) Tj`];
      }
      return ["0 -14 Td", `(${escaped}) Tj`];
    }),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += obj;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}