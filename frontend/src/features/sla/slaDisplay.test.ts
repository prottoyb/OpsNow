import { describe, expect, it } from 'vitest';
import { makeTicketSla } from '../../mocks/fixtures';
import type { SlaResolutionState, SlaResponseState } from '../../types/api';
import {
  ageMinutes,
  describeResolutionClock,
  describeResponseClock,
  formatFrozenRemaining,
  formatRemaining,
  summariseSla,
} from './slaDisplay';

const HOUR = 60 * 60 * 1000;
const FUTURE = new Date(Date.now() + 5 * HOUR).toISOString();
const PAST = new Date(Date.now() - 5 * HOUR).toISOString();

describe('response clock states', () => {
  it('describes a running clock as on track and lets it tick', () => {
    const view = describeResponseClock(
      makeTicketSla({ responseState: 'Running', responseMinutesRemaining: 45 }),
    );

    expect(view.label).toBe('Response on track');
    expect(view.tone).toBe('success');
    expect(view.mode).toBe('ticking');
    expect(view.dueLabel).toBe('Due');
  });

  it('describes an at-risk clock as at risk and lets it tick', () => {
    const view = describeResponseClock(
      makeTicketSla({ responseState: 'AtRisk', responseMinutesRemaining: 8 }),
    );

    expect(view.label).toBe('Response at risk');
    expect(view.tone).toBe('warning');
    expect(view.mode).toBe('ticking');
  });

  it('describes an in-flight breach with no countdown at all', () => {
    const view = describeResponseClock(
      makeTicketSla({
        responseState: 'Breached',
        responseAt: null,
        responseMinutesRemaining: 0,
      }),
    );

    expect(view.label).toBe('Response breached');
    expect(view.tone).toBe('danger');
    expect(view.mode).toBe('static');
    expect(view.dueLabel).toBe('Overdue since');
    expect(view.completedAt).toBeNull();
  });

  it('describes a late-but-recorded response as a completed breach', () => {
    const view = describeResponseClock(
      makeTicketSla({ responseState: 'Breached', responseAt: PAST }),
    );

    expect(view.label).toBe('Response breached');
    expect(view.mode).toBe('static');
    expect(view.dueLabel).toBe('Was due');
    expect(view.completedAt).toBe(PAST);
    expect(view.completedLabel).toBe('First response');
  });

  it('describes a met clock with its completion instant and no countdown', () => {
    const view = describeResponseClock(
      makeTicketSla({ responseState: 'Met', responseAt: PAST }),
    );

    expect(view.label).toBe('Response met');
    expect(view.tone).toBe('success');
    expect(view.mode).toBe('static');
    expect(view.completedAt).toBe(PAST);
  });

  it('describes a resolved-without-reply ticket as "no response recorded"', () => {
    const view = describeResponseClock(
      makeTicketSla({ responseState: 'NoResponse', responseAt: null }),
    );

    expect(view.label).toBe('No response recorded');
    expect(view.mode).toBe('static');
  });

  it('freezes a paused clock rather than ticking it', () => {
    const view = describeResponseClock(
      makeTicketSla({
        responseState: 'Paused',
        responseMinutesRemaining: 30,
        isPaused: true,
      }),
    );

    expect(view.label).toBe('Response paused');
    expect(view.mode).toBe('frozen');
    expect(view.dueLabel).toBe('Due before pause');
  });

  /**
   * A ticket that was ALREADY past its response due date when it went on
   * hold: the backend reports `Paused` with `minutesRemaining` clamped to 0.
   * "0m left before pause" would read as though resuming buys a moment;
   * in fact it buys nothing.
   */
  it('gives a paused-but-already-past-due clock its own copy and no figure', () => {
    const view = describeResponseClock(
      makeTicketSla({
        responseState: 'Paused',
        responseMinutesRemaining: 0,
        isPaused: true,
      }),
    );

    expect(view.label).toBe('Response paused — already past due');
    expect(view.mode).toBe('static');
  });
});

