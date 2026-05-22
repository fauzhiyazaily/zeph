export type ChatSubmissionStatus = "idle" | "pending" | "success" | "failure";

export type ChatSubmissionState = {
  status: ChatSubmissionStatus;
  answer: string | null;
  error: string | null;
  retryGuidance: string | null;
};

export type ChatSubmissionEvent =
  | { type: "submit" }
  | { type: "succeed"; answer: string }
  | { type: "fail"; error: string; retryGuidance?: string }
  | { type: "reset" };

export const initialChatSubmissionState: ChatSubmissionState = {
  status: "idle",
  answer: null,
  error: null,
  retryGuidance: null,
};

export function reduceChatSubmissionState(
  state: ChatSubmissionState,
  event: ChatSubmissionEvent,
): ChatSubmissionState {
  if (event.type === "submit") {
    return {
      status: "pending",
      answer: null,
      error: null,
      retryGuidance: null,
    };
  }

  if (event.type === "succeed") {
    return {
      status: "success",
      answer: event.answer,
      error: null,
      retryGuidance: null,
    };
  }

  if (event.type === "fail") {
    return {
      status: "failure",
      answer: null,
      error: event.error,
      retryGuidance: event.retryGuidance ?? "Retry in a few seconds, or ask a narrower follow-up question.",
    };
  }

  return {
    ...state,
    status: "idle",
    error: null,
    retryGuidance: null,
  };
}
