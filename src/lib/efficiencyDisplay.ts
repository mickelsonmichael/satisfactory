// Shared display helpers for the efficiency feature — used by the map coloring,
// the per-building panel, and the report list so they stay visually consistent.

import type { EfficiencyResult, EfficiencyStatus } from '../types';

// The headline utilization for a machine. We use the deterministic flow estimate rather
// than the save's measured uptime: the measured value is only serialized for ~half the
// machines (absent ⇒ read as 0%), so leading with it would bury real throughput
// bottlenecks under idle/standby machines. Measured uptime is still shown alongside as a
// cross-check (see EfficiencyPanel).
export function headlineUtil(r: EfficiencyResult): number {
  return r.utilization;
}

// Footprint / bar color by utilization tier.
export function utilColor(util: number): string {
  if (util >= 0.95) return '#56c271'; // green — full
  if (util >= 0.5) return '#f2c14e';  // amber — partial
  return '#f25c54';                   // red — low
}

export const STATUS_LABEL: Record<EfficiencyStatus, string> = {
  full: 'Full',
  starved: 'Starved',
  blocked: 'Blocked',
  idle: 'Idle',
  unknown: 'Unknown',
};

export const STATUS_COLOR: Record<EfficiencyStatus, string> = {
  full: '#56c271',
  starved: '#f25c54', // under-supplied input
  blocked: '#f2994a', // output backing up / over-production
  idle: '#6b7280',
  unknown: '#6b7280',
};

// Round a per-minute rate for display (1 decimal under 10, whole numbers above).
export function fmtRate(perMin: number): string {
  if (perMin === 0) return '0';
  return perMin < 10 ? perMin.toFixed(1) : Math.round(perMin).toLocaleString();
}
