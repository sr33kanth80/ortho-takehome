import { getVoiceSession, isExpired } from "@/lib/voice/session-store";
import { executeVoiceTool } from "@/lib/voice/tools";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/voice/tool — execute one voice function call.
 *
 * The browser voice client forwards each of Grok Voice's function calls here;
 * we run it through Meridian's real tool layer under the session's SpendTracker
 * and hand back the output plus running cost. This is the bridge that makes the
 * voice agent answer with the same live Orthogonal data as the text chat.
 */
interface Body {
  sessionId?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  callId?: string;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, name } = body;
  if (!sessionId || !name) {
    return Response.json({ error: "sessionId and name are required" }, { status: 400 });
  }

  const session = getVoiceSession(sessionId);
  if (!session) {
    return Response.json({ error: "Unknown or expired voice session" }, { status: 404 });
  }
  if (session.userId !== user.id) return Response.json({ error: "Unknown or expired voice session" }, { status: 404 });
  if (isExpired(session)) {
    return Response.json(
      { ok: false, output: "The voice session time limit was reached. Wrap up the answer.", ended: true },
      { status: 200 },
    );
  }

  const result = await executeVoiceTool(
    name,
    body.arguments ?? {},
    session.spend,
    { userId: session.userId, companyId: session.companyId },
    body.callId || `voice-${session.id}-${Date.now()}`,
  );
  return Response.json(result);
}
