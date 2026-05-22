import { describe, expect, it } from "vitest";
import { parsePaymentMessage } from "@/lib/ingestion/payment-message";

describe("parsePaymentMessage", () => {
  it("parses and normalizes a valid payment alert", () => {
    const result = parsePaymentMessage({
      message:
        "INR 1,250.50 debited via UPI to starbucks on 22/05/2026 10:30 ref UTR1234567",
      sourceHint: "sms",
      receivedAt: "2026-05-22T10:35:00.000Z",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.amount).toBe(1250.5);
    expect(result.data.currency).toBe("INR");
    expect(result.data.merchant).toBe("starbucks");
    expect(result.data.source).toBe("upi");
    expect(result.data.reference).toBe("UTR1234567");
    expect(result.data.timestamp).toBe("2026-05-22T10:35:00.000Z");
    expect(result.data.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parses timestamp from message when receivedAt is missing", () => {
    const result = parsePaymentMessage({
      message: "INR 250 debited to metro card on 22/05/2026 10:30 ref UTR991122",
      sourceHint: "sms",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.timestamp).toBe("2026-05-22T10:30:00.000Z");
  });

  it("returns a non-retryable failure when amount is not parseable", () => {
    const result = parsePaymentMessage({
      message: "Payment successful at coffee shop.",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });
  });

  it("returns a non-retryable failure when merchant or payee is not parseable", () => {
    const result = parsePaymentMessage({
      message: "INR 899 debited on 22/05/2026 10:30. Ref UTR1234567",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse merchant or payee from payment message.",
      retryable: false,
    });
  });

  it("returns a non-retryable failure when message text is missing", () => {
    const result = parsePaymentMessage({
      message: "   ",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Message text is missing.",
      retryable: false,
    });
  });

  it("returns a non-retryable failure when timestamp is not parseable", () => {
    const result = parsePaymentMessage({
      message: "INR 899 debited to swiggy on 42/99/2026 at now ref UTR1234567",
      sourceHint: "sms",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse timestamp from payment message.",
      retryable: false,
    });
  });

  it("returns a non-retryable failure for invalid 12-hour timestamps", () => {
    const result = parsePaymentMessage({
      message: "INR 899 debited to swiggy on 22/05/2026 24:30 pm ref UTR1234567",
      sourceHint: "sms",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse timestamp from payment message.",
      retryable: false,
    });
  });

  it("returns a non-retryable failure for impossible calendar dates", () => {
    const result = parsePaymentMessage({
      message: "INR 899 debited to swiggy on 31/02/2026 10:30 ref UTR1234567",
      sourceHint: "sms",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse timestamp from payment message.",
      retryable: false,
    });
  });

  it("parses an HDFC UPI debit format", () => {
    const result = parsePaymentMessage({
      message:
        "HDFC Bank: Rs 450.00 debited from a/c XX1234 on 22-05-26 to ZOMATO via UPI Ref no 63411928371",
      sourceHint: "sms",
      receivedAt: "2026-05-22T11:30:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.amount).toBe(450);
    expect(result.data.merchant).toBe("zomato");
    expect(result.data.source).toBe("upi");
    expect(result.data.reference).toBe("63411928371");
  });

  it("parses an SBI card spend alert format", () => {
    const result = parsePaymentMessage({
      message:
        "SBI: INR 2,399 spent on your debit card at AMAZON SELLER SERVICES txn id 91AF74K2 on 22/05/2026 09:12",
      sourceHint: "sms",
      receivedAt: "2026-05-22T09:12:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.amount).toBe(2399);
    expect(result.data.merchant).toBe("amazon seller services");
    expect(result.data.source).toBe("card");
    expect(result.data.reference).toBe("91AF74K2");
  });

  it("parses an ICICI credit alert format", () => {
    const result = parsePaymentMessage({
      message:
        "ICICI Bank: INR 5,000.00 credited to your account from ACME PAYROLL on 22/05/2026 UTR: N32519A7B1",
      sourceHint: "sms",
      receivedAt: "2026-05-22T07:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.amount).toBe(5000);
    expect(result.data.merchant).toBe("acme payroll");
    expect(result.data.reference).toBe("N32519A7B1");
    expect(result.data.source).toBe("upi");
  });

  it("parses a PhonePe wallet debit format", () => {
    const result = parsePaymentMessage({
      message:
        "PhonePe alert: ₹899 paid to SWIGGY using wallet on 22/05/2026. Transaction ID: T2026PP778811",
      sourceHint: "phonepe",
      receivedAt: "2026-05-22T14:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.amount).toBe(899);
    expect(result.data.merchant).toBe("swiggy");
    expect(result.data.source).toBe("wallet");
    expect(result.data.reference).toBe("T2026PP778811");
  });

  it("parses a GPay UPI transfer format", () => {
    const result = parsePaymentMessage({
      message:
        "GPay: You paid INR 175 to MYNTRA@okaxis via UPI. UTR 206653771123. 22/05/2026 18:45",
      sourceHint: "gpay",
      receivedAt: "2026-05-22T18:46:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.amount).toBe(175);
    expect(result.data.merchant).toBe("myntra");
    expect(result.data.source).toBe("upi");
    expect(result.data.reference).toBe("206653771123");
  });

  it("rejects malformed HDFC format without amount as non-retryable", () => {
    const result = parsePaymentMessage({
      message:
        "HDFC Bank: debited from a/c XX1234 on 22-05-26 to ZOMATO via UPI Ref no 63411928371",
      sourceHint: "sms",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });
  });

  it("rejects malformed SBI card format without amount as non-retryable", () => {
    const result = parsePaymentMessage({
      message:
        "SBI: spent on your debit card at AMAZON SELLER SERVICES txn id 91AF74K2 on 22/05/2026 09:12",
      sourceHint: "sms",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });
  });

  it("rejects malformed ICICI credit format without amount as non-retryable", () => {
    const result = parsePaymentMessage({
      message:
        "ICICI Bank: credited to your account from ACME PAYROLL on 22/05/2026 UTR: N32519A7B1",
      sourceHint: "sms",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });
  });

  it("rejects malformed PhonePe format without amount as non-retryable", () => {
    const result = parsePaymentMessage({
      message:
        "PhonePe alert: paid to SWIGGY using wallet on 22/05/2026. Transaction ID: T2026PP778811",
      sourceHint: "phonepe",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });
  });

  it("rejects malformed GPay format without amount as non-retryable", () => {
    const result = parsePaymentMessage({
      message:
        "GPay: You paid to MYNTRA@okaxis via UPI. UTR 206653771123. 22/05/2026 18:45",
      sourceHint: "gpay",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Could not parse amount from payment message.",
      retryable: false,
    });
  });
});
