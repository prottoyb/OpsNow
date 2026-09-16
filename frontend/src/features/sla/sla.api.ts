import { apiFetch } from '../../lib/api/client';
import type { SlaMetrics, SlaPolicy } from '../../types/api';

/** Staff-only on the backend; an Employee receives 403. Returns a BARE
 * ARRAY, not a `{data,total}` envelope. */
export function listSlaPolicies(): Promise<SlaPolicy[]> {
  return apiFetch<SlaPolicy[]>('/sla-policies');
}

/** Staff-only on the backend; an Employee receives 403. */
export function getSlaMetrics(): Promise<SlaMetrics> {
  return apiFetch<SlaMetrics>('/sla/metrics');
}
