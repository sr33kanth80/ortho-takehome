import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { env } from "@/lib/env";
import { getModel, SYSTEM_PROMPT } from "@/lib/llm";
import { createTools } from "@/lib/tools";
import { SpendTracker } from "@/lib/tools/spend";
import { saveMessages, titleFrom } from "@/lib/db/store";
import { getCurrentUser } from "@/lib/auth";

export const maxDuration = 120; // agent turns with several tool calls need headroom

interface ChatBody {
  id?: string; // conversation id (client-generated nanoid)
  messages: UIMessage[];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages[] is required" }, { status: 400 });
  }
  const conversationId = body.id;
  if (!conversationId) return Response.json({ error: "conversation id is required" }, { status: 400 });

  // Basic abuse guard: cap history size server-side (the client trims too).
  const history = body.messages.slice(-40);

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: history });
  } catch {
    return Response.json({ error: "Malformed messages" }, { status: 400 });
  }

  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (latestUserMessage) {
    const firstUserText = latestUserMessage.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join(" ");
    try {
      await saveMessages(user.id, conversationId, [{ message: latestUserMessage }], { titleIfNew: titleFrom(firstUserText) });
    } catch (error) {
      console.error("[chat] failed to persist submitted message:", error);
      return Response.json({ error: "Could not save this conversation." }, { status: 503 });
    }
  }

  // One budget per turn: however the model chains tools, it cannot spend more
  // than MAX_SPEND_CENTS_PER_TURN of Orthogonal credit in this request.
  const spend = new SpendTracker();
  const tools = createTools(spend);

  const result = streamText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(env.guards.maxAgentSteps),
    onError: ({ error }) => {
      console.error("[chat] stream error:", error);
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    messageMetadata: ({ part }) => {
      // Attach running spend to the assistant message so the UI can show
      // exactly what this turn cost.
      if (part.type === "finish") {
        return { costCents: spend.totalCents, charges: spend.charges };
      }
      return undefined;
    },
    onFinish: async ({ messages: finalMessages }) => {
      try {
        const lastUser = [...finalMessages].reverse().find((m) => m.role === "user");
        const firstUserText =
          lastUser?.parts
            ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join(" ") ?? "";
        // Persist the trailing user + assistant messages for this turn.
        const toSave = finalMessages.slice(-2).map((message) => ({
          message,
          costCents: message.role === "assistant" ? spend.totalCents : 0,
        }));
        await saveMessages(user.id, conversationId, toSave, {
          titleIfNew: titleFrom(firstUserText),
        });
      } catch (e) {
        // Persistence must never break the user-facing stream.
        console.error("[chat] failed to persist messages:", e);
      }
    },
  });
}
