const DEFAULT_AUTH_ERROR =
  "We couldn't complete your request. Please check your details and try again.";

export function toUserSafeAuthErrorMessage(message: string | null | undefined) {
  if (!message) {
    return DEFAULT_AUTH_ERROR;
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (normalized.includes("user already registered")) {
    return "An account with this email already exists. Please sign in.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }

  if (normalized.includes("password")) {
    return "Password does not meet security requirements.";
  }

  return DEFAULT_AUTH_ERROR;
}
