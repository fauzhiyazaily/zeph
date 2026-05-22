import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));

const classifyTransactionMock = vi.fn();
const persistTransactionMock = vi.fn();

vi.mock("@/lib/ai/classification", () => ({
  classifyTransaction: (...args: unknown[]) => classifyTransactionMock(...args),
}));

vi.mock("@/lib/transactions/persistence", () => ({
  persistTransaction: (...args: unknown[]) => persistTransactionMock(...args),
}));

import { analyzeBankStatement } from "@/lib/ai/bank-statement-analysis";
import { __test__ } from "@/lib/ingestion/bank-statements";
import type { ParsedBankStatement } from "@/lib/ingestion/bank-statement-types";

function buildWorkbookBuffer(rows: Array<Array<string | number>>) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("bank statement parsing", () => {
  it("parses workbook statements with debit and credit columns", () => {
    const buffer = buildWorkbookBuffer([
      ["Date", "Description", "Debit", "Credit", "Balance", "Reference"],
      ["01/05/2026", "Salary Credit ACME", "", "80000.00", "102000.00", "SAL-001"],
      ["03/05/2026", "Supermarket Purchase", "2500.50", "", "99500.50", "TXN-002"],
      ["05/05/2026", "Home Loan EMI", "18000.00", "", "81500.50", "TXN-003"],
    ]);

    const parsed = __test__.parseWorkbook(buffer);

    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[0]).toMatchObject({
      direction: "credit",
      amount: 80000,
      isSalary: true,
    });
    expect(parsed.transactions[1]).toMatchObject({
      direction: "debit",
      category: "Groceries",
    });
    expect(parsed.transactions[2]).toMatchObject({
      direction: "debit",
      isEmi: true,
      category: "EMI",
    });
  });

  it("parses workbook rows that use excel serial dates and amount-sign direction hints", () => {
    const buffer = buildWorkbookBuffer([
      ["Txn Date", "Narration", "Amount", "Avail Bal", "Chq/Ref No"],
      [46052, "Salary credited from ACME payroll", "45000", "84500", "SAL-991"],
      [46055, "Fuel withdrawal", "-3200", "81300", "TXN-551"],
    ]);

    const parsed = __test__.parseWorkbook(buffer);

    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toMatchObject({
      direction: "credit",
      amount: 45000,
      isSalary: true,
    });
    expect(parsed.transactions[1]).toMatchObject({
      direction: "debit",
      amount: 3200,
      category: "Transport",
    });
    expect(Number.isNaN(new Date(parsed.transactions[0]?.postedAt ?? "").getTime())).toBe(false);
  });

  it("parses PDF-like statement text lines into normalized transactions", () => {
    const parsed = __test__.parsePdfStatementLines([
      "HDFC BANK",
      "Account Number: 123456789012",
      "01/05/2026 Salary Credit ACME CR 80000.00 102000.00",
      "03/05/2026 Uber Ride DR 320.00 101680.00",
      "04/05/2026 Netflix Subscription DR 649.00 101031.00",
    ].join("\n"));

    expect(parsed.metadata.accountNumberMasked).toBe("XXXXXX9012");
    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[1]).toMatchObject({
      description: "Uber Ride",
      amount: 320,
      direction: "debit",
      category: "Transport",
    });
  });

  it("parses PDF rows that contain integer amounts and debit keywords", () => {
    const parsed = __test__.parsePdfStatementLines([
      "AXIS BANK",
      "Name: Priya N",
      "Account No: 0000111122223333",
      "07/05/2026 Salary credited from ACME 64000 104500",
      "09/05/2026 Card payment at Grocery Mart debited 1750 102750",
    ].join("\n"));

    expect(parsed.metadata.accountNumberMasked).toBe("XXXXXX3333");
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toMatchObject({ direction: "credit", amount: 64000 });
    expect(parsed.transactions[1]).toMatchObject({ direction: "debit", amount: 1750, category: "Groceries" });
  });

  it("parses PhonePe PDF text when spacing/currency/UTR fields vary", () => {
    const parsed = __test__.parsePdfStatementLines(
      "Transaction Statement for 9999912345 "
      + "May 20, 2026 09:52 am DEBIT INR 367 Paid to CAFE BLEND Transaction ID TXN001 "
      + "May 21, 2026 10:01 am CREDIT Rs 120.50 Received from RAHUL UTR No. UTR8899",
    );

    expect(parsed.metadata.accountNumberMasked).toBe("XXXXXX2345");
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toMatchObject({
      amount: 367,
      direction: "debit",
      description: "CAFE BLEND",
      reference: "TXN001",
    });
    expect(parsed.transactions[1]).toMatchObject({
      amount: 120.5,
      direction: "credit",
      description: "RAHUL",
      reference: "UTR8899",
    });
  });

  it("converts PhonePe statement timestamps from IST to UTC deterministically", () => {
    const parsed = __test__.parsePdfStatementLines(
      "Transaction Statement for 9999912345 "
      + "May 20, 2026 09:52 am DEBIT ₹367 Paid to CAFE BLEND Transaction ID TXN001",
    );

    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]?.postedAt).toBe("2026-05-20T04:22:00.000Z");
  });
});

