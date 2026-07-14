import { nanoid } from "nanoid";

/**
 * Tiny in-memory store for a browser recording, held just long enough for the
 * speech-to-text provider to fetch it by URL (STT via /v1/run only accepts a
 * `source_url`, not inline bytes). Entries self-expire; this is not durable
 * storage. Process-local — a multi-instance deployment would use object storage
 * with signed URLs instead.
 */
interface AudioBlob {
  bytes: Uint8Array;
  mime: string;
  createdAt: number;
}

const TTL_MS = 90_000;

const store: Map<string, AudioBlob> = ((
  globalThis as typeof globalThis & { __meridianAudio?: Map<string, AudioBlob> }
).__meridianAudio ??= new Map());

function sweep() {
  const now = Date.now();
  for (const [id, b] of store) {
    if (now - b.createdAt > TTL_MS) store.delete(id);
  }
}

export function putAudio(bytes: Uint8Array, mime: string): string {
  sweep();
  const id = nanoid(20);
  store.set(id, { bytes, mime, createdAt: Date.now() });
  return id;
}

export function getAudio(id: string): AudioBlob | undefined {
  return store.get(id);
}

export function deleteAudio(id: string): void {
  store.delete(id);
}
