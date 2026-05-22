import { redirect } from "next/navigation";
import { AppShell } from "@/app/components/app-shell";
import { ChatClient } from "@/app/chat/chat-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ChatPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=/chat");
  }

  return (
    <AppShell active="/chat">
      <main className="app-content relative mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
        <header className="glass-card rounded-2xl border border-slate-300/20 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Finance Assistant</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-100 sm:text-3xl">Chat and ask finance questions</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Submit natural-language questions and receive responses grounded in your own recent transaction context.
          </p>
        </header>

        <ChatClient />
      </main>
    </AppShell>
  );
}
