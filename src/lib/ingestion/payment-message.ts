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
  /from\s+([a-z0-9 .&'@_-]{2,80})(?:\s+on|\s+via|\s+using|\.|,|$)/i,
  /(?:paid to|sent to|you paid(?:\s+(?:inr|rs\.?|₹)?\s*[0-9,]+(?:\.[0-9]{1,2})?\s*to)?)\s+([a-z0-9 .&'@_-]{2,80})(?:\s+on|\s+via|\s+using|\.|,|$)/i,
  /(?:to|at)\s+([a-z0-9 .&'@_-]{2,80})(?:\s+on|\s+via|\s+using|\s+from|\.|,|$)/i,
];

const referencePattern =
  /(?:utr|ref(?:erence)?(?:\s*no\.?)?|txn(?:\s*id)?|transaction\s*id)[:\s#-]*([a-z0-9-]{6,40})/i;

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

function normalizeMerchant(raw: string) {
  const withoutVpa = raw.replace(/@[a-z0-9._-]+/gi, "");
  const withoutTrailingQualifiers = withoutVpa
    .replace(/\b(?:via|using|txn(?:\s*id)?|transaction\s*id|utr|ref(?:erence)?|ref\s*no)\b.*$/i, "")
    .replace(/^your\s+account\s+from\s+/i, "")
    .trim();

  if (!withoutTrailingQualifiers) {
    return null;
  }

  return titleCase(withoutTrailingQualifiers);
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

function parseDatePart(datePart: string) {
  const matched = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!matched) {
    return null;
  }

  const left = Number.parseInt(matched[1], 10);
  const right = Number.parseInt(matched[2], 10);
  const year = Number.parseInt(matched[3].length === 2 ? `20${matched[3]}` : matched[3], 10);

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(year)) {
    return null;
  }

  // Prefer day/month for Indian payment-message formats; swap when obviously month/day.
  const day = left > 12 ? left : right > 12 ? right : left;
  const month = left > 12 ? right : right > 12 ? left : right;

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  return { year, month, day };
}

function parseTimePart(timePart: string) {
  const matched = timePart.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!matched) {
    return null;
  }

  let hour = Number.parseInt(matched[1], 10);
  const minute = Number.parseInt(matched[2], 10);
  const second = matched[3] ? Number.parseInt(matched[3], 10) : 0;
  const meridiem = matched[4];

  if ([hour, minute, second].some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    hour = hour % 12;
    if (meridiem === "pm") {
      hour += 12;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  if (minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  return { hour, minute, second };
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
    return null;
  }

  const datePart = matched[1];
  const timePart = matched[2] ?? "00:00";
  const parsedDate = parseDatePart(datePart);
  const parsedTime = parseTimePart(timePart);

  if (!parsedDate || !parsedTime) {
    return null;
  }

  const candidate = new Date(
    Date.UTC(
      parsedDate.year,
      parsedDate.month - 1,
      parsedDate.day,
      parsedTime.hour,
      parsedTime.minute,
      parsedTime.second,
    ),
  );

  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  if (
    candidate.getUTCFullYear() !== parsedDate.year
    || candidate.getUTCMonth() !== parsedDate.month - 1
    || candidate.getUTCDate() !== parsedDate.day
    || candidate.getUTCHours() !== parsedTime.hour
    || candidate.getUTCMinutes() !== parsedTime.minute
    || candidate.getUTCSeconds() !== parsedTime.second
  ) {
    return null;
  }

  return candidate.toISOString();
}

export function parsePaymentMessage(input: ParseInput): ParseResult {
  const message = input.message?.trim();
  const normalizedReceivedAt = (() => {
    if (!input.receivedAt) {
      return undefined;
    }

    const parsed = new Date(input.receivedAt);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  })();

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
    merchant = normalizeMerchant(match[1]);
    if (merchant && merchant.length > 1) {
      break;
    }
  }

  if (!merchant) {
    return {
      ok: false,
      reason: "Could not parse merchant or payee from payment message.",
      retryable: false,
    };
  }

  const referenceMatch = message.match(referencePattern);
  const reference = referenceMatch ? referenceMatch[1].toUpperCase() : null;

  const source = inferSource(message, input.sourceHint);
  const timestamp = parseTimestamp(message, normalizedReceivedAt);
  if (!timestamp) {
    return {
      ok: false,
      reason: "Could not parse timestamp from payment message.",
      retryable: false,
    };
  }

  let piped: ReturnType<typeof runIngestionPipeline>;
  try {
    piped = runIngestionPipeline(
      {
        merchant,
        amount,
        date: timestamp,
        reference,
      },
      {
        source_type: source,
        source_version: "1.0.0",
        ingested_at: normalizedReceivedAt,
      },
    );
  } catch {
    return {
      ok: false,
      reason: "Normalization pipeline failed for payment message.",
      retryable: true,
    };
  }

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