describe("bank statement analysis", () => {
  it("builds health summary, recurring payments, and risk indicators", async () => {
    const statement: ParsedBankStatement = {
      bankName: "HDFC BANK",
      accountHolderName: "Asha Patel",
      accountNumberMasked: "XXXXXX9012",
      statementPeriodStart: "2026-05-01T00:00:00.000Z",
      statementPeriodEnd: "2026-05-31T00:00:00.000Z",
      openingBalance: 100000,
      closingBalance: 82000,
      currency: "INR",
      transactions: [
        {
          postedAt: "2026-05-01T00:00:00.000Z",
          description: "Salary Credit ACME",
          amount: 90000,
          direction: "credit",
          balance: 100000,
          reference: "SAL1",
          category: "Salary",
          isSalary: true,
          isEmi: false,
        },
        {
          postedAt: "2026-05-05T00:00:00.000Z",
          description: "Home Loan EMI",
          amount: 25000,
          direction: "debit",
          balance: 75000,
          reference: "EMI1",
          category: "EMI",
          isSalary: false,
          isEmi: true,
        },
        {
          postedAt: "2026-05-10T00:00:00.000Z",
          description: "Netflix Subscription",
          amount: 649,
          direction: "debit",
          balance: 74351,
          reference: "OTT1",
          category: "Entertainment",
          isSalary: false,
          isEmi: false,
        },
        {
          postedAt: "2026-05-20T00:00:00.000Z",
          description: "Netflix Subscription",
          amount: 649,
          direction: "debit",
          balance: 73702,
          reference: "OTT2",
          category: "Entertainment",
          isSalary: false,
          isEmi: false,
        },
      ],
    };

    const analysis = await analyzeBankStatement(statement);

    expect(analysis.totalCredits).toBe(90000);
    expect(analysis.totalDebits).toBe(26298);
    expect(analysis.balanceTrend).toBe("down");
    expect(analysis.recurringPayments.length).toBeGreaterThan(0);
    expect(analysis.topCategories[0]?.category).toBe("EMI");
    expect(analysis.riskIndicators.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });
});

describe("bank statement import degradation", () => {
  it("keeps debit transaction persisted when AI classification degrades", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const supabase = {
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    };

    persistTransactionMock.mockResolvedValue({
      ok: true,
      deduplicated: false,
      transaction: {
        id: "tx-bank-1",
        userId: "u1",
        ingestionId: "statement:abc",
        ingestionBatchId: "bank-statement:doc-1",
        fingerprint: "fp-1",
        amount: 450,
        merchant: "Cafe Blend",
        source: "bank",
        reference: "TXN001",
        timestamp: "2026-05-20T04:22:00.000Z",
        createdAt: "2026-05-20T04:22:00.000Z",
        updatedAt: "2026-05-20T04:22:00.000Z",
      },
    });

    classifyTransactionMock.mockResolvedValue({
      ok: false,
      reason: "classification timeout",
      retryable: true,
    });

    const result = await __test__.importDebitTransaction(
      supabase as never,
      "u1",
      "doc-1",
      {
        postedAt: "2026-05-20T04:22:00.000Z",
        description: "Cafe Blend",
        amount: 450,
        direction: "debit",
        balance: 12250,
        reference: "TXN001",
        category: "Food",
        isSalary: false,
        isEmi: false,
      },
    );

    expect(result).toEqual({
      transactionId: "tx-bank-1",
      deduplicated: false,
      persisted: true,
      reason: null,
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        financial_document_id: "doc-1",
        category: "Food",
        ai_classification: null,
        ai_reason: null,
      }),
    );
  });
});
