"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Talk to Meridian" — push-to-talk voice mode (Orthogonal provider).
 *
 * Tap to speak → the clip is transcribed, answered by the same agent + tools as
 * the text chat, and spoken back — every hop through the single Orthogonal key.
 * Self-contained: a trigger button plus a call overlay with live state, the
 * transcript, the tools used, and the running cost.
 */

type VoiceState = "idle" | "ready" | "recording" | "processing" | "speaking" | "ended" | "error";

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Connecting…",
  ready: "Tap to speak",
  recording: "Listening… tap to stop",
  processing: "Thinking…",
  speaking: "Meridian is speaking…",
  ended: "Call ended",
  error: "Something went wrong",
};

interface TurnResult {
  transcript?: string;
  text?: string;
  audioBase64?: string;
  mime?: string;
  tools?: string[];
  totalCents?: number;
  ended?: boolean;
  error?: string;
}

function useVoiceSession() {
  const [state, setState] = useState<VoiceState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [costCents, setCostCents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const begin = useCallback(async () => {
    setState("idle");
    setError(null);
    setUserText("");
    setAssistantText("");
    setTools([]);
    setCostCents(0);
    try {
      const res = await fetch("/api/voice/session", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.configured || !data.sessionId) {
        throw new Error(data.error ?? "Voice is unavailable.");
      }
      sessionRef.current = data.sessionId;
      setSessionId(data.sessionId);
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  const sendTurn = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;
    setState("processing");
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" });
    const fd = new FormData();
    fd.append("sessionId", sid);
    fd.append("audio", blob, "clip.webm");
    try {
      const res = await fetch("/api/voice/turn", { method: "POST", body: fd });
      const data = (await res.json()) as TurnResult;
      if (!res.ok || data.error) throw new Error(data.error ?? "Turn failed.");
      if (data.transcript) setUserText(data.transcript);
      setAssistantText(data.text ?? "");
      setTools(data.tools ?? []);
      if (typeof data.totalCents === "number") setCostCents(data.totalCents);
      if (data.audioBase64) {
        const audio = new Audio(`data:${data.mime ?? "audio/mpeg"};base64,${data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setState(data.ended ? "ended" : "ready");
        setState("speaking");
        void audio.play().catch(() => setState(data.ended ? "ended" : "ready"));
      } else {
        setState(data.ended ? "ended" : "ready");
      }
    } catch (e) {
      setError((e as Error).message);
      setState("ready");
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        void sendTurn();
      };
      rec.start();
      setState("recording");
    } catch {
      setError("Microphone permission is required for voice mode.");
      setState("ready");
    }
  }, [sendTurn]);

  const toggleRecording = useCallback(() => {
    if (state === "recording") recorderRef.current?.stop();
    else if (state === "ready" || state === "ended") void startRecording();
  }, [state, startRecording]);

  const end = useCallback(() => {
    recorderRef.current?.stop();
    cleanupAudio();
    setState("ended");
  }, [cleanupAudio]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  return {
    state,
    sessionId,
    userText,
    assistantText,
    tools,
    costCents,
    error,
    begin,
    toggleRecording,
    end,
  };
}

export function VoiceMode() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const voice = useVoiceSession();

  useEffect(() => {
    fetch("/api/voice/session")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  const openCall = () => {
    setOpen(true);
    void voice.begin();
  };
  const closeCall = () => {
    voice.end();
    setOpen(false);
  };

  const disabled = configured === false;

  return (
    <>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={openCall}
          disabled={disabled}
          title={disabled ? "Voice is not configured" : "Talk to Meridian"}
          className="mt-2 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-1.5 text-[13px] leading-none text-[var(--ink-dim)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MicIcon />
          Talk to Meridian
        </button>
      </div>
      {open && <VoiceOverlay voice={voice} onClose={closeCall} />}
    </>
  );
}

function VoiceOverlay({
  voice,
  onClose,
}: {
  voice: ReturnType<typeof useVoiceSession>;
  onClose: () => void;
}) {
  const { state, userText, assistantText, tools, costCents, error, toggleRecording } = voice;
  const recording = state === "recording";
  const busy = state === "processing" || state === "speaking" || state === "idle";
  const canTap = state === "ready" || state === "recording" || state === "ended";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,63,46,0.18)] px-4">
      <div className="w-full max-w-[440px] rounded-[16px] border border-[var(--border)] bg-[var(--bg-raised)] p-6">
        {/* header */}
        <div className="mb-5 flex items-center justify-between">
          <span className="text-[14px] font-medium text-[var(--ink)]">Talk to Meridian</span>
          <span className="text-[11px] text-[var(--ink-faint)]">
            {costCents > 0 ? `${formatCents(costCents)} this call` : "no cost yet"}
          </span>
        </div>

        {/* mic button */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={!canTap}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
              recording
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border-strong)] bg-[var(--bg)] text-[var(--accent)] hover:border-[var(--accent)]"
            }`}
          >
            {recording && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-30" />
            )}
            <span className="relative">
              <MicIcon big />
            </span>
          </button>
          <span className="text-[13px] font-medium text-[var(--ink-dim)]">{STATE_LABEL[state]}</span>
        </div>

        {/* transcript */}
        <div className="mt-5 min-h-[80px] space-y-3">
          {userText && (
            <div className="text-right">
              <p className="inline-block max-w-[85%] rounded-[14px] border border-[var(--border)] px-3 py-1.5 text-[14px] leading-[1.4] text-[var(--ink)]">
                {userText}
              </p>
            </div>
          )}
          {assistantText && <p className="text-[15px] leading-[1.5] text-[var(--ink)]">{assistantText}</p>}
          {!userText && !assistantText && !error && !busy && (
            <p className="pt-3 text-center text-[13px] leading-[1.5] text-[var(--ink-faint)]">
              Ask about a company, a person, or anything on the web — out loud.
            </p>
          )}
          {error && <p className="text-[13px] leading-[1.5] text-[var(--err)]">{error}</p>}
        </div>

        {/* tools used this turn */}
        {tools.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
            <span className="text-[11px] text-[var(--ink-faint)]">used</span>
            {tools.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] leading-none text-[var(--ink-dim)]"
              >
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* footer */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {state === "ended" || state === "error" ? "Close" : "End call"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCents(c: number): string {
  return c < 1 ? `${c.toFixed(1)}¢` : `${Math.round(c)}¢`;
}

function MicIcon({ big = false }: { big?: boolean }) {
  const s = big ? 26 : 13;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="6" y="1.5" width="4" height="8" rx="2" fill="currentColor" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
