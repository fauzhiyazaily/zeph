import "server-only";

import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { analyzeBankStatement } from "@/lib/ai/bank-statement-analysis";
import { classifyTransaction } from "@/lib/ai/classification";
import { logAuditEvent } from "@/lib/audit";
import {
  type BankStatementAnalysis,
  type FinancialDocumentSummary,
  type ParsedBankStatement,
  type ParsedStatementTransaction,
  type SupportedStatementMimeType,
} from "@/lib/ingestion/bank-statement-types";
import { writeIngestionAuditLog } from "@/lib/ingestion/audit-log";
import { writeFailedIngestionRecord } from "@/lib/ingestion/dead-letter";
import { getServerSecret } from "@/lib/security/baseline";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileIngestionBatch, recordImportDuration, trackTelemetry } from "@/shared/ingestion/index";
import { persistTransaction } from "@/lib/transactions/persistence";

const SUPPORTED_MIME_TYPES = new Set<SupportedStatementMimeType>([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const DATE_ALIASES = ["date", "txn date", "transaction date", "value date", "posted on"];
const DESCRIPTION_ALIASES = ["description", "narration", "remarks", "particulars", "details"];
const DEBIT_ALIASES = [
  "debit",
  "withdrawal",
  "withdrawal amount",
  "withdrawal amt",
  "dr amount",
  "debit amount",
  "amount withdrawn",
];
const CREDIT_ALIASES = [
  "credit",
  "deposit",
  "deposit amount",
  "deposit amt",
  "cr amount",
  "credit amount",
  "amount deposited",
];
const AMOUNT_ALIASES = ["amount", "transaction amount", "txn amount", "value", "transaction value"];
const BALANCE_ALIASES = ["balance", "closing balance", "running balance", "available balance", "avail bal"];
const REFERENCE_ALIASES = ["reference", "ref", "utr", "txn id", "transaction id", "cheque no", "chq/ref no", "rrn"];

const DEBIT_KEYWORDS = ["dr", "debit", "withdrawal", "debited", "sent", "paid"];
const CREDIT_KEYWORDS = ["cr", "credit", "credited", "deposit", "received"];

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const BANK_HINTS = [
  "HDFC BANK",
  "ICICI BANK",
  "STATE BANK OF INDIA",
  "SBI",
  "AXIS BANK",
  "KOTAK",
  "YES BANK",
  "IDFC FIRST",
  "INDUSIND",
  "UNION BANK",
  "BANK OF BARODA",
  "CANARA BANK",
  "PNB",
];

const CATEGORY_HINTS: Array<{ category: string; keywords: string[] }> = [
  { category: "Salary", keywords: ["salary", "payroll", "salary credit", "sal"] },
  { category: "EMI", keywords: ["emi", "loan", "autopay", "ecs", "nach"] },
  { category: "Rent", keywords: ["rent", "landlord", "lease"] },
  { category: "Groceries", keywords: ["mart", "supermarket", "grocery", "dmart", "bigbasket", "zepto", "blinkit"] },
  { category: "Food", keywords: ["zomato", "swiggy", "restaurant", "cafe", "eatery"] },
  { category: "Utilities", keywords: ["electricity", "water", "broadband", "internet", "gas bill", "recharge"] },
  { category: "Transport", keywords: ["uber", "ola", "metro", "fuel", "petrol", "diesel", "irctc"] },
  { category: "Insurance", keywords: ["insurance", "policy", "premium"] },
  { category: "Shopping", keywords: ["amazon", "flipkart", "myntra", "shop", "store"] },
  { category: "Health", keywords: ["hospital", "pharmacy", "medical", "clinic"] },
  { category: "Investments", keywords: ["mutual fund", "sip", "zerodha", "groww", "stocks"] },
];

type UploadValidation =
  | { ok: true; mimeType: SupportedStatementMimeType }
  | { ok: false; code: string; message: string };

type ParseSuccess = { ok: true; data: ParsedBankStatement };
type ParseFailure = { ok: false; code: string; message: string; retryable: boolean };

type ImportSuccess = {
  ok: true;
  deduplicated: boolean;
  document: FinancialDocumentSummary;
};

type ImportFailure = {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
};

export type ImportBankStatementResult = ImportSuccess | ImportFailure;

type FinancialDocumentRow = {
  id: string;
  file_name: string;
  parse_status: "processing" | "completed" | "failed";
  parse_error: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number_masked: string | null;
  statement_period_start: string | null;
  statement_period_end: string | null;
  transaction_count: number;
  imported_debit_count: number;
  total_credits: number;
  total_debits: number;
  opening_balance: number | null;
  closing_balance: number | null;
  processed_at: string | null;
  created_at: string;
  extracted_summary: BankStatementAnalysis | null;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(raw: string | number | null | undefined) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Number(raw.toFixed(2)) : null;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const cleaned = raw
    .replace(/[₹,]/g, "")
    .replace(/\b(?:cr|dr)\b/gi, "")
    .trim();
  if (!cleaned) {
    return null;
  }

  const negativeByParens = cleaned.startsWith("(") && cleaned.endsWith(")");
  const normalized = cleaned.replace(/[()]/g, "");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  const finalValue = negativeByParens ? -parsed : parsed;
  return Number(finalValue.toFixed(2));
}

function parseStatementDate(raw: string | number | Date | null | undefined) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return null;
    }

    if (raw > 20_000 && raw < 90_000) {
      const excelDate = new Date(EXCEL_EPOCH_UTC + Math.round(raw * 86_400_000));
      return Number.isNaN(excelDate.getTime()) ? null : excelDate.toISOString();
    }

    const epochMs = raw > 10_000_000_000 ? raw : raw * 1000;
    const epoch = new Date(epochMs);
    return Number.isNaN(epoch.getTime()) ? null : epoch.toISOString();
  }

  if (typeof raw !== "string") {
    return null;
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) {
    return null;
  }

  const [, dayRaw, monthRaw, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const candidate = new Date(`${year}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}T00:00:00Z`);
  return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
}