describe('resolution clock states', () => {
  it('names the resolution clock, never a generic "SLA"', () => {
    expect(
      describeResolutionClock(
        makeTicketSla({ resolutionState: 'AtRisk' }),
        null,
      ).label,
    ).toBe('Resolution at risk');
    expect(
      describeResolutionClock(
        makeTicketSla({ resolutionState: 'Running' }),
        null,
      ).label,
    ).toBe('Resolution on track');
    expect(
      describeResolutionClock(
        makeTicketSla({ resolutionState: 'Paused', resolutionMinutesRemaining: 30 }),
        null,
      ).label,
    ).toBe('Resolution paused');
  });

  it('separates "resolved late" from "still open and over target"', () => {
    const resolvedLate = describeResolutionClock(
      makeTicketSla({ resolutionState: 'Breached' }),
      PAST,
    );
    const stillOpen = describeResolutionClock(
      makeTicketSla({ resolutionState: 'Breached' }),
      null,
    );

    expect(resolvedLate.dueLabel).toBe('Was due');
    expect(resolvedLate.completedLabel).toBe('Resolved');
    expect(stillOpen.dueLabel).toBe('Overdue since');
    expect(stillOpen.completedAt).toBeNull();
    // Neither ever shows a countdown.
    expect(resolvedLate.mode).toBe('static');
    expect(stillOpen.mode).toBe('static');
  });

  it('never has a "no response" equivalent', () => {
    const view = describeResolutionClock(
      makeTicketSla({ resolutionState: 'Met' }),
      PAST,
    );
    expect(view.label).toBe('Resolution met');
  });
});

/**
 * The centrepiece of this feature's tests. The backend's state string is the
 * only authority on met/breached/at-risk; the UI must never second-guess it
 * by comparing a due date to the browser's clock, which may be skewed, or
 * differently time-zoned, or simply wrong.
 */
describe('backend authority over locally derivable state', () => {
  it('shows Breached even when the due date is in the FUTURE', () => {
    const response = describeResponseClock(
      makeTicketSla({
        responseState: 'Breached',
        responseAt: null,
        responseDueAt: FUTURE,
      }),
    );
    const resolution = describeResolutionClock(
      makeTicketSla({ resolutionState: 'Breached', resolutionDueAt: FUTURE }),
      null,
    );

    expect(response.label).toBe('Response breached');
    expect(response.tone).toBe('danger');
    expect(resolution.label).toBe('Resolution breached');
    expect(resolution.tone).toBe('danger');
  });

  it('does NOT show Breached when the due date is in the past but the state is not', () => {
    const running = describeResponseClock(
      makeTicketSla({ responseState: 'Running', responseDueAt: PAST }),
    );
    const atRisk = describeResolutionClock(
      makeTicketSla({ resolutionState: 'AtRisk', resolutionDueAt: PAST }),
      null,
    );

    expect(running.label).toBe('Response on track');
    expect(running.tone).not.toBe('danger');
    expect(atRisk.label).toBe('Resolution at risk');
    expect(atRisk.tone).not.toBe('danger');
  });

  /**
   * `{ state: 'AtRisk', minutesRemaining: 0 }` is reachable for roughly the
   * last thirty seconds before a breach (the backend rounds remaining
   * minutes but uses a strict `now > dueAt` breach boundary). "0 remaining"
   * is therefore NOT a synonym for breached.
   */
  it('treats zero remaining on an at-risk clock as at risk, not breached', () => {
    const view = describeResponseClock(
      makeTicketSla({ responseState: 'AtRisk', responseMinutesRemaining: 0 }),
    );

    expect(view.label).toBe('Response at risk');
    expect(view.tone).toBe('warning');
    expect(view.mode).toBe('ticking');
  });
});

/**
 * TypeScript guarantees every state in the union is handled. It guarantees
 * nothing about the wire — a newer backend or a proxy can send a string this
 * build has never heard of. Falling off the end of an exhaustive switch
 * returns `undefined`, and `summariseSla` dereferencing `.severity` on that
 * throws; with no error boundary in this app, that unmounts the whole tree.
 */
