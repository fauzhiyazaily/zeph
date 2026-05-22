import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const headersMock = vi.fn();
const enforceServerSecretPolicyMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

describe("auth server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }));
  });

  it("redirects with safe validation error for invalid sign-in email", async () => {
    const { signInWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "not-an-email");
    formData.set("password", "password123");

    await expect(signInWithPassword(formData)).rejects.toThrow(
      "REDIRECT:/sign-in?error=Please%20enter%20a%20valid%20email%20address.",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("maps invalid login credentials to user-safe sign-in error", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ error: { message: "Invalid login credentials" } }),
      },
    });

    const { signInWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "demo@example.com");
    formData.set("password", "password123");

    await expect(signInWithPassword(formData)).rejects.toThrow(
      "REDIRECT:/sign-in?error=Invalid%20email%20or%20password.",
    );
  });

  it("falls back to dashboard when sign-in next path is unsafe", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    const { signInWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "demo@example.com");
    formData.set("password", "password123");
    formData.set("next", "https://evil.example.com");

    await expect(signInWithPassword(formData)).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects with safe validation error for invalid sign-up email", async () => {
    const { signUpWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "bad-email");
    formData.set("password", "password123");

    await expect(signUpWithPassword(formData)).rejects.toThrow(
      "REDIRECT:/sign-up?error=Please%20enter%20a%20valid%20email%20address.",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only sign-up passwords", async () => {
    const { signUpWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "demo@example.com");
    formData.set("password", "        ");

    await expect(signUpWithPassword(formData)).rejects.toThrow(
      "REDIRECT:/sign-up?error=Password%20must%20be%20at%20least%208%20characters.",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("maps duplicate user sign-up error to user-safe message", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signUp: vi
          .fn()
          .mockResolvedValue({ data: { session: null }, error: { message: "User already registered" } }),
      },
    });

    const { signUpWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "demo@example.com");
    formData.set("password", "password123");

    await expect(signUpWithPassword(formData)).rejects.toThrow(
      "REDIRECT:/sign-up?error=An%20account%20with%20this%20email%20already%20exists.%20Please%20sign%20in.",
    );
  });

  it("redirects to dashboard when sign-up returns an active session", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null }),
      },
    });

    const { signUpWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "demo@example.com");
    formData.set("password", "password123");

    await expect(signUpWithPassword(formData)).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects to sign-in verification message when sign-up needs email confirmation", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    });

    const { signUpWithPassword } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("email", "demo@example.com");
    formData.set("password", "password123");

    await expect(signUpWithPassword(formData)).rejects.toThrow(
      "REDIRECT:/sign-in?message=Account%20created.%20Check%20your%20email%20to%20verify%20and%20continue.",
    );
  });

  it("redirects to provider URL for successful Google OAuth", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: "https://accounts.google.com/o/oauth2/v2/auth" },
          error: null,
        }),
      },
    });

    const { signInWithGoogle } = await import("@/app/(auth)/actions");

    await expect(signInWithGoogle()).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/o/oauth2/v2/auth",
    );
  });

  it("maps OAuth errors to user-safe sign-in message", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signInWithOAuth: vi
          .fn()
          .mockResolvedValue({ data: { url: null }, error: { message: "invalid login credentials" } }),
      },
    });

    const { signInWithGoogle } = await import("@/app/(auth)/actions");

    await expect(signInWithGoogle()).rejects.toThrow(
      "REDIRECT:/sign-in?error=Invalid%20email%20or%20password.",
    );
  });

  it("invalidates local session and redirects on sign out", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signOut: signOutMock,
      },
    });

    const { signOut } = await import("@/app/(auth)/actions");

    await expect(signOut()).rejects.toThrow(
      "REDIRECT:/sign-in?message=You%20have%20been%20signed%20out.",
    );
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("persists granted message-reading consent and redirects with confirmation", async () => {
    const updateUserMock = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: {} } },
        }),
        updateUser: updateUserMock,
      },
    });

    const { updateMessageReadingConsent } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("granted", "true");
    formData.set("returnTo", "/settings/privacy");

    await expect(updateMessageReadingConsent(formData)).rejects.toThrow(
      "REDIRECT:/settings/privacy?message=Payment%20message%20reading%20permission%20enabled.",
    );
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it("persists revoked message-reading consent and redirects with confirmation", async () => {
    const updateUserMock = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: {} } },
        }),
        updateUser: updateUserMock,
      },
    });

    const { updateMessageReadingConsent } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("granted", "false");
    formData.set("returnTo", "/onboarding/consent");

    await expect(updateMessageReadingConsent(formData)).rejects.toThrow(
      "REDIRECT:/onboarding/consent?message=Payment%20message%20reading%20permission%20revoked.",
    );
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it("blocks consent update when user is unauthenticated", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { updateMessageReadingConsent } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("granted", "true");
    formData.set("returnTo", "/settings/privacy");

    await expect(updateMessageReadingConsent(formData)).rejects.toThrow(
      "REDIRECT:/sign-in?error=Please%20sign%20in%20to%20manage%20consent.",
    );
  });

  it("sanitizes non-local returnTo on consent update error path", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", user_metadata: {} } },
        }),
        updateUser: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
      },
    });

    const { updateMessageReadingConsent } = await import("@/app/(auth)/actions");
    const formData = new FormData();
    formData.set("granted", "true");
    formData.set("returnTo", "https://evil.example.com");

    await expect(updateMessageReadingConsent(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?error=Could%20not%20update%20permission%20right%20now.%20Please%20try%20again.",
    );
  });
});
