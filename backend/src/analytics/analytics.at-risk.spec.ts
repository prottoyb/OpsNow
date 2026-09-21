import { TicketStatus } from '@prisma/client';
import {
  deriveResolutionState,
  deriveResponseState,
  isPausedFromStatus,
  remainingMinutes,
} from '../sla/sla.calculations';
import { SlaResolutionState, SlaResponseState } from '../sla/sla.constants';
import {
  AtRiskRow,
  isResolutionAtRisk,
  isResponseAtRisk,
  liveClockSql,
  resolutionAtRiskSql,
  resolutionInFlightBreachedSql,
  responseAtRiskSql,
  responseInFlightBreachedSql,
} from './analytics.at-risk';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const minutesFromNow = (m: number): Date =>
  new Date(NOW.getTime() + m * 60_000);

/**
 * The per-ticket read model, driven exactly as `SlaService.toTicketSlaResponse`
 * drives it. This is the ground truth the predicates are pinned against.
 */
function derive(row: AtRiskRow, responseBreachedPersisted = false) {
  const isPaused = isPausedFromStatus(row.status);
  const anchor = isPaused ? minutesFromNow(-10) : null;
  return {
    response: deriveResponseState({
      responseAt: row.responseAt,
      responseBreachedPersisted,
      responseDueAt: row.responseDueAt,
      resolvedAt: row.resolvedAt,
      isPaused,
      now: NOW,
      remainingMinutes: remainingMinutes(row.responseDueAt, NOW, isPaused, anchor),
      targetMinutes: row.responseTargetMinutes,
    }),
    resolution: deriveResolutionState({
      resolvedAt: row.resolvedAt,
      resolutionBreachedPersisted: false,
      resolutionDueAt: row.resolutionDueAt,
      isPaused,
      now: NOW,
      remainingMinutes: remainingMinutes(row.resolutionDueAt, NOW, isPaused, anchor),
      targetMinutes: row.resolutionTargetMinutes,
    }),
  };
}

function row(overrides: Partial<AtRiskRow> = {}): AtRiskRow {
  return {
    status: TicketStatus.Open,
    resolvedAt: null,
    responseAt: null,
    responseDueAt: minutesFromNow(600),
    responseTargetMinutes: 60,
    resolutionDueAt: minutesFromNow(6000),
    resolutionTargetMinutes: 480,
    ...overrides,
  };
}

// 20% of a 60-minute response target is 12 minutes; of a 480-minute
// resolution target, 96 minutes.
const scenarios: ReadonlyArray<[string, AtRiskRow]> = [
  ['plenty of time on both clocks', row()],
  ['response exactly at the at-risk threshold', row({ responseDueAt: minutesFromNow(12) })],
  ['response one minute above the threshold', row({ responseDueAt: minutesFromNow(13) })],
  ['response one minute below the threshold', row({ responseDueAt: minutesFromNow(11) })],
  ['response due exactly now (equality is not a breach)', row({ responseDueAt: NOW })],
  ['response one minute overdue', row({ responseDueAt: minutesFromNow(-1) })],
  ['resolution exactly at the threshold', row({ resolutionDueAt: minutesFromNow(96) })],
  ['resolution just above the threshold', row({ resolutionDueAt: minutesFromNow(97) })],
  ['resolution due exactly now', row({ resolutionDueAt: NOW })],
  ['resolution overdue', row({ resolutionDueAt: minutesFromNow(-30) })],
  ['both clocks at risk', row({ responseDueAt: minutesFromNow(5), resolutionDueAt: minutesFromNow(50) })],
  ['response already answered, resolution at risk', row({ responseAt: minutesFromNow(-5), responseDueAt: minutesFromNow(5), resolutionDueAt: minutesFromNow(50) })],
  ['paused with both clocks nominally at risk', row({ status: TicketStatus.OnHold, responseDueAt: minutesFromNow(5), resolutionDueAt: minutesFromNow(50) })],
  ['paused with both clocks nominally breached', row({ status: TicketStatus.OnHold, responseDueAt: minutesFromNow(-20), resolutionDueAt: minutesFromNow(-20) })],
  ['resolved, resolution clock nominally at risk', row({ status: TicketStatus.Resolved, resolvedAt: minutesFromNow(-1), resolutionDueAt: minutesFromNow(50) })],
  ['resolved with no response, response nominally at risk', row({ status: TicketStatus.Resolved, resolvedAt: minutesFromNow(-1), responseDueAt: minutesFromNow(5) })],
  ['closed and resolved', row({ status: TicketStatus.Closed, resolvedAt: minutesFromNow(-100), responseAt: minutesFromNow(-100) })],
  ['in progress, at risk', row({ status: TicketStatus.InProgress, responseDueAt: minutesFromNow(3), resolutionDueAt: minutesFromNow(90) })],
];

describe('analytics.at-risk predicates vs the per-ticket read model', () => {
  it.each(scenarios)('%s', (_name, r) => {
    const state = derive(r);
    expect(isResponseAtRisk(r, NOW)).toBe(state.response === SlaResponseState.AtRisk);
    expect(isResolutionAtRisk(r, NOW)).toBe(
      state.resolution === SlaResolutionState.AtRisk,
    );
  });

  it('exercises at-risk, paused and breached outcomes so the table is not vacuous', () => {
    const responses = new Set(scenarios.map(([, r]) => derive(r).response));
    expect(responses).toContain(SlaResponseState.AtRisk);
    expect(responses).toContain(SlaResponseState.Paused);
    expect(responses).toContain(SlaResponseState.Breached);
    expect(responses).toContain(SlaResponseState.Running);
    expect(responses).toContain(SlaResponseState.Met);
    expect(responses).toContain(SlaResponseState.NoResponse);
  });

  it('never reports a paused clock as at risk', () => {
    const paused = row({
      status: TicketStatus.OnHold,
      responseDueAt: minutesFromNow(1),
      resolutionDueAt: minutesFromNow(1),
    });
    expect(isResponseAtRisk(paused, NOW)).toBe(false);
    expect(isResolutionAtRisk(paused, NOW)).toBe(false);
  });
});

describe('analytics.at-risk SQL fragments', () => {
  it('bind `now` and the fraction as parameters, never inlining them', () => {
    for (const fragment of [
      responseAtRiskSql(NOW),
      resolutionAtRiskSql(NOW),
      responseInFlightBreachedSql(NOW),
      resolutionInFlightBreachedSql(NOW),
    ]) {
      expect(fragment.text).not.toContain(NOW.toISOString());
      expect(fragment.values).toContainEqual(NOW);
    }
    expect(responseAtRiskSql(NOW).values).toContain(0.2);
  });

  it('uses inclusive equality for the not-yet-breached side and strict for in-flight breach', () => {
    expect(responseAtRiskSql(NOW).text).toContain('s.response_due_at >=');
    expect(resolutionAtRiskSql(NOW).text).toContain('s.resolution_due_at >=');
    expect(responseInFlightBreachedSql(NOW).text).toContain('s.response_due_at <');
    expect(resolutionInFlightBreachedSql(NOW).text).toContain('s.resolution_due_at <');
  });

  it('scopes live clocks to unresolved, not-OnHold tickets', () => {
    expect(liveClockSql.text).toContain('t.resolved_at IS NULL');
    expect(liveClockSql.text).toContain('t.status <>');
    expect(liveClockSql.values).toEqual([TicketStatus.OnHold]);
  });
});
