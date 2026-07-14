import { getOrthogonalClient } from "@/lib/orthogonal/client";
import { OrthogonalError } from "@/lib/orthogonal/errors";
import { usdToCents } from "@/lib/tools/spend";

/**
 * Speech ↔ text through Orthogonal's catalog (ElevenLabs), verified against the
 * live API:
 *   - STT: POST elevenlabs /v1/speech-to-text — takes `source_url` (a URL the
 *     provider fetches; inline file bytes are NOT accepted by /v1/run). ~3¢.
 *   - TTS: POST elevenlabs /v1/text-to-speech/{voice_id} — returns audio as a
 *     base64 envelope { _binary, encoding, contentType, data }. ~8¢.
 * These are ordinary request/response calls, so they ride /v1/run cleanly and
 * keep the whole voice feature on the single Orthogonal key.
 */

const STT_MODEL = "scribe_v1";
const TTS_MODEL = "eleven_turbo_v2_5"; // low-latency model, good for voice
const TTS_OUTPUT = "mp3_44100_128";

export interface TranscribeResult {
  ok: boolean;
  text: string;
  costCents: number;
  error?: string;
}

export interface SynthesizeResult {
  ok: boolean;
  audioBase64: string;
  mime: string;
  costCents: number;
  error?: string;
}

/** Transcribe audio at `sourceUrl` (must be publicly fetchable by the provider). */
export async function transcribe(sourceUrl: string): Promise<TranscribeResult> {
  try {
    const res = await getOrthogonalClient().run<{ text?: string }>({
      api: "elevenlabs",
      path: "/v1/speech-to-text",
      body: { model_id: STT_MODEL, source_url: sourceUrl },
    });
    return {
      ok: true,
      text: (res.data?.text ?? "").trim(),
      costCents: res.priceCents ?? 3,
    };
  } catch (e) {
    const msg = e instanceof OrthogonalError ? e.userMessage : (e as Error).message;
    return { ok: false, text: "", costCents: 0, error: msg };
  }
}

/** Synthesize `text` to speech with the given ElevenLabs voice id. */
export async function synthesize(text: string, voiceId: string): Promise<SynthesizeResult> {
  try {
    const res = await getOrthogonalClient().run<{
      data?: string;
      contentType?: string;
      encoding?: string;
    }>({
      api: "elevenlabs",
      path: `/v1/text-to-speech/${voiceId}`,
      query: { output_format: TTS_OUTPUT },
      body: { text, model_id: TTS_MODEL },
    });
    return {
      ok: true,
      audioBase64: res.data?.data ?? "",
      mime: res.data?.contentType ?? "audio/mpeg",
      costCents: res.priceCents ?? 8,
    };
  } catch (e) {
    const msg = e instanceof OrthogonalError ? e.userMessage : (e as Error).message;
    return { ok: false, audioBase64: "", mime: "audio/mpeg", costCents: 0, error: msg };
  }
}

// Re-exported so callers can convert catalog prices consistently if needed.
export { usdToCents };
