"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { toUserSafeAuthErrorMessage } from "@/lib/auth-errors";
import { buildUpdatedUserMetadata } from "@/lib/consent";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toSafeInternalPath(pathLike: string, fallback: string) {
  return /^\/(?!\/)/.test(pathLike) ? pathLike : fallback;
}

async function getOriginFromHeaders() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (origin) {
    return origin;
  }

  const host = headerStore.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function signInWithPassword(formData: FormData) {
  enforceServerSecretPolicy();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    redirect("/sign-in?error=Email%20and%20password%20are%20required.");
  }

  if (!isValidEmail(email)) {
    redirect("/sign-in?error=Please%20enter%20a%20valid%20email%20address.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message = toUserSafeAuthErrorMessage(error.message);
    redirect(`/sign-in?error=${encodeURIComponent(message)}`);
  }

  redirect(toSafeInternalPath(nextPath, "/dashboard"));
}

export async function signUpWithPassword(formData: FormData) {
  enforceServerSecretPolicy();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/sign-up?error=Email%20and%20password%20are%20required.");
  }

  if (!isValidEmail(email)) {
    redirect("/sign-up?error=Please%20enter%20a%20valid%20email%20address.");
  }

  if (password.length < 8 || !password.trim()) {
    redirect("/sign-up?error=Password%20must%20be%20at%20least%208%20characters.");
  }

  const supabase = await createServerSupabaseClient();
  const emailRedirectTo = `${await getOriginFromHeaders()}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) {
    const message = toUserSafeAuthErrorMessage(error.message);
    redirect(`/sign-up?error=${encodeURIComponent(message)}`);
  }

  if (data.session) {
    redirect("/dashboard");
  }

  redirect(
    "/sign-in?message=Account%20created.%20Check%20your%20email%20to%20verify%20and%20continue.",
  );
}

export async function signInWithGoogle() {
  enforceServerSecretPolicy();

  const supabase = await createServerSupabaseClient();
  const redirectTo = `${await getOriginFromHeaders()}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    const message = toUserSafeAuthErrorMessage(error?.message);
    redirect(`/sign-in?error=${encodeURIComponent(message)}`);
  }

  redirect(data.url);
}

export async function signOut() {
  enforceServerSecretPolicy();

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?message=You%20have%20been%20signed%20out.");
}

export async function updateMessageReadingConsent(formData: FormData) {
  enforceServerSecretPolicy();

  const granted = String(formData.get("granted") ?? "false") === "true";
  const returnTo = String(formData.get("returnTo") ?? "/dashboard");
  const target = toSafeInternalPath(returnTo, "/dashboard");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?error=Please%20sign%20in%20to%20manage%20consent.");
  }

  const data = buildUpdatedUserMetadata(user.user_metadata, granted);
  const { error } = await supabase.auth.updateUser({ data });

  if (error) {
    const message = encodeURIComponent(
      "Could not update permission right now. Please try again.",
    );
    redirect(`${target}?error=${message}`);
  }

  const message = granted
    ? "Payment message reading permission enabled."
    : "Payment message reading permission revoked.";

  redirect(`${target}?message=${encodeURIComponent(message)}`);
}