function parsePhonePeStatementDateTime(dateRaw: string, timeRaw: string) {
  const match = dateRaw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) {
    return null;
  }

  const monthMap: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const month = monthMap[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) {
    return null;
  }

  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const timeMatch = timeRaw.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/);
  if (!timeMatch) {
    return null;
  }

  let hour = Number.parseInt(timeMatch[1], 10) % 12;
  const minute = Number.parseInt(timeMatch[2], 10);
  if (timeMatch[3] === "pm") {
    hour += 12;
  }

  // PhonePe statements are in IST (UTC+05:30). Convert to UTC for canonical ISO output.
  const utcMs = Date.UTC(year, month, day, hour, minute) - (5.5 * 60 * 60 * 1000);
  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function summarizeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError" };
  }

  const withCode = error as Error & { code?: unknown };
  return {
    name: error.name,
    message: error.message,
    code: typeof withCode.code === "string" ? withCode.code : undefined,
  };
}

function matchesAlias(value: string, aliases: string[]) {
  const normalized = value.trim().toLowerCase();
  return aliases.some((alias) => normalized.includes(alias));
}

function inferCategory(description: string) {
  const normalized = description.toLowerCase();
  for (const hint of CATEGORY_HINTS) {
    if (hint.keywords.some((keyword) => normalized.includes(keyword))) {
      return hint.category;
    }
  }
  return null;
}

function isSalaryDescription(description: string) {
  return /\bsalary\b|payroll|salary credit|sal\b/i.test(description);
}

function isEmiDescription(description: string) {
  return /\bemi\b|loan|autopay|ecs|nach/i.test(description);
}

