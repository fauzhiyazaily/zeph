import { describe, expect, it } from "vitest";
import {
  initialChatSubmissionState,
  reduceChatSubmissionState,
} from "@/lib/chat/submission-state";

describe("chat submission state transitions", () => {
  it("moves to pending when submit starts", () => {
    const next = reduceChatSubmissionState(initialChatSubmissionState, { type: "submit" });

    expect(next).toEqual({
      status: "pending",
      answer: null,
      error: null,
      retryGuidance: null,
    });
  });

  it("moves to success with answer when request resolves", () => {
    const pending = reduceChatSubmissionState(initialChatSubmissionState, { type: "submit" });
    const next = reduceChatSubmissionState(pending, {
      type: "succeed",
      answer: "You spent 1200 this week.",
    });

    expect(next).toEqual({
      status: "success",
      answer: "You spent 1200 this week.",
      error: null,
      retryGuidance: null,
    });
  });

  it("moves to failure with message when request fails", () => {
    const pending = reduceChatSubmissionState(initialChatSubmissionState, { type: "submit" });
    const next = reduceChatSubmissionState(pending, {
      type: "fail",
      error: "Service unavailable.",
      retryGuidance: "Please retry shortly.",
    });

    expect(next).toEqual({
      status: "failure",
      answer: null,
      error: "Service unavailable.",
      retryGuidance: "Please retry shortly.",
    });
  });

  it("uses default retry guidance when none is provided", () => {
    const pending = reduceChatSubmissionState(initialChatSubmissionState, { type: "submit" });
    const next = reduceChatSubmissionState(pending, {
      type: "fail",
      error: "Timeout",
    });

    expect(next.retryGuidance).toBe(
      "Retry in a few seconds, or ask a narrower follow-up question.",
    );
  });
});
