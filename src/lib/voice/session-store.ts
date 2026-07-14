import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { SpendTracker } from "@/lib/tools/spend";

/**
 * In-memory registry of active voice sessions. Each holds its own SpendTracker
 * so the per-session budget accumulates across every tool call in the
 * conversation, and a start time so the caller can enforce the time cap.
 *
 * Process-local (like the conversation fallback store): fine for a single
 * instance; a multi-instance deployment would move this to Redis so the cap is
 * global. Sessions are swept after they exceed their time cap + a grace window.
 */
export interface VoiceTurn {
  role: "user" | "assistant";
  content: string;
}

interface VoiceSession {
  id: string;
  spend: SpendTracker;
  startedAt: number;
  /** Plain-text conversation history for multi-turn context. */
  history: VoiceTurn[];
}

const store: Map<string, VoiceSession> = ((
  globalThis as typeof globalThis & { __meridianVoice?: Map<string, VoiceSession> }
).__meridianVoice ??= new Map());

function sweep() {
  const graceMs = (env.voice.maxSessionSeconds + 60) * 1000;
  const now = Date.now();
  for (const [id, s] of store) {
    if (now - s.startedAt > graceMs) store.delete(id);
  }
}

export function createVoiceSession(): VoiceSession {
  sweep();
  const id = nanoid(16);
  const session: VoiceSession = {
    id,
    spend: new SpendTracker(env.voice.maxSpendCents),
    startedAt: Date.now(),
    history: [],
  };
  store.set(id, session);
  return session;
}

export function getVoiceSession(id: string): VoiceSession | undefined {
  return store.get(id);
}

export function endVoiceSession(id: string): void {
  store.delete(id);
}

/** True once a session has run past its hard time cap. */
export function isExpired(session: VoiceSession): boolean {
  return Date.now() - session.startedAt > env.voice.maxSessionSeconds * 1000;
}
