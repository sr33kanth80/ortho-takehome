import { env, hasVoice } from "@/lib/env";
import { createVoiceSession } from "@/lib/voice/session-store";
import { VOICE_TOOL_DEFS } from "@/lib/voice/tools";
import { VOICE_INSTRUCTIONS } from "@/lib/voice/config";

/**
 * POST /api/voice/session — start a "Talk to Meridian" session.
 *
 * Provider-aware:
 *  - "orthogonal" (default): push-to-talk. Returns a sessionId + caps; the
 *    browser records audio and posts it to /api/voice/turn. No extra key —
 *    speech runs through the same Orthogonal key as everything else.
 *  - "xai": realtime Grok Voice. Mints an ephemeral xAI token for a direct
 *    WebRTC connection. (Needs XAI_API_KEY; see NOTE below.)
 *
 * Degrades gracefully: `configured: false` when the required key is missing.
 */
export async function POST() {
  if (!hasVoice()) {
    return Response.json(
      {
        configured: false,
        error:
          env.voice.provider === "xai"
            ? "Voice is not configured (set XAI_API_KEY)."
            : "Voice is not configured (ORTHOGONAL_API_KEY missing).",
      },
      { status: 503 },
    );
  }

  const session = createVoiceSession();
  const caps = {
    maxSessionSeconds: env.voice.maxSessionSeconds,
    maxSpendCents: env.voice.maxSpendCents,
  };

  if (env.voice.provider === "orthogonal") {
    return Response.json({ configured: true, provider: "orthogonal", sessionId: session.id, caps });
  }

  // provider === "xai" — mint an ephemeral realtime token.
  // NOTE: the mint shape follows xAI's documented OpenAI-Realtime-compatible
  // endpoint; verify against docs.x.ai when a key is available.
  try {
    const res = await fetch("https://api.x.ai/v1/realtime/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.voice.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.voice.model, voice: env.voice.voice }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { configured: true, error: `xAI session mint failed (${res.status}): ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { client_secret?: { value?: string; expires_at?: number } };
    const value = data.client_secret?.value;
    if (!value) {
      return Response.json({ configured: true, error: "xAI session response missing client_secret." }, { status: 502 });
    }
    return Response.json({
      configured: true,
      provider: "xai",
      sessionId: session.id,
      token: value,
      expiresAt: data.client_secret?.expires_at,
      model: env.voice.model,
      voice: env.voice.voice,
      instructions: VOICE_INSTRUCTIONS,
      tools: VOICE_TOOL_DEFS,
      caps,
    });
  } catch (e) {
    return Response.json({ configured: true, error: `Could not reach xAI: ${(e as Error).message}` }, { status: 502 });
  }
}

/** GET — capability probe for the UI. */
export function GET() {
  return Response.json({ configured: hasVoice(), provider: env.voice.provider });
}
