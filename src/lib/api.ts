// Build-time data access.
//
// At build time we ask the Events API for every event and its full detail. If the API is
// down, slow or returns something unexpected, we fall back to the snapshot committed in
// src/data/snapshot.json (refresh it with `npm run snapshot`), so a deploy never fails
// because of API downtime. Every record is normalised so a malformed field cannot break a page.

import snapshot from '../data/snapshot.json';
import type {
  EventDetail, EventSummary, Session, Prize, Faq, Organizer, Coordinator, ScheduleSummary,
} from './types';

export const API_BASE = (import.meta.env.PUBLIC_EVENTS_API ?? 'https://render72.pages.dev').replace(/\/$/, '');
export const LIST_URL = `${API_BASE}/api/test/events`;
export const eventUrl = (id: string) => `${API_BASE}/api/test/events/${encodeURIComponent(id)}`;

export interface Dataset {
  events: EventDetail[];
  /** Where the data came from: the live API, the snapshot, or a mix (some details fell back). */
  source: 'api' | 'snapshot' | 'mixed';
  /** When the data was fetched (ms since epoch). */
  fetchedAt: number;
}

async function fetchJSON<T>(url: string, timeoutMs = 10_000, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ---- normalisation -------------------------------------------------------

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  (opts as readonly string[]).includes(v as string) ? (v as T) : d;
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHM = (s: string) => /^\d{2}:\d{2}$/.test(s);

function normSummary(raw: any): EventSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id).trim();
  const name = str(raw.name).trim();
  if (!id || !name) return null;
  const ss = raw.schedule_summary ?? {};
  const schedule_summary: ScheduleSummary = {
    start_date: isYMD(str(ss.start_date)) ? ss.start_date : '1970-01-01',
    start_time: isHM(str(ss.start_time)) ? ss.start_time : '00:00',
    end_date: isYMD(str(ss.end_date)) ? ss.end_date : str(ss.start_date, '1970-01-01'),
    end_time: isHM(str(ss.end_time)) ? ss.end_time : '23:59',
  };
  const total = Math.max(0, num(raw.total_seats));
  const min = Math.max(1, num(raw.min_teamsize, 1));
  return {
    id,
    name,
    blurb: str(raw.blurb),
    cover_image_url: str(raw.cover_image_url),
    cover_image_alt: str(raw.cover_image_alt, name),
    category: str(raw.category, 'Event'),
    tags: strs(raw.tags),
    event_type: oneOf(raw.event_type, ['EVENT', 'WORKSHOP'] as const, 'EVENT'),
    event_mode: oneOf(raw.event_mode, ['OFFLINE', 'ONLINE'] as const, 'OFFLINE'),
    event_status: oneOf(raw.event_status, ['ACTIVE', 'COMPLETED', 'CLOSED'] as const, 'ACTIVE'),
    is_featured: bool(raw.is_featured),
    is_technical: bool(raw.is_technical),
    price: Math.max(0, num(raw.price)),
    is_per_head: bool(raw.is_per_head, true),
    min_teamsize: min,
    max_teamsize: Math.max(min, num(raw.max_teamsize, min)),
    total_seats: total,
    seats_filled: Math.min(total, Math.max(0, num(raw.seats_filled))),
    registration_status: oneOf(raw.registration_status, ['OPEN', 'CLOSED', 'SOLD_OUT'] as const, 'CLOSED'),
    registration_deadline: str(raw.registration_deadline),
    schedule_summary,
  };
}

