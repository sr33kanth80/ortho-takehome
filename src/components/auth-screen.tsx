"use client";

import { FormEvent, useState } from "react";

export function AuthScreen({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWorking(true);
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not continue.");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="relative flex min-h-full flex-1 items-center justify-center overflow-y-auto px-6 py-16">
      <div className="absolute inset-0 -z-10 meridian-paper-grid opacity-60" aria-hidden />
      <section className="w-full max-w-[430px] rounded-[20px] border border-[var(--border)] bg-[var(--bg-raised)] p-7 shadow-[0_16px_60px_rgba(10,65,54,0.08)] sm:p-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Meridian account</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[40px] leading-[0.98] text-[var(--color-forest-ink)]">
          Keep the thread.
        </h1>
        <p className="mt-4 text-[15px] leading-[1.5] text-[var(--ink-dim)]">
          Sign in to keep your research, costs, and live-data conversations attached to you.
        </p>

        {!configured ? (
          <div className="mt-7 rounded-[10px] border border-[var(--border)] bg-[var(--bg-sidebar)] px-4 py-3 text-[14px] leading-[1.45] text-[var(--ink-dim)]">
            Meridian needs a <code>DATABASE_URL</code> before accounts and saved conversations can be enabled.
          </div>
        ) : (
          <form className="mt-7 space-y-4" onSubmit={submit}>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--ink-dim)]">Email</span>
              <input className="meridian-auth-input" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--ink-dim)]">Password</span>
              <input className="meridian-auth-input" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required />
              {mode === "register" && <span className="mt-1.5 block text-[11px] text-[var(--ink-faint)]">At least 10 characters.</span>}
            </label>
            {error && <p className="rounded-[8px] bg-[#f6e9e4] px-3 py-2 text-[13px] text-[var(--err)]">{error}</p>}
            <button className="meridian-primary-button mt-2 w-full justify-center" disabled={working} type="submit">
              {working ? "Preparing your kitchen..." : mode === "login" ? "Open Meridian" : "Create account"} <span aria-hidden>→</span>
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[13px] text-[var(--ink-dim)]">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button className="font-medium text-[var(--accent)] underline underline-offset-2" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}
