import { getAudio } from "@/lib/voice/audio-store";

/**
 * GET /api/voice/audio/:id — serve a just-recorded clip so the speech-to-text
 * provider can fetch it via `source_url`. Public and short-lived by design (the
 * clip self-expires from the in-memory store). Not linkable to anything else.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const blob = getAudio(id);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    status: 200,
    headers: {
      "Content-Type": blob.mime,
      "Content-Length": String(blob.bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
