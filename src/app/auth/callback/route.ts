import { NextResponse } from "next/server";
import { toUserSafeAuthErrorMessage } from "@/lib/auth-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    const redirectUrl = new URL("/sign-in", requestUrl.origin);
    redirectUrl.searchParams.set("error", "Authentication callback is missing code.");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectUrl = new URL("/sign-in", requestUrl.origin);
    redirectUrl.searchParams.set(
      "error",
      toUserSafeAuthErrorMessage(error.message),
    );
    return NextResponse.redirect(redirectUrl);
  }

  const redirectUrl = new URL(
    nextPath.startsWith("/") ? nextPath : "/dashboard",
    requestUrl.origin,
  );
  return NextResponse.redirect(redirectUrl);
}