function extractReference(description: string) {
  const match = description.match(/(?:utr|ref(?:erence)?|txn(?:\s*id)?|transaction\s*id)[:\s#-]*([a-z0-9-]{6,40})/i);
  return match ? match[1].toUpperCase() : null;
}

function maskAccountNumber(raw: string | null) {
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) {
    return null;
  }

  return `XXXXXX${digits.slice(-4)}`;
}

function extractMetadataFromText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => normalizeWhitespace(line)).filter(Boolean);

  const bankLine = lines.find((line) => BANK_HINTS.some((hint) => line.toUpperCase().includes(hint)));
  const bankName = bankLine ? BANK_HINTS.find((hint) => bankLine.toUpperCase().includes(hint)) ?? bankLine : null;

  const accountHolderLine = lines.find((line) => /(?:account holder|customer name|name)\s*[:\-]/i.test(line));
  const accountNumberLine = lines.find((line) => /(?:account(?: number| no\.?|#)?)\s*[:\-]?/i.test(line));
  const accountHolderMatch = accountHolderLine?.match(/(?:account holder|customer name|name)\s*[:\-]\s*(.+)$/i);
  const accountNumberMatch = accountNumberLine?.match(/(?:account(?: number| no\.?|#)?)\s*[:\-]?\s*([xX*\d\s-]{6,})$/i);

  return {
    bankName: bankName ? normalizeWhitespace(bankName) : null,
    accountHolderName: accountHolderMatch ? normalizeWhitespace(accountHolderMatch[1]) : null,
    accountNumberMasked: maskAccountNumber(accountNumberMatch ? accountNumberMatch[1] : null),
  };
}

function scoreHeaderRow(row: string[]) {
  let score = 0;
  for (const cell of row) {
    if (matchesAlias(cell, DATE_ALIASES)) score += 2;
    if (matchesAlias(cell, DESCRIPTION_ALIASES)) score += 2;
    if (matchesAlias(cell, DEBIT_ALIASES)) score += 2;
    if (matchesAlias(cell, CREDIT_ALIASES)) score += 2;
    if (matchesAlias(cell, AMOUNT_ALIASES)) score += 1;
    if (matchesAlias(cell, BALANCE_ALIASES)) score += 1;
    if (matchesAlias(cell, REFERENCE_ALIASES)) score += 1;
  }
  return score;
}

function findHeaderRow(rows: string[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.slice(0, 12).forEach((row, index) => {
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 4 ? bestIndex : -1;
}

function mapColumns(header: string[]) {
  const map = {
    date: -1,
    description: -1,
    debit: -1,
    credit: -1,
    amount: -1,
    balance: -1,
    reference: -1,
  };

  header.forEach((cell, index) => {
    if (map.date < 0 && matchesAlias(cell, DATE_ALIASES)) map.date = index;
    if (map.description < 0 && matchesAlias(cell, DESCRIPTION_ALIASES)) map.description = index;
    if (map.debit < 0 && matchesAlias(cell, DEBIT_ALIASES)) map.debit = index;
    if (map.credit < 0 && matchesAlias(cell, CREDIT_ALIASES)) map.credit = index;
    if (map.amount < 0 && matchesAlias(cell, AMOUNT_ALIASES)) map.amount = index;
    if (map.balance < 0 && matchesAlias(cell, BALANCE_ALIASES)) map.balance = index;
    if (map.reference < 0 && matchesAlias(cell, REFERENCE_ALIASES)) map.reference = index;
  });

  return map;
}

function normalizeRowTransaction(row: string[], headerMap: ReturnType<typeof mapColumns>) {
  const dateValue = headerMap.date >= 0 ? row[headerMap.date] : "";
  const postedAt = parseStatementDate(dateValue);
  if (!postedAt) {
    return null;
  }

  const descriptionRaw = headerMap.description >= 0 ? row[headerMap.description] : row.join(" ");
  const description = normalizeWhitespace(descriptionRaw);
  if (description.length < 2) {
    return null;
  }

  const fullRowText = row.join(" ");
  const fullRowNormalized = fullRowText.toLowerCase();
  const hasDebitHint = DEBIT_KEYWORDS.some((keyword) => fullRowNormalized.includes(keyword));
  const hasCreditHint = CREDIT_KEYWORDS.some((keyword) => fullRowNormalized.includes(keyword));

  const debitValue = headerMap.debit >= 0 ? parseAmount(row[headerMap.debit]) : null;
  const creditValue = headerMap.credit >= 0 ? parseAmount(row[headerMap.credit]) : null;
  const amountValue = headerMap.amount >= 0 ? parseAmount(row[headerMap.amount]) : null;
  const balanceValue = headerMap.balance >= 0 ? parseAmount(row[headerMap.balance]) : null;
  const referenceValue = headerMap.reference >= 0 ? normalizeWhitespace(row[headerMap.reference]) : null;

  let direction: "credit" | "debit" | null = null;
  let amount: number | null = null;

  if (debitValue !== null && Math.abs(debitValue) > 0) {
    direction = "debit";
    amount = Math.abs(debitValue);
  } else if (creditValue !== null && Math.abs(creditValue) > 0) {
    direction = "credit";
    amount = Math.abs(creditValue);
  } else if (amountValue !== null) {
    direction = amountValue < 0 ? "debit" : hasCreditHint && !hasDebitHint ? "credit" : "debit";
    amount = Math.abs(amountValue);
  } else {
    const firstNumericToken = fullRowText.match(/-?\d[\d,]*(?:\.\d{1,2})?/);
    const parsedTokenAmount = firstNumericToken ? parseAmount(firstNumericToken[0]) : null;
    if (parsedTokenAmount !== null && parsedTokenAmount > 0 && (hasDebitHint || hasCreditHint)) {
      direction = hasCreditHint && !hasDebitHint ? "credit" : "debit";
      amount = parsedTokenAmount;
    }
  }

  if (!direction || amount === null || amount <= 0) {
    return null;
  }

  const category = inferCategory(description);
  return {
    postedAt,
    description,
    amount,
    direction,
    balance: balanceValue !== null ? Math.abs(balanceValue) : null,
    reference: referenceValue || extractReference(description),
    category,
    isSalary: isSalaryDescription(description),
    isEmi: isEmiDescription(description),
    rawText: row.join(" | "),
  } satisfies ParsedStatementTransaction;
}

function parseWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const allTransactions: ParsedStatementTransaction[] = [];
  let metadata = { bankName: null as string | null, accountHolderName: null as string | null, accountNumberMasked: null as string | null };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const normalizedRows = rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
    const headerIndex = findHeaderRow(normalizedRows);
    if (headerIndex < 0) {
      continue;
    }

    const headerMap = mapColumns(normalizedRows[headerIndex]);
    for (const row of normalizedRows.slice(headerIndex + 1)) {
      const parsed = normalizeRowTransaction(row, headerMap);
      if (parsed) {
        allTransactions.push(parsed);
      }
    }

    const sheetText = normalizedRows.flat().join("\n");
    metadata = extractMetadataFromText(sheetText);
    if (allTransactions.length > 0) {
      break;
    }
  }

  return {
    metadata,
    transactions: allTransactions.sort((left, right) => left.postedAt.localeCompare(right.postedAt)),
  };
}

function parsePhonePeStatement(text: string) {
  const metadata = extractMetadataFromText(text);
  if (!metadata.bankName) {
    metadata.bankName = "PhonePe";
  }

  // Extract phone number as masked account if no account number found
  if (!metadata.accountNumberMasked) {
    const phoneMatch = text.match(/Transaction Statement for (\d{10})/);
    if (phoneMatch) {
      metadata.accountNumberMasked = `XXXXXX${phoneMatch[1].slice(-4)}`;
    }
  }

  const pattern =
    /(\w+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}\s*[ap]m)\s+(DEBIT|CREDIT)\s+(?:₹|inr|rs\.?)?\s*([\d,]+(?:\.\d+)?)\s*(Paid to|Received from|Refund from|Reversed to|Cashback from)\s+(.+?)(?:\s+Transaction ID\s+([A-Za-z0-9-]+))?(?:\s+UTR(?:\s+No\.)?\s+([A-Za-z0-9-]+))?(?=\s+(?:\w+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*[ap]m\s+(?:DEBIT|CREDIT))|$)/gi;

  const transactions: ParsedStatementTransaction[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [rawText, date, time, typeStr, amountRaw, , merchant, txnId, utr] = match;
    const amount = parseFloat(amountRaw.replace(/,/g, ""));
    if (Number.isNaN(amount) || amount <= 0) {
      continue;
    }

    const postedAt = parsePhonePeStatementDateTime(date, time);
    if (!postedAt) {
      continue;
    }

    const direction: "credit" | "debit" = typeStr.toUpperCase() === "CREDIT" ? "credit" : "debit";
    const description = normalizeWhitespace(merchant);

    transactions.push({
      postedAt,
      description,
      amount: Number(amount.toFixed(2)),
      direction,
      balance: null,
      reference: txnId ?? utr ?? extractReference(rawText),
      category: inferCategory(description),
      isSalary: isSalaryDescription(description),
      isEmi: isEmiDescription(description),
      rawText,
    });
  }

  return {
    metadata,
    transactions: transactions.sort((left, right) => left.postedAt.localeCompare(right.postedAt)),
  };
}

function parsePdfStatementLines(text: string) {
  // Detect PhonePe statement by its header
  if (/Transaction Statement for \d{10}/i.test(text) || /phonepe/i.test(text.slice(0, 200))) {
    return parsePhonePeStatement(text);
  }

  const metadata = extractMetadataFromText(text);
  const lines = text.split(/\r?\n/).map((line) => normalizeWhitespace(line)).filter(Boolean);
  const transactions: ParsedStatementTransaction[] = [];

  for (const line of lines) {
    const lineMatch = line.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s+|\t+)(.+)$/);
    if (!lineMatch) {
      continue;
    }

    const postedAt = parseStatementDate(lineMatch[1]);
    if (!postedAt) {
      continue;
    }

    const remainder = lineMatch[2];
    const numericTokens = remainder.match(/-?\d[\d,]*(?:\.\d{1,2})?/g) ?? [];
    if (numericTokens.length === 0) {
      continue;
    }

    const amountCandidate = parseAmount(numericTokens[0]);
    if (amountCandidate === null) {
      continue;
    }

    const balanceCandidate = numericTokens.length > 1 ? parseAmount(numericTokens[numericTokens.length - 1]) : null;
    const direction = /\bcr\b|credit|credited|deposit/i.test(remainder)
      ? "credit"
      : /\bdr\b|debit|debited|withdrawal|paid|sent/i.test(remainder)
        ? "debit"
        : amountCandidate < 0
          ? "debit"
          : "debit";

    const description = normalizeWhitespace(
      remainder.replace(/-?\d[\d,]*\.\d{2}/g, " ").replace(/\b(?:cr|dr|credit|debit)\b/gi, " "),
    );

    if (description.length < 2) {
      continue;
    }

    transactions.push({
      postedAt,
      description,
      amount: Math.abs(amountCandidate),
      direction,
      balance: balanceCandidate !== null ? Math.abs(balanceCandidate) : null,
      reference: extractReference(description),
      category: inferCategory(description),
      isSalary: isSalaryDescription(description),
      isEmi: isEmiDescription(description),
      rawText: line,
    });
  }

  return {
    metadata,
    transactions: transactions.sort((left, right) => left.postedAt.localeCompare(right.postedAt)),
  };
}

function parseJsonObject<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function parseStatementImageWithAnthropic(file: File) {
  const apiKey = getServerSecret("ANTHROPIC_API_KEY");
  const bytes = Buffer.from(await file.arrayBuffer());
  const payload = bytes.toString("base64");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1800,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: file.type,
                data: payload,
              },
            },
            {
              type: "text",
              text: "Extract this bank statement into JSON only. Schema: {\"bankName\":string|null,\"accountHolderName\":string|null,\"accountNumberMasked\":string|null,\"transactions\":[{\"postedAt\":\"ISO\",\"description\":string,\"amount\":number,\"direction\":\"credit|debit\",\"balance\":number|null,\"reference\":string|null}] } . Use masked account number only, preserve no more than last 4 digits, and do not include commentary.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = json.content?.find((part) => part.type === "text")?.text ?? "";
  const parsed = parseJsonObject<{
    bankName?: string | null;
    accountHolderName?: string | null;
    accountNumberMasked?: string | null;
    transactions?: Array<{
      postedAt?: string;
      description?: string;
      amount?: number;
      direction?: "credit" | "debit";
      balance?: number | null;
      reference?: string | null;
    }>;
  }>(text);

  if (!parsed?.transactions || parsed.transactions.length === 0) {
    return null;
  }

  const transactions = parsed.transactions
    .map((row) => {
      const postedAt = parseStatementDate(row.postedAt ?? null);
      if (!postedAt || typeof row.description !== "string" || typeof row.amount !== "number") {
        return null;
      }

      const description = normalizeWhitespace(row.description);
      if (description.length < 2 || (row.direction !== "credit" && row.direction !== "debit")) {
        return null;
      }

      return {
        postedAt,
        description,
        amount: Number(Math.abs(row.amount).toFixed(2)),
        direction: row.direction,
        balance: typeof row.balance === "number" ? Number(row.balance.toFixed(2)) : null,
        reference: row.reference ? normalizeWhitespace(row.reference) : extractReference(description),
        category: inferCategory(description),
        isSalary: isSalaryDescription(description),
        isEmi: isEmiDescription(description),
      } satisfies ParsedStatementTransaction;
    })
    .filter((row): row is ParsedStatementTransaction => row !== null)
    .sort((left, right) => left.postedAt.localeCompare(right.postedAt));

  return {
    bankName: parsed.bankName ? normalizeWhitespace(parsed.bankName) : null,
    accountHolderName: parsed.accountHolderName ? normalizeWhitespace(parsed.accountHolderName) : null,
    accountNumberMasked: maskAccountNumber(parsed.accountNumberMasked ?? null),
    transactions,
  };
}

function buildParsedStatement(metadata: {
  bankName: string | null;
  accountHolderName: string | null;
  accountNumberMasked: string | null;
}, transactions: ParsedStatementTransaction[]): ParsedBankStatement {
  const sorted = [...transactions].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const openingBalance = first?.balance ?? null;
  const closingBalance = last?.balance ?? null;

  return {
    bankName: metadata.bankName,
    accountHolderName: metadata.accountHolderName,
    accountNumberMasked: metadata.accountNumberMasked,
    statementPeriodStart: first?.postedAt ?? null,
    statementPeriodEnd: last?.postedAt ?? null,
    openingBalance,
    closingBalance,
    currency: "INR",
    transactions: sorted,
  };
}

function validateUpload(file: File): UploadValidation {
  if (!file || file.size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "Select a bank statement file to continue." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "Bank statement upload must be 8 MB or smaller.",
    };
  }

  const mimeType = file.type as SupportedStatementMimeType;
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      code: "UNSUPPORTED_FORMAT",
      message: "Supported formats: PDF, XLSX, XLS, CSV, PNG, JPG, JPEG, WEBP.",
    };
  }

  return { ok: true, mimeType };
}

