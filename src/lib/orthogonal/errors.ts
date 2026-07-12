/**
 * A single normalised error type for everything that can go wrong when talking
 * to Orthogonal. The agent surfaces `.userMessage` to the model so it can
 * recover gracefully (retry a different tool, ask the user, etc.) instead of
 * crashing the turn.
 */
export type OrthogonalErrorCode =
  | "AUTH"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "NOT_FOUND"
  | "BUDGET_EXCEEDED"
  | "TIMEOUT"
  | "NETWORK"
  | "BAD_REQUEST"
  | "UNKNOWN";

export class OrthogonalError extends Error {
  readonly code: OrthogonalErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  /** True if a retry (same or different tool) might succeed. */
  readonly retryable: boolean;

  constructor(opts: {
    code: OrthogonalErrorCode;
    message: string;
    status?: number;
    requestId?: string;
    retryable?: boolean;
  }) {
    super(opts.message);
    this.name = "OrthogonalError";
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId;
    this.retryable = opts.retryable ?? false;
  }

  /** A concise, model-friendly description of the failure. */
  get userMessage(): string {
    return `[${this.code}] ${this.message}`;
  }
}

/** Map an HTTP status + upstream error code to our normalised code. */
export function classify(
  status: number,
  upstreamCode?: string,
): { code: OrthogonalErrorCode; retryable: boolean } {
  const c = upstreamCode?.toUpperCase();
  if (c === "RATE_LIMITED" || status === 429) return { code: "RATE_LIMITED", retryable: true };
  if (c === "INSUFFICIENT_CREDITS") return { code: "INSUFFICIENT_CREDITS", retryable: false };
  if (status === 401 || status === 403) return { code: "AUTH", retryable: false };
  if (status === 404) return { code: "NOT_FOUND", retryable: false };
  if (status === 400 || status === 422) return { code: "BAD_REQUEST", retryable: false };
  if (status >= 500) return { code: "UPSTREAM", retryable: true };
  return { code: "UNKNOWN", retryable: false };
}
