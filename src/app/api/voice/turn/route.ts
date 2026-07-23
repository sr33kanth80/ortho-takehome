import { stepCountIs, streamText, type ModelMessage } from "ai";
import { env } from "@/lib/env";
import { getModel } from "@/lib/llm";
import { createTools } from "@/lib/tools";
import { getVoiceSession, isExpired } from "@/lib/voice/session-store";
import { putAudio, deleteAudio } from "@/lib/voice/audio-store";
import { transcribe, synthesize } from "@/lib/voice/orthogonal-audio";
import { VOICE_INSTRUCTIONS } from "@/lib/voice/config";
import { getCurrentUser } from "@/lib/auth";

export const maxDuration = 120;

/**
 * POST /api/voice/turn — one push-to-talk turn (multipart: sessionId + audio).
 *
 * Chains three Orthogonal calls around the existing text agent, all billed to
 * the session's SpendTracker:
 *   1. host the clip → speech-to-text (source_url)  → user's words
 *   2. run the agent (same tools + budget as chat)  → the answer
 *   3. text-to-speech                               → spoken reply
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form-data" }, { status: 400 });
  }
  const sessionId = form.get("sessionId");
  const file = form.get("audio");
  if (typeof sessionId !== "string" || !(file instanceof File)) {
    return Response.json({ error: "sessionId and audio are required" }, { status: 400 });
  }

  const session = getVoiceSession(sessionId);
  if (!session) return Response.json({ error: "Unknown or expired voice session" }, { status: 404 });
  if (session.userId !== user.id) return Response.json({ error: "Unknown or expired voice session" }, { status: 404 });
  if (isExpired(session)) {
    return Response.json({ ended: true, text: "This call has reached its time limit." });
  }
  if (session.spend.remainingCents <= 0) {
    return Response.json({
      transcript: "",
      text: "This call has reached its spending limit, so I can't make more lookups.",
      totalCents: session.spend.totalCents,
      ended: true,
    });
  }

  const before = session.spend.totalCents;

  // 1. Host the recording, then transcribe it from its public URL.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const audioId = putAudio(bytes, file.type || "audio/webm");
  const base = process.env.VOICE_PUBLIC_BASE_URL || new URL(req.url).origin;
  const sourceUrl = `${base}/api/voice/audio/${audioId}`;

  let transcript = "";
  try {
    const stt = await transcribe(sourceUrl);
    if (!stt.ok) {
      return Response.json({ error: `Transcription failed: ${stt.error}` }, { status: 502 });
    }
    session.spend.record("elevenlabs", "/v1/speech-to-text", stt.costCents);
    transcript = stt.text;
  } finally {
    deleteAudio(audioId);
  }

  if (!transcript) {
    return Response.json({ transcript: "", text: "I didn't catch that — could you say it again?", totalCents: session.spend.totalCents });
  }

  // 2. Run the agent with full session context and the real tool layer.
  session.history.push({ role: "user", content: transcript });
  const messages: ModelMessage[] = session.history.map((t) => ({ role: t.role, content: t.content }));

  let answer = "";
  const tools: string[] = [];
  try {
    const result = streamText({
      model: getModel(),
      system: VOICE_INSTRUCTIONS,
      messages,
      tools: createTools(session.spend, { userId: session.userId, companyId: session.companyId }),
      stopWhen: stepCountIs(env.guards.maxAgentSteps),
      onError: ({ error }) => console.error("[voice] agent error:", error),
    });
    answer = (await result.text).trim();
    for (const step of await result.steps) {
      for (const call of step.toolCalls ?? []) tools.push(call.toolName);
    }
  } catch (e) {
    return Response.json({ error: `Agent failed: ${(e as Error).message}` }, { status: 502 });
  }

  if (!answer) answer = "Sorry, I couldn't come up with an answer for that.";
  session.history.push({ role: "assistant", content: answer });

  // 3. Speak the answer.
  const tts = await synthesize(answer, env.voice.elevenVoiceId);
  if (tts.ok) session.spend.record("elevenlabs", "/v1/text-to-speech", tts.costCents);

  return Response.json({
    transcript,
    text: answer,
    audioBase64: tts.audioBase64,
    mime: tts.mime,
    tools,
    turnCents: session.spend.totalCents - before,
    totalCents: session.spend.totalCents,
    remainingCents: session.spend.remainingCents,
  });
}