async function parseBankStatementFile(file: File): Promise<ParseSuccess | ParseFailure> {
  const validation = validateUpload(file);
  if (!validation.ok) {
    return { ok: false, code: validation.code, message: validation.message, retryable: false };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (validation.mimeType === "text/csv" || validation.mimeType === "application/vnd.ms-excel" || validation.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      const workbookParsed = parseWorkbook(buffer);
      if (workbookParsed.transactions.length === 0) {
        return {
          ok: false,
          code: "PARSE_FAILED",
          message: "Could not detect statement rows from the uploaded sheet.",
          retryable: false,
        };
      }

      return { ok: true, data: buildParsedStatement(workbookParsed.metadata, workbookParsed.transactions) };
    }

    if (validation.mimeType === "application/pdf") {
      const { extractText } = await import("unpdf");
      const { text: fullText } = await extractText(new Uint8Array(buffer), { mergePages: true });

      const textParsed = parsePdfStatementLines(fullText);
      if (textParsed.transactions.length === 0) {
        return {
          ok: false,
          code: "PARSE_FAILED",
          message: "The PDF text could not be parsed into bank statement transactions.",
          retryable: false,
        };
      }

      return { ok: true, data: buildParsedStatement(textParsed.metadata, textParsed.transactions) };
    }

    const imageParsed = await parseStatementImageWithAnthropic(file);
    if (!imageParsed || imageParsed.transactions.length === 0) {
      return {
        ok: false,
        code: "OCR_FAILED",
        message: "Image OCR could not extract statement transactions from this upload.",
        retryable: true,
      };
    }

    return { ok: true, data: buildParsedStatement(imageParsed, imageParsed.transactions) };
  } catch (error) {
    console.error("[bank-statement] parseBankStatementFile error", summarizeError(error));
    return {
      ok: false,
      code: "PROCESSING_FAILED",
      message: "Statement processing failed unexpectedly. Please retry with a clearer file.",
      retryable: true,
    };
  }
}

