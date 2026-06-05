/**
 * In-memory per-session soft spend cap (MAX_SPEND_PER_SESSION).
 *
 * 🔴 HONESTY: best-effort and SOFT.
 *   - Disabled unless MAX_SPEND_PER_SESSION is set to a positive number.
 *   - In-memory only: resets on restart, not shared across processes/clients.
 *   - Post-hoc accounting: it sums the REAL userCost returned by each successful
 *     spend, then BLOCKS THE NEXT spend once the running total reaches the cap.
 *     It does NOT split or pre-authorize a single request, so a request made
 *     while still under the cap is allowed even if it pushes the total over.
 *   - This is an EXTRA convenience layer on top of the server-side per-key
 *     daily quota — it does not replace it.
 */

export class SpendCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapError";
  }
}

export class SpendGuard {
  private spent = 0;

  constructor(private readonly cap: number | undefined) {}

  get enabled(): boolean {
    return this.cap !== undefined && this.cap > 0;
  }

  get totalSpent(): number {
    return this.spent;
  }

  /**
   * Throw SpendCapError if the running total has already reached the cap.
   * Call this immediately before a fresh (non-deduped) spend.
   */
  checkBeforeSpend(): void {
    if (this.enabled && this.spent >= (this.cap as number)) {
      throw new SpendCapError(
        `Session spend cap reached: $${this.spent.toFixed(4)} of $${this.cap} spent. ` +
          `This is a best-effort, in-memory soft cap (resets on restart, this session only). ` +
          `Raise or unset MAX_SPEND_PER_SESSION to continue.`,
      );
    }
  }

  /** Add the actual cost of a successful spend to the running total. */
  record(cost: number | undefined): void {
    if (this.enabled && cost !== undefined && Number.isFinite(cost) && cost > 0) {
      this.spent += cost;
    }
  }
}

/** Pull the user-facing cost (USD) out of an activation response, if present. */
export function extractUserCost(value: unknown): number | undefined {
  if (value && typeof value === "object") {
    const c = (value as Record<string, unknown>).userCost;
    const n = typeof c === "string" ? Number(c) : typeof c === "number" ? c : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
