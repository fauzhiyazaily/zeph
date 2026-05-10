import "server-only";

const FORBIDDEN_PUBLIC_SECRET_KEYS = [
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_ANTHROPIC_API_KEY",
] as const;

const REQUIRED_SERVER_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;

function isLocalhostUrl(value: string) {
  return value.includes("localhost") || value.includes("127.0.0.1");
}

export function enforceServerSecretPolicy() {
  const leakedKeys = FORBIDDEN_PUBLIC_SECRET_KEYS.filter(
    (key) => Boolean(process.env[key]),
  );

  if (leakedKeys.length > 0) {
    throw new Error(
      `Security policy violation: sensitive keys must never use NEXT_PUBLIC prefix: ${leakedKeys.join(", ")}`,
    );
  }

  REQUIRED_SERVER_SECRETS.forEach((key) => {
    const value = process.env[key];
    if (!value) {
      throw new Error(
        `Security policy violation: required server secret is missing: ${key}`,
      );
    }
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith("https://") && !isLocalhostUrl(supabaseUrl)) {
    throw new Error(
      "Security policy violation: NEXT_PUBLIC_SUPABASE_URL must use https in non-local environments.",
    );
  }
}

export function getServerSecret(name: (typeof REQUIRED_SERVER_SECRETS)[number]) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server secret: ${name}`);
  }
  return value;
}