function normDetail(raw: any, fallback: EventSummary): EventDetail {
  const s = normSummary(raw) ?? fallback;
  const sessions: Session[] = (Array.isArray(raw?.schedules) ? raw.schedules : [])
    .map((x: any) => ({
      event_date: str(x?.event_date),
      start_time: str(x?.start_time),
      end_time: str(x?.end_time),
      venue: str(x?.venue),
    }))
    .filter((x: Session) => isYMD(x.event_date) && isHM(x.start_time) && isHM(x.end_time))
    .sort((a: Session, b: Session) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time));

  // If the detail has no usable sessions, derive one from the summary so pages still render.
  if (!sessions.length) {
    const ss = s.schedule_summary;
    sessions.push({ event_date: ss.start_date, start_time: ss.start_time, end_time: ss.end_time, venue: '' });
  }

  return {
    ...s,
    description: str(raw?.description, s.blurb),
    banner_image_url: str(raw?.banner_image_url, s.cover_image_url),
    banner_image_alt: str(raw?.banner_image_alt, s.cover_image_alt),
    gallery_images: strs(raw?.gallery_images),
    highlights: strs(raw?.highlights),
    what_to_expect: strs(raw?.what_to_expect),
    eligibility: strs(raw?.eligibility),
    prerequisites: strs(raw?.prerequisites),
    rules: strs(raw?.rules),
    prizes: (Array.isArray(raw?.prizes) ? raw.prizes : [])
      .map((p: any): Prize => ({
        rank: typeof p?.rank === 'number' ? p.rank : null,
        title: str(p?.title),
        amount: Math.max(0, num(p?.amount)),
        description: str(p?.description),
      }))
      .filter((p: Prize) => p.title),
    faqs: (Array.isArray(raw?.faqs) ? raw.faqs : [])
      .map((f: any): Faq => ({ question: str(f?.question), answer: str(f?.answer) }))
      .filter((f: Faq) => f.question && f.answer),
    schedules: sessions,
    organizers: (Array.isArray(raw?.organizers) ? raw.organizers : [])
      .map((o: any): Organizer => ({ id: str(o?.id), name: str(o?.name), org_type: str(o?.org_type, 'CLUB') }))
      .filter((o: Organizer) => o.name),
    coordinators: (Array.isArray(raw?.coordinators) ? raw.coordinators : [])
      .map((c: any): Coordinator => ({ id: str(c?.id), name: str(c?.name), role: str(c?.role), contact: str(c?.contact) }))
      .filter((c: Coordinator) => c.name),
  };
}

// ---- loading -------------------------------------------------------------

function fromSnapshot(): Dataset {
  const snap = snapshot as any;
  const events = (snap.events as any[])
    .map(normSummary)
    .filter((e): e is EventSummary => !!e)
    .map((s) => normDetail(snap.details?.[s.id] ?? s, s));
  return { events: sortEvents(events), source: 'snapshot', fetchedAt: Date.parse(snap.fetched_at) || Date.now() };
}

function sortEvents(events: EventDetail[]): EventDetail[] {
  return events.sort((a, b) => {
    const ka = a.schedule_summary.start_date + a.schedule_summary.start_time;
    const kb = b.schedule_summary.start_date + b.schedule_summary.start_time;
    return ka.localeCompare(kb) || a.name.localeCompare(b.name);
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fromApi(): Promise<Dataset> {
  const list = await fetchJSON<{ events: unknown[] }>(LIST_URL);
  if (!list || !Array.isArray(list.events) || list.events.length === 0) throw new Error('Empty event list');
  const summaries = list.events.map(normSummary).filter((e): e is EventSummary => !!e);
  const snapDetails = (snapshot as any).details ?? {};
  let fellBack = 0;
  const events = await mapLimit(summaries, 6, async (s) => {
    try {
      const d = await fetchJSON<{ event: unknown }>(eventUrl(s.id), 10_000, 1);
      return normDetail((d as any)?.event ?? s, s);
    } catch {
      fellBack++;
      // Keep live summary fields (seats, status) but take the long-form content from the snapshot.
      const snap = snapDetails[s.id];
      return normDetail(snap ? { ...snap, ...s } : s, s);
    }
  });
  return { events: sortEvents(events), source: fellBack ? 'mixed' : 'api', fetchedAt: Date.now() };
}

let pending: Promise<Dataset> | null = null;

/** All events with full detail. Memoised for the whole build. */
export function getDataset(): Promise<Dataset> {
  if (!pending) {
    const offline = import.meta.env.EVENTS_OFFLINE === '1' || process.env.EVENTS_OFFLINE === '1';
    pending = (offline ? Promise.reject(new Error('EVENTS_OFFLINE=1')) : fromApi()).catch((err) => {
      console.warn(`[afterclass] Events API unavailable at build (${err?.message ?? err}); using snapshot.`);
      return fromSnapshot();
    }).then((ds) => {
      console.log(`[afterclass] ${ds.events.length} events from ${ds.source}.`);
      return ds;
    });
  }
  return pending;
}
