import { runIngestionPipeline } from "@/shared/ingestion/index";

export type PaymentSource = "upi" | "card" | "wallet" | "bank" | "unknown";

export type ParseInput = {
  message: string;
  receivedAt?: string;
  sourceHint?: string;
};

export type ParsedTransaction = {
  amount: number;
  currency: "INR";
  merchant: string;
  source: PaymentSource;
  source_type: string;
  source_version: string;
  ingestion_schema_version: string;
  ingestion_pipeline_version: string;
  ingestion_batch_id: string;
  ingested_at: string;
  normalized_at: string;
  fingerprint: string;
  reference: string | null;
  timestamp: string;
  rawMessage: string;
};

export type ParseResult =
  | { ok: true; data: ParsedTransaction }
  | { ok: false; reason: string; retryable: boolean };

const amountPatterns = [
  /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /(?:debited|credited|paid|sent|spent)\s*(?:with|by|for)?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
];

const merchantPatterns = [
  /(?:to|at)\s+([a-z0-9 .&'-]{2,40})(?:\s+on|\s+via|\s+from|\.|,|$)/i,
  /(?:paid to|sent to)\s+([a-z0-9 .&'-]{2,40})(?:\s+on|\s+via|\.|,|$)/i,
  /from\s+([a-z0-9 .&'-]{2,40})(?:\s+on|\s+via|\.|,|$)/i,
];

const referencePattern =
  /(?:utr|ref(?:erence)?|txn(?:\s*id)?|transaction\s*id)[:\s#-]*([a-z0-9-]{6,40})/i;

const timestampPattern =
  /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:[,\s]+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?))?/i;

function normalizeAmount(raw: string) {
  const cleaned = raw.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Number(parsed.toFixed(2));
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferSource(message: string, sourceHint?: string): PaymentSource {
  const text = `${sourceHint ?? ""} ${message}`.toLowerCase();

  if (text.includes("upi") || /@[a-z]{2,6}\b/.test(text) || text.includes("utr")) {
    return "upi";
  }

  if (text.includes("credit card") || text.includes("debit card") || text.includes("card")) {
    return "card";
  }

  if (text.includes("wallet") || text.includes("paytm") || text.includes("phonepe") || text.includes("gpay")) {
    return "wallet";
  }

  if (text.includes("bank")) {
    return "bank";
  }

  return "unknown";
}

function parseTimestamp(message: string, receivedAt?: string) {
  if (receivedAt) {
    const parsed = new Date(receivedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const matched = message.match(timestampPattern);
  if (!matched) {
    return new Date().toISOString();
  }

  const datePart = matched[1];
  const timePart = matched[2] ?? "00:00";
  const normalizedDate = datePart.replace(/-/g, "/");
  const candidate = new Date(`${normalizedDate} ${timePart}`);

  if (Number.isNaN(candidate.getTime())) {
    return new Date().toISOString();
  }

  return candidate.toISOString();
}

export function parsePaymentMessage(input: ParseInput): ParseResult {
  const message = input.message?.trim();

  if (!message) {
    return { ok: false, reason: "Message text is missing.", retryable: false };
  }

  let amount: number | null = null;
  for (const pattern of amountPatterns) {
    const match = message.match(pattern);
    if (!match) {
      continue;
    }
    amount = normalizeAmount(match[1]);
    if (amount !== null) {
      break;
    }
  }

  if (amount === null) {
    return {
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    };
  }

  let merchant: string | null = null;
  for (const pattern of merchantPatterns) {
    const match = message.match(pattern);
    if (!match) {
      continue;
    }
    merchant = titleCase(match[1]);
    if (merchant.length > 1) {
      break;
    }
  }

  if (!merchant) {
    merchant = "Unknown Merchant";
  }

  const referenceMatch = message.match(referencePattern);
  const reference = referenceMatch ? referenceMatch[1].toUpperCase() : null;

  const source = inferSource(message, input.sourceHint);
  const timestamp = parseTimestamp(message, input.receivedAt);

  const piped = runIngestionPipeline(
    {
      merchant,
      amount,
      date: timestamp,
      reference,
    },
    {
      source_type: source,
      source_version: "1.0.0",
      ingested_at: input.receivedAt,
    },
  );

  return {
    ok: true,
    data: {
      amount: piped.normalized.amount,
      currency: "INR",
      merchant: piped.normalized.merchant,
      source,
      source_type: piped.normalized.source_type,
      source_version: piped.normalized.source_version,
      ingestion_schema_version: piped.normalized.ingestion_schema_version,
      ingestion_pipeline_version: piped.normalized.ingestion_pipeline_version,
      ingestion_batch_id: piped.normalized.ingestion_batch_id,
      ingested_at: piped.normalized.ingested_at,
      normalized_at: piped.normalized.normalized_at,
      fingerprint: piped.normalized.fingerprint,
      reference: piped.normalized.reference,
      timestamp,
      rawMessage: message,
    },
  };
}
