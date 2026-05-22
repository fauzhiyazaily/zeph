import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Prevent "server-only" import from throwing in the test environment.
import "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

// Import after mock is registered.
const { enforceServerSecretPolicy, getServerSecret } = await import(
  "@/lib/security/baseline"
);

const VALID_ENV: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY: "srv-role-secret",
  ANTHROPIC_API_KEY: "anthropic-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
};

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("enforceServerSecretPolicy", () => {
  beforeEach(() => setEnv(VALID_ENV));

  afterEach(() => {
    setEnv({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: undefined,
      NEXT_PUBLIC_ANTHROPIC_API_KEY: undefined,
    });
  });

  it("passes when env is correctly configured", () => {
    expect(() => enforceServerSecretPolicy()).not.toThrow();
  });

  it("throws when NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = "leaked";
    expect(() => enforceServerSecretPolicy()).toThrow(/sensitive keys must never use NEXT_PUBLIC prefix/);
    expect(() => enforceServerSecretPolicy()).toThrow(
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"
    );
  });

  it("throws when NEXT_PUBLIC_ANTHROPIC_API_KEY is set", () => {
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY = "leaked";
    expect(() => enforceServerSecretPolicy()).toThrow(/sensitive keys must never use NEXT_PUBLIC prefix/);
    expect(() => enforceServerSecretPolicy()).toThrow(
      "NEXT_PUBLIC_ANTHROPIC_API_KEY"
    );
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => enforceServerSecretPolicy()).toThrow(
      /required server secret is missing: SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => enforceServerSecretPolicy()).toThrow(
      /required server secret is missing: ANTHROPIC_API_KEY/
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL uses http in a non-local environment", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://production.supabase.co";
    expect(() => enforceServerSecretPolicy()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL must use https/
    );
  });

  it("allows localhost http URL without throwing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    expect(() => enforceServerSecretPolicy()).not.toThrow();
  });

  it("allows 127.0.0.1 URL without throwing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(() => enforceServerSecretPolicy()).not.toThrow();
  });
});

describe("getServerSecret", () => {
  beforeEach(() => setEnv(VALID_ENV));

  afterEach(() => {
    setEnv({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
    });
  });

  it("returns the value for SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(getServerSecret("SUPABASE_SERVICE_ROLE_KEY")).toBe("srv-role-secret");
  });

  it("returns the value for ANTHROPIC_API_KEY", () => {
    expect(getServerSecret("ANTHROPIC_API_KEY")).toBe("anthropic-secret");
  });

  it("throws when the requested secret is not set", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getServerSecret("SUPABASE_SERVICE_ROLE_KEY")).toThrow(
      /Missing required server secret: SUPABASE_SERVICE_ROLE_KEY/
    );
  });
});
