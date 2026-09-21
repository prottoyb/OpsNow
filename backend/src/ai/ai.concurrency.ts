import { AiProviderError } from './ai.types';

/**
 * A fixed in-process cap on simultaneous provider calls (ADR-023 Decision 8).
 * Over the cap the call is refused immediately as `busy` — it is never queued,
 * because every call is human-triggered and a queue would only add latency.
 * Per-instance: it does not hold behind multiple replicas (accepted, ADR-023).
 */
export class ConcurrencyLimiter {
  private inFlight = 0;

  constructor(private readonly max: number) {}

  get active(): number {
    return this.inFlight;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inFlight >= this.max) {
      throw new AiProviderError('busy');
    }
    this.inFlight += 1;
    try {
      return await fn();
    } finally {
      this.inFlight -= 1;
    }
  }
}
