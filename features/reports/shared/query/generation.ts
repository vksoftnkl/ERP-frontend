/**
 * One generation at a time (plan §5).
 *
 * Every URL change starts a generation: the previous one's requests are
 * aborted, and each request captures its generation number and checks it
 * before its result is applied. Aborting alone is not enough, because a
 * response can already be in the parser when the abort fires. Aborting AND
 * comparing is.
 *
 * The rule the screen keeps: nothing is rendered from a response whose
 * filters are not the current URL's.
 */
export type Ticket = { readonly gen: number; readonly signal: AbortSignal };

export class Generations {
  private current = 0;
  private controller: AbortController | null = null;

  /** Abort everything in flight and start a new generation. */
  begin(): Ticket {
    this.controller?.abort();
    this.controller = new AbortController();
    this.current += 1;
    return { gen: this.current, signal: this.controller.signal };
  }

  /** The ticket of the running generation, for requests it adds later (a page on scroll). */
  ticket(): Ticket | null {
    return this.controller ? { gen: this.current, signal: this.controller.signal } : null;
  }

  isCurrent(ticket: Ticket): boolean {
    return ticket.gen === this.current && !ticket.signal.aborted;
  }

  /**
   * Run `request` under `ticket`; hand its result to `apply` only if the
   * ticket is still current when it arrives. Resolves to whether it applied.
   */
  async run<T>(
    ticket: Ticket,
    request: (signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void,
    fail: (error: unknown) => void,
  ): Promise<boolean> {
    try {
      const value = await request(ticket.signal);
      if (!this.isCurrent(ticket)) return false;
      apply(value);
      return true;
    } catch (error) {
      if (!this.isCurrent(ticket)) return false;
      fail(error);
      return false;
    }
  }

  dispose(): void {
    this.controller?.abort();
    this.controller = null;
    this.current += 1;
  }
}
