import { describe, expect, it } from "vitest";
import {
  buildCsvReport,
  buildPdfReport,
  parseExportFormat,
  parseExportPeriod,
  resolvePeriodRange,
} from "@/lib/reports/export";

describe("report export helpers", () => {
  it("parses supported export format values", () => {
    expect(parseExportFormat("csv")).toBe("csv");
    expect(parseExportFormat("pdf")).toBe("pdf");
    expect(parseExportFormat("xlsx")).toBeNull();
  });

  it("defaults unknown period to this", () => {
    expect(parseExportPeriod("last")).toBe("last");
    expect(parseExportPeriod("month")).toBe("month");
    expect(parseExportPeriod("other")).toBe("this");
  });

  it("builds csv report rows with fixed headers", () => {
    const csv = buildCsvReport([
      {
        id: "tx-1",
        date: "2026-05-22T10:00:00.000Z",
        merchant: "Cafe, Nero",
        amount: 120,
        source: "card",
        category: "Food",
        ai_classification: "wise",
        ai_review_state: "accepted",
        reference: "REF123",
      },
    ]);

    expect(csv).toContain("date,merchant,amount,source,category,classification,review_state,reference");
    expect(csv).toContain('"Cafe, Nero"');
    expect(csv).toContain("120.00");
  });

  it("builds a valid PDF header", () => {
    const bytes = buildPdfReport([
      {
        id: "tx-1",
        date: "2026-05-22T10:00:00.000Z",
        merchant: "Cafe Nero",
        amount: 120,
        source: "card",
        category: "Food",
        ai_classification: "wise",
        ai_review_state: "accepted",
        reference: "REF123",
      },
    ], "this");

    const header = new TextDecoder().decode(bytes.slice(0, 8));
    expect(header.startsWith("%PDF")).toBe(true);
  });

  it("resolves deterministic period ranges", () => {
    const now = new Date("2026-05-23T00:00:00.000Z");
    const thisRange = resolvePeriodRange("this", now);
    const lastRange = resolvePeriodRange("last", now);
    const monthRange = resolvePeriodRange("month", now);

    expect(thisRange.end.getTime()).toBe(now.getTime());
    expect(lastRange.end.getTime()).toBeLessThan(thisRange.end.getTime());
    expect(monthRange.start.toISOString().startsWith("2026-05")).toBe(true);
  });
});