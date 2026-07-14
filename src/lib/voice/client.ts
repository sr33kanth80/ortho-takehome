/**
 * Browser voice client for "Talk to Meridian" (Grok Voice over WebRTC).
 *
 * WebRTC is used so the browser handles mic capture, playback, and echo
 * cancellation natively — the only xAI-specific surface here is the SDP
 * handshake and the data-channel event protocol. Tool calls are bridged to
 * /api/voice/tool, which runs them through Meridian's real tool layer.
 *
 * ⚠️ VERIFICATION NOTE: the realtime event names and the SDP-exchange endpoint
 * follow xAI's documented, OpenAI-Realtime-compatible shape. They could not be
 * exercised without an XAI_API_KEY in this build. When a key is added, verify
 * the `handleEvent` cases and `SDP_URL` against docs.x.ai; everything else in
 * the feature (bridge, budget, UI, degrade) is already tested.
 */

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "error";

export interface VoiceTrace {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "ok" | "error";
  costCents?: number;
}

export interface VoiceCallbacks {
  onState: (s: VoiceState) => void;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
  onTrace: (t: VoiceTrace) => void;
  onCost: (totalCents: number) => void;
  onError: (message: string) => void;
}

const SDP_URL = "https://api.x.ai/v1/realtime";

export class VoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private sessionId = "";
  private capTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private cbs: VoiceCallbacks) {}

  /** Probe whether voice is configured server-side (no secrets involved). */
  static async isConfigured(): Promise<boolean> {
    try {
      const res = await fetch("/api/voice/session");
      if (!res.ok) return false;
      return Boolean((await res.json()).configured);
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    this.cbs.onState("connecting");
    // 1. Ask our server for an ephemeral token + session config.
    let cfg: {
      configured: boolean;
      sessionId?: string;
      token?: string;
      model?: string;
      voice?: string;
      instructions?: string;
      tools?: unknown[];
      caps?: { maxSessionSeconds: number; maxSpendCents: number };
      error?: string;
    };
    try {
      const res = await fetch("/api/voice/session", { method: "POST" });
      cfg = await res.json();
      if (!res.ok || !cfg.configured || !cfg.token || !cfg.sessionId) {
        throw new Error(cfg.error ?? "Voice is unavailable.");
      }
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }
    this.sessionId = cfg.sessionId;

    // 2. Mic + WebRTC peer connection.
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.fail("Microphone permission is required for voice mode.");
      return;
    }

    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic!));

    // Remote audio → hidden <audio> element.
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    pc.ontrack = (e) => {
      if (this.audioEl) this.audioEl.srcObject = e.streams[0];
    };

    const dc = pc.createDataChannel("events");
    this.dc = dc;
    dc.onopen = () => this.configure(cfg);
    dc.onmessage = (e) => this.handleEvent(e.data as string);

    // 3. SDP offer/answer with xAI.
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(`${SDP_URL}?model=${encodeURIComponent(cfg.model ?? "grok-voice-latest")}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/sdp" },
        body: offer.sdp ?? "",
      });
      if (!res.ok) throw new Error(`Voice connect failed (${res.status})`);
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }

    // 4. Enforce the hard session time cap client-side.
    const capMs = (cfg.caps?.maxSessionSeconds ?? 120) * 1000;
    this.capTimer = setTimeout(() => this.stop(), capMs);

    this.cbs.onState("listening");
  }

  /** Send the session configuration once the data channel is open. */
  private configure(cfg: { instructions?: string; voice?: string; tools?: unknown[] }) {
    this.send({
      type: "session.update",
      session: {
        instructions: cfg.instructions,
        voice: cfg.voice,
        turn_detection: { type: "server_vad" },
        tools: cfg.tools ?? [],
      },
    });
  }

  private async handleEvent(raw: string) {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        this.cbs.onState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.cbs.onState("thinking");
        break;
      case "response.audio_transcript.delta":
        if (typeof msg.delta === "string") {
          this.cbs.onState("speaking");
          this.cbs.onAssistantTranscript(msg.delta);
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof msg.transcript === "string") this.cbs.onUserTranscript(msg.transcript);
        break;
      case "response.function_call_arguments.done":
        await this.runTool(msg as { name?: string; call_id?: string; arguments?: string });
        break;
      case "response.done":
        if (!this.stopped) this.cbs.onState("listening");
        break;
      case "error":
        this.cbs.onError(String((msg as { error?: { message?: string } }).error?.message ?? "Voice error"));
        break;
    }
  }

  /** Bridge a function call through Meridian's tool layer, then feed the result back. */
  private async runTool(call: { name?: string; call_id?: string; arguments?: string }) {
    const name = call.name ?? "";
    const callId = call.call_id ?? "";
    let args: Record<string, unknown> = {};
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {};
    } catch {
      /* leave empty */
    }
    const traceId = callId || `${name}-${Date.now()}`;
    this.cbs.onTrace({ id: traceId, name, args, status: "running" });

    let output = "Tool failed.";
    try {
      const res = await fetch("/api/voice/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, name, arguments: args }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        output?: string;
        costCents?: number;
        totalCents?: number;
        ended?: boolean;
      };
      output = data.output ?? output;
      this.cbs.onTrace({ id: traceId, name, args, status: data.ok ? "ok" : "error", costCents: data.costCents });
      if (typeof data.totalCents === "number") this.cbs.onCost(data.totalCents);
      if (data.ended) this.stop();
    } catch (e) {
      output = `Tool error: ${(e as Error).message}`;
      this.cbs.onTrace({ id: traceId, name, args, status: "error" });
    }

    // Return the tool result to the model and ask it to continue.
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output },
    });
    this.send({ type: "response.create" });
  }

  private send(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify(obj));
  }

  private fail(message: string) {
    this.cbs.onError(message);
    this.cbs.onState("error");
    this.cleanup();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.cleanup();
    this.cbs.onState("ended");
  }

  private cleanup() {
    clearTimeout(this.capTimer);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.dc?.close();
    this.pc?.close();
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.mic = null;
    this.dc = null;
    this.pc = null;
  }
}
