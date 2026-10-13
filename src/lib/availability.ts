import type { LiveFields } from './types';

export type AvailKey = 'open' | 'few' | 'soldout' | 'regclosed' | 'closed' | 'completed' | 'removed';

export interface Availability {
  key: AvailKey;
  /** Short status for chips: "Open", "Few seats left", "Sold out"… */
  label: string;
  canRegister: boolean;
  seatsLeft: number;
  /** 0–1 share of seats taken. */
  fill: number;
  /** "6 of 40 seats left", "All 16 seats taken". */
  seatsText: string;
}

export function seatsLeftOf(e: Pick<LiveFields, 'total_seats' | 'seats_filled'>): number {
  return Math.max(0, (e.total_seats || 0) - (e.seats_filled || 0));
}

/** A seat count this low (or lower) is shown as urgent. */
export function fewThreshold(total: number): number {
  return Math.max(3, Math.ceil(total * 0.15));
}

export function availability(e: LiveFields, now = Date.now()): Availability {
  const total = Math.max(0, e.total_seats || 0);
  const left = seatsLeftOf(e);
  const fill = total ? Math.min(1, (e.seats_filled || 0) / total) : 0;
  const deadline = Date.parse(e.registration_deadline);
  const deadlinePassed = !Number.isNaN(deadline) && deadline <= now;

  const seatsText =
    left === 0 ? `All ${total} seats taken` : `${left} of ${total} seat${total === 1 ? '' : 's'} left`;

  const base = { seatsLeft: left, fill, seatsText };
  if (e.event_status === 'COMPLETED') return { ...base, key: 'completed', label: 'Completed', canRegister: false };
  if (e.event_status === 'CLOSED') return { ...base, key: 'closed', label: 'Closed', canRegister: false };
  if (e.registration_status === 'SOLD_OUT' || (total > 0 && left === 0))
    return { ...base, key: 'soldout', label: 'Sold out', canRegister: false };
  if (e.registration_status === 'CLOSED' || deadlinePassed)
    return { ...base, key: 'regclosed', label: 'Registration closed', canRegister: false };
  if (left <= fewThreshold(total)) return { ...base, key: 'few', label: `${left} left`, canRegister: true };
  return { ...base, key: 'open', label: 'Open', canRegister: true };
}