function buildStatementFingerprint(userId: string, buffer: Buffer) {
  return createHash("sha256").update(`${userId}:`).update(buffer).digest("hex");
}

function buildStatementIngestionId(userId: string, row: ParsedStatementTransaction) {
  return createHash("sha256")
    .update(`${userId}:${row.postedAt}:${row.description}:${row.amount}:${row.direction}:${row.reference ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

function toDocumentSummary(row: FinancialDocumentRow): FinancialDocumentSummary {
  return {
    id: row.id,
    fileName: row.file_name,
    parseStatus: row.parse_status,
    parseError: row.parse_error,
    bankName: row.bank_name,
    accountHolderName: row.account_holder_name,
    accountNumberMasked: row.account_number_masked,
    statementPeriodStart: row.statement_period_start,
    statementPeriodEnd: row.statement_period_end,
    transactionCount: row.transaction_count,
    importedDebitCount: row.imported_debit_count,
    totalCredits: Number(row.total_credits ?? 0),
    totalDebits: Number(row.total_debits ?? 0),
    openingBalance: row.opening_balance,
    closingBalance: row.closing_balance,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    analysis: row.extracted_summary,
  };
}

async function findExistingDocument(supabase: SupabaseClient, userId: string, fingerprint: string) {
  const { data } = await supabase
    .from("financial_documents")
    .select("id,file_name,parse_status,parse_error,bank_name,account_holder_name,account_number_masked,statement_period_start,statement_period_end,transaction_count,imported_debit_count,total_credits,total_debits,opening_balance,closing_balance,processed_at,created_at,extracted_summary")
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .maybeSingle<FinancialDocumentRow>();

  return data ?? null;
}

async function upsertDocumentRecord(
  supabase: SupabaseClient,
  userId: string,
  fingerprint: string,
  file: File,
  existingId?: string,
) {
  const payload = {
    user_id: userId,
    fingerprint,
    file_name: file.name,
    mime_type: file.type,
    file_size_bytes: file.size,
    parse_status: "processing",
    parse_error: null,
  };

  if (existingId) {
    const { data, error } = await supabase
      .from("financial_documents")
      .update(payload)
      .eq("id", existingId)
      .eq("user_id", userId)
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      throw new Error("Failed to update financial document state.");
    }

    return data.id;
  }

  const { data, error } = await supabase
    .from("financial_documents")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error("Failed to create financial document record.");
  }

  return data.id;
}

async function writeFailureState(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  errorMessage: string,
) {
  await supabase
    .from("financial_documents")
    .update({ parse_status: "failed", parse_error: errorMessage, processed_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("user_id", userId);
}

async function importDebitTransaction(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  row: ParsedStatementTransaction,
) {
  const ingestionId = `statement:${buildStatementIngestionId(userId, row)}`;
  const ingestionBatchId = `bank-statement:${documentId}`;

  const persisted = await persistTransaction(supabase, {
    userId,
    ingestionId,
    parsed: {
      amount: row.amount,
      merchant: row.description.slice(0, 120),
      source: "bank",
      source_version: "1.0.0",
      reference: row.reference,
      category: row.category,
      timestamp: row.postedAt,
      financial_document_id: documentId,
      ingestion_batch_id: ingestionBatchId,
      ingested_at: new Date().toISOString(),
    },
  });

  if (!persisted.ok) {
    return {
      transactionId: null,
      deduplicated: false,
      persisted: false,
      reason: persisted.reason,
    };
  }

  const classification = await classifyTransaction({
    merchant: row.description.slice(0, 120),
    amount: row.amount,
    source: "bank",
    category: row.category,
    reference: row.reference,
  });

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      financial_document_id: documentId,
      category: row.category,
      ai_classification: classification.ok ? classification.label : null,
      ai_reason: classification.ok ? classification.reason : null,
      ai_raw_classification: classification.ok ? classification.label : null,
      ai_raw_reason: classification.ok ? classification.reason : null,
      ai_user_classification: null,
      ai_user_reason: null,
      ai_review_state: "pending",
      ai_override_at: null,
    })
    .eq("id", persisted.transaction.id)
    .eq("user_id", userId);

  if (updateError) {
    return {
      transactionId: null,
      deduplicated: persisted.deduplicated,
      persisted: false,
      reason: updateError.message,
    };
  }

  return {
    transactionId: persisted.transaction.id,
    deduplicated: persisted.deduplicated,
    persisted: true,
    reason: null,
  };
}

export async function importBankStatementForUser(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<ImportBankStatementResult> {
  const importStartedAt = Date.now();
  const defaultBatchId = `bank-statement:pending:${Date.now()}`;

  const persistBatchAudit = async (
    input: Pick<
      Parameters<typeof writeIngestionAuditLog>[1],
      "ingestion_batch_id" | "total_rows" | "valid_rows" | "invalid_rows" | "duplicate_rows"
    >,
  ) => {
    await writeIngestionAuditLog(supabase, {
      ingestion_batch_id: input.ingestion_batch_id,
      source_type: "bank",
      source_version: "1.0.0",
      total_rows: input.total_rows,
      valid_rows: input.valid_rows,
      invalid_rows: input.invalid_rows,
      duplicate_rows: input.duplicate_rows,
      processing_duration_ms: Date.now() - importStartedAt,
    }).catch(() => null);
  };

  const validation = validateUpload(file);
  if (!validation.ok) {
    await persistBatchAudit({
      ingestion_batch_id: defaultBatchId,
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
    });
    return { ok: false, code: validation.code, message: validation.message, retryable: false };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fingerprint = buildStatementFingerprint(userId, buffer);
  const existing = await findExistingDocument(supabase, userId, fingerprint);

  if (existing?.parse_status === "completed") {
    return {
      ok: true,
      deduplicated: true,
      document: toDocumentSummary(existing),
    };
  }

  let documentId = "";

  try {
    documentId = await upsertDocumentRecord(supabase, userId, fingerprint, file, existing?.id);
  } catch (error) {
    console.error("[bank-statement] upsertDocumentRecord error", summarizeError(error));
    await persistBatchAudit({
      ingestion_batch_id: defaultBatchId,
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
    });
    return {
      ok: false,
      code: "DOCUMENT_CREATE_FAILED",
      message: "Could not create a statement processing record. Please retry.",
      retryable: true,
    };
  }

  const parsed = await parseBankStatementFile(file);
  if (!parsed.ok) {
    await writeFailureState(supabase, userId, documentId, parsed.message);
    await writeFailedIngestionRecord(supabase, {
      user_id: userId,
      ingestion_batch_id: `bank-statement:${documentId}`,
      source_type: "bank",
      source_version: "1.0.0",
      reason: parsed.message,
      retryable: parsed.retryable,
      route: "/api/ingestion/bank-statement",
      payload: {
        file_name: file.name,
        parse_code: parsed.code,
      },
    }).catch(() => null);
    await persistBatchAudit({
      ingestion_batch_id: `bank-statement:${documentId}`,
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
    });
    return parsed;
  }

  if (parsed.data.transactions.length === 0) {
    await writeFailureState(supabase, userId, documentId, "No statement transactions were detected.");
    await writeFailedIngestionRecord(supabase, {
      user_id: userId,
      ingestion_batch_id: `bank-statement:${documentId}`,
      source_type: "bank",
      source_version: "1.0.0",
      reason: "No statement transactions were detected.",
      retryable: false,
      route: "/api/ingestion/bank-statement",
      payload: {
        file_name: file.name,
      },
    }).catch(() => null);
    await persistBatchAudit({
      ingestion_batch_id: `bank-statement:${documentId}`,
      total_rows: 1,
      valid_rows: 0,
      invalid_rows: 1,
      duplicate_rows: 0,
    });
    return {
      ok: false,
      code: "NO_TRANSACTIONS",
      message: "No statement transactions were detected from this file.",
      retryable: false,
    };
  }

  const analysis = await analyzeBankStatement(parsed.data);

  await supabase.from("financial_document_transactions").delete().eq("document_id", documentId).eq("user_id", userId);

  const rawRows: Array<Record<string, unknown>> = [];
  let importedDebitCount = 0;
  let duplicateDebitCount = 0;
  let invalidDebitCount = 0;

  for (const row of parsed.data.transactions) {
    let linkedTransactionId: string | null = null;
    if (row.direction === "debit") {
      const imported = await importDebitTransaction(supabase, userId, documentId, row);
      linkedTransactionId = imported.transactionId;
      if (imported.persisted && linkedTransactionId) {
        importedDebitCount += 1;
        if (imported.deduplicated) {
          duplicateDebitCount += 1;
        }
      } else {
        invalidDebitCount += 1;
        await writeFailedIngestionRecord(supabase, {
          user_id: userId,
          ingestion_batch_id: `bank-statement:${documentId}`,
          source_type: "bank",
          source_version: "1.0.0",
          reason: imported.reason ?? "Debit transaction persistence failed.",
          retryable: true,
          route: "/api/ingestion/bank-statement",
          payload: {
            transaction_row: row,
          },
        }).catch(() => null);
      }
    }

    rawRows.push({
      document_id: documentId,
      user_id: userId,
      posted_at: row.postedAt,
      description: row.description,
      amount: row.amount,
      direction: row.direction,
      balance: row.balance,
      reference: row.reference,
      category: row.category,
      is_salary: row.isSalary,
      is_emi: row.isEmi,
      transaction_id: linkedTransactionId,
    });
  }

  if (rawRows.length > 0) {
    const { error: rawInsertError } = await supabase.from("financial_document_transactions").insert(rawRows);
    if (rawInsertError) {
      await writeFailureState(supabase, userId, documentId, "Structured statement lines could not be stored.");
      await writeFailedIngestionRecord(supabase, {
        user_id: userId,
        ingestion_batch_id: `bank-statement:${documentId}`,
        source_type: "bank",
        source_version: "1.0.0",
        reason: "Structured statement lines could not be stored.",
        retryable: true,
        route: "/api/ingestion/bank-statement",
        payload: {
          file_name: file.name,
        },
      }).catch(() => null);
      await persistBatchAudit({
        ingestion_batch_id: `bank-statement:${documentId}`,
        total_rows: parsed.data.transactions.length,
        valid_rows: importedDebitCount,
        invalid_rows: invalidDebitCount + 1,
        duplicate_rows: duplicateDebitCount,
      });
      return {
        ok: false,
        code: "RAW_STORE_FAILED",
        message: "Statement lines could not be stored securely. Please retry.",
        retryable: true,
      };
    }
  }

  const totalCredits = analysis.totalCredits;
  const totalDebits = analysis.totalDebits;

  const { data: updated, error: updateError } = await supabase
    .from("financial_documents")
    .update({
      parse_status: "completed",
      parse_error: null,
      bank_name: parsed.data.bankName,
      account_holder_name: parsed.data.accountHolderName,
      account_number_masked: parsed.data.accountNumberMasked,
      currency: parsed.data.currency,
      statement_period_start: parsed.data.statementPeriodStart,
      statement_period_end: parsed.data.statementPeriodEnd,
      transaction_count: parsed.data.transactions.length,
      imported_debit_count: importedDebitCount,
      total_credits: totalCredits,
      total_debits: totalDebits,
      opening_balance: parsed.data.openingBalance,
      closing_balance: parsed.data.closingBalance,
      extracted_summary: analysis,
      processed_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("user_id", userId)
    .select("id,file_name,parse_status,parse_error,bank_name,account_holder_name,account_number_masked,statement_period_start,statement_period_end,transaction_count,imported_debit_count,total_credits,total_debits,opening_balance,closing_balance,processed_at,created_at,extracted_summary")
    .single<FinancialDocumentRow>();

  if (updateError || !updated) {
    await writeFailureState(supabase, userId, documentId, "The statement summary could not be finalized.");
    await writeFailedIngestionRecord(supabase, {
      user_id: userId,
      ingestion_batch_id: `bank-statement:${documentId}`,
      source_type: "bank",
      source_version: "1.0.0",
      reason: "The statement summary could not be finalized.",
      retryable: true,
      route: "/api/ingestion/bank-statement",
      payload: {
        file_name: file.name,
      },
    }).catch(() => null);
    await persistBatchAudit({
      ingestion_batch_id: `bank-statement:${documentId}`,
      total_rows: parsed.data.transactions.length,
      valid_rows: importedDebitCount,
      invalid_rows: invalidDebitCount + 1,
      duplicate_rows: duplicateDebitCount,
    });
    return {
      ok: false,
      code: "FINALIZE_FAILED",
      message: "The statement was parsed but the summary could not be finalized. Please retry.",
      retryable: true,
    };
  }

  logAuditEvent({
    event: "financial_document_uploaded",
    userId,
    route: "/api/ingestion/bank-statement",
    metadata: {
      documentId,
      statementRows: parsed.data.transactions.length,
      importedDebitCount,
    },
  });

  const durationMs = Date.now() - importStartedAt;
  const reconciliation = reconcileIngestionBatch({
    ingestion_batch_id: `bank-statement:${documentId}`,
    total_rows: parsed.data.transactions.length,
    imported_rows: importedDebitCount,
    duplicate_skips: duplicateDebitCount,
    failed_rows: invalidDebitCount,
    replay_differences: 0,
    audit_log: {
      valid_rows: importedDebitCount,
      invalid_rows: invalidDebitCount,
      duplicate_rows: duplicateDebitCount,
    },
  });

  recordImportDuration(durationMs);
  trackTelemetry("ingestion.bank_statement_import_completed", {
    source_type: "bank",
    ingestion_batch_id: `bank-statement:${documentId}`,
    total_rows: parsed.data.transactions.length,
    valid_rows: importedDebitCount,
    invalid_rows: invalidDebitCount,
    duplicate_rows: duplicateDebitCount,
    processing_duration_ms: durationMs,
  });
  trackTelemetry("ingestion.batch_reconciled", {
    ingestion_batch_id: reconciliation.ingestion_batch_id,
    imported_rows: reconciliation.imported_rows,
    duplicate_skips: reconciliation.duplicate_skips,
    failed_rows: reconciliation.failed_rows,
    replay_differences: reconciliation.replay_differences,
    unmatched_rows: reconciliation.unmatched_rows,
    audit_consistent: reconciliation.audit_log_consistency.audit_consistent,
  });

  await persistBatchAudit({
    ingestion_batch_id: `bank-statement:${documentId}`,
    total_rows: parsed.data.transactions.length,
    valid_rows: importedDebitCount,
    invalid_rows: invalidDebitCount,
    duplicate_rows: duplicateDebitCount,
  });

  return {
    ok: true,
    deduplicated: false,
    document: toDocumentSummary(updated),
  };
}

export const __test__ = {
  inferCategory,
  maskAccountNumber,
  parseWorkbook,
  parsePdfStatementLines,
  importDebitTransaction,
};