describe('an unrecognised state degrades instead of throwing', () => {
  const bogusResponse = makeTicketSla({
    responseState: 'SomethingNew' as SlaResponseState,
  });
  const bogusResolution = makeTicketSla({
    resolutionState: 'SomethingNew' as SlaResolutionState,
  });

  it('describes an unknown response state neutrally', () => {
    const view = describeResponseClock(bogusResponse);

    expect(view.label).toBe('Response state unavailable');
    expect(view.tone).toBe('neutral');
    expect(view.mode).toBe('static');
    expect(view.severity).toBe(0);
    // No invented breach/overdue wording, and the date is still shown.
    expect(view.dueLabel).toBe('Due date');
    expect(view.dueAt).toBe(bogusResponse.responseDueAt);
    expect(view.note).not.toMatch(/overdue|breach/i);
  });

  it('describes an unknown resolution state neutrally', () => {
    const view = describeResolutionClock(bogusResolution, null);

    expect(view.label).toBe('Resolution state unavailable');
    expect(view.mode).toBe('static');
    expect(view.severity).toBe(0);
  });

  it('does not throw from summariseSla, on either clock', () => {
    expect(() => summariseSla(bogusResponse, null)).not.toThrow();
    expect(() => summariseSla(bogusResolution, null)).not.toThrow();
  });

  it('never lets an uninterpretable clock outrank a real breach', () => {
    const view = summariseSla(
      makeTicketSla({
        responseState: 'SomethingNew' as SlaResponseState,
        resolutionState: 'Breached',
      }),
      null,
    );

    expect(view.label).toBe('Resolution breached');
  });
});

describe('summariseSla — the single badge a list row shows', () => {
  it('ranks Breached above every other state', () => {
    const view = summariseSla(
      makeTicketSla({ responseState: 'Met', resolutionState: 'Breached' }),
      null,
    );
    expect(view.label).toBe('Resolution breached');
  });

  it('ranks AtRisk above Paused, NoResponse, Running and Met', () => {
    expect(
      summariseSla(
        makeTicketSla({ responseState: 'AtRisk', resolutionState: 'Paused' }),
        null,
      ).label,
    ).toBe('Response at risk');
    expect(
      summariseSla(
        makeTicketSla({ responseState: 'Running', resolutionState: 'AtRisk' }),
        null,
      ).label,
    ).toBe('Resolution at risk');
  });

  it('ranks Paused above NoResponse, and NoResponse above Running', () => {
    expect(
      summariseSla(
        makeTicketSla({
          responseState: 'NoResponse',
          resolutionState: 'Paused',
          resolutionMinutesRemaining: 30,
        }),
        null,
      ).label,
    ).toBe('Resolution paused');
    expect(
      summariseSla(
        makeTicketSla({ responseState: 'NoResponse', resolutionState: 'Running' }),
        null,
      ).label,
    ).toBe('No response recorded');
  });

  it('prefers the response clock on a tie', () => {
    expect(
      summariseSla(
        makeTicketSla({ responseState: 'Running', resolutionState: 'Running' }),
        null,
      ).label,
    ).toBe('Response on track');
  });

  it('never collapses the two clocks into a generic label', () => {
    const view = summariseSla(
      makeTicketSla({ responseState: 'Met', resolutionState: 'AtRisk' }),
      null,
    );
    expect(view.label).toBe('Resolution at risk');
    expect(view.label).not.toMatch(/^SLA/);
  });
});

describe('ageMinutes', () => {
  const anchor = 1_000_000;

  it('subtracts elapsed real time from the backend figure', () => {
    expect(ageMinutes(120, anchor, anchor)).toBe(120);
    expect(ageMinutes(120, anchor, anchor + 60_000)).toBe(119);
    expect(ageMinutes(120, anchor, anchor + 30 * 60_000)).toBe(90);
  });

  it('goes negative rather than clamping — the formatter does the clamping', () => {
    expect(ageMinutes(1, anchor, anchor + 10 * 60_000)).toBe(-9);
  });

  it('ignores a system clock that jumps backwards', () => {
    expect(ageMinutes(120, anchor, anchor - 10 * 60_000)).toBe(120);
  });
});

describe('remaining-time wording', () => {
  it('appends "left" only while there is time left', () => {
    expect(formatRemaining(134)).toBe('2h 14m left');
    expect(formatRemaining(0)).toBe('Due now');
    expect(formatRemaining(-500)).toBe('Due now');
  });

  /**
   * The countdown is aged by however many milliseconds have passed since the
   * payload arrived, so it is almost never a whole number. Rounding to the
   * nearest minute — the same rounding the backend applies to
   * `minutesRemaining` — keeps the first painted figure equal to the one the
   * server sent, instead of a minute short.
   */
  it('rounds to the nearest minute rather than truncating', () => {
    expect(formatRemaining(133.998)).toBe('2h 14m left');
    expect(formatRemaining(59.6)).toBe('1h left');
    expect(formatRemaining(0.4)).toBe('Due now');
  });

  it('labels a frozen figure as frozen before the pause', () => {
    expect(formatFrozenRemaining(30)).toBe('30m left before pause');
    expect(formatFrozenRemaining(0)).toBe('Due now');
  });
});
