import { env } from "@/lib/env";

/**
 * Per-turn budget guard. One instance is created per chat request and closed
 * over by the tools, so a single assistant turn can never spend more than
 * MAX_SPEND_CENTS_PER_TURN on paid Orthogonal calls — no matter how the model
 * chains tools.
 */
export class SpendTracker {
  private spentCents = 0;
  readonly limitCents: number;
  /** Log of paid calls made this turn (also surfaced to the UI/DB). */
  readonly charges: Array<{ api: string; path: string; cents: number }> = [];

  constructor(limitCents = env.guards.maxSpendCentsPerTurn) {
    this.limitCents = limitCents;
  }

  get totalCents(): number {
    return this.spentCents;
  }

  get remainingCents(): number {
    return Math.max(0, this.limitCents - this.spentCents);
  }

  /**
   * Check whether an estimated charge fits the remaining budget.
   * Estimates come from catalog prices (USD) and may be absent; unknown-price
   * calls are allowed as long as *some* budget remains.
   */
  canAfford(estimatedCents?: number): boolean {
    if (this.remainingCents <= 0) return false;
    if (estimatedCents === undefined) return true;
    return estimatedCents <= this.remainingCents;
  }

  record(api: string, path: string, cents: number): void {
    this.spentCents += cents;
    this.charges.push({ api, path, cents });
  }
}

/** Convert a catalog USD price (number|string) to cents, if known. */
export function usdToCents(price?: number | string): number | undefined {
  if (price === undefined || price === null) return undefined;
  const n = typeof price === "string" ? Number.parseFloat(price) : price;
  return Number.isFinite(n) ? Math.ceil(n * 100) : undefined;
}
