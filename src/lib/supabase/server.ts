import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { enforceServerSecretPolicy } from "@/lib/security/baseline";

export async function createServerSupabaseClient() {
  enforceServerSecretPolicy();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase public environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // In Server Components, Next.js disallows cookie mutation.
            // Middleware and Server Actions are responsible for persisting refresh cookies.
          }
        });
      },
    },
  });
}
