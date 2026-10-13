// Live seat counts and registration status, refreshed in the browser.
//
// Every page is fully rendered at build time, so it works even if this script never runs.
// This script asks the Events API for the current numbers and patches them in place.
// When the API can't be reached it falls back to the last response saved on this device,
// and says so, with a retry button. It never polls: it refreshes once on load and again
// when the tab comes back into view after a minute, which keeps API traffic to roughly one
// request per page view even at 10k visitors a day.

import { availability } from '../lib/availability';
import { fmtAgo, fmtStamp, fmtUntil, groupIN } from '../lib/format';
import type { LiveFields } from '../lib/types';

const root = document.documentElement;
const API = (root.dataset.api || 'https://render72.pages.dev').replace(/\/$/, '');
const BUILT_AT = Number(root.dataset.built) || Date.now();
const CACHE_KEY = 'afterclass:live:v1';
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
const TIMEOUT_MS = 8000;
const REFRESH_AFTER_MS = 60_000;

export type LiveState = 'loading' | 'live' | 'offline' | 'error';
export interface LiveResult {
  state: LiveState;
  at: number;
  events: Map<string, LiveFields>;
  authoritative: boolean;
}

const isLive = (x: any): x is LiveFields =>
  x && typeof x.id === 'string' && typeof x.total_seats === 'number' && typeof x.seats_filled === 'number';

const pick = (x: any): LiveFields => ({
  id: x.id,
  event_status: x.event_status,
  registration_status: x.registration_status,
  seats_filled: x.seats_filled,
  total_seats: x.total_seats,
  registration_deadline: x.registration_deadline,
});

function readCache(): { at: number; events: LiveFields[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events) || Date.now() - parsed.at > CACHE_MAX_AGE) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(at: number, events: LiveFields[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at, events }));
  } catch {
    /* storage full or blocked: live data still works for this view */
  }
}

async function getJSON(url: string): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/test/events, with one quick retry. */
async function fetchList(): Promise<LiveFields[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, body } = await getJSON(`${API}/api/test/events`);
      if (status !== 200 || !body || !Array.isArray(body.events)) throw new Error(`Unexpected response (${status})`);
      return body.events.filter(isLive).map(pick);
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw lastErr;
}

/** GET /api/test/events/{id}. Resolves to null when the event no longer exists (404). */
export async function fetchEvent(id: string): Promise<any | null> {
  const { status, body } = await getJSON(`${API}/api/test/events/${encodeURIComponent(id)}`);
  if (status === 404) return null;
  if (status !== 200 || !body?.event) throw new Error(`Unexpected response (${status})`);
  return body.event;
}

// ---- writing values into the page ---------------------------------------

/** Writes only when the value changes, so a refresh with the same numbers costs no layout. */
function setText(scope: ParentNode, sel: string, text: string) {
  scope.querySelectorAll<HTMLElement>(sel).forEach((n) => {
    if (n.textContent !== text) n.textContent = text;
  });
}
function setData(el: HTMLElement, key: string, value: string) {
  if (el.dataset[key] !== value) el.dataset[key] = value;
}

/** Patch one event's numbers everywhere it appears on the page. */
export function applyEvent(id: string, live: LiveFields | null, now = Date.now()) {
  document.querySelectorAll<HTMLElement>(`[data-ev="${CSS.escape(id)}"]`).forEach((el) => {
    if (!live) {
      el.dataset.avail = 'removed';
      el.dataset.open = '0';
      setText(el, '[data-f="status"]', 'No longer listed');
      el.querySelectorAll<HTMLElement>('[data-f="status"]').forEach((n) => (n.dataset.avail = 'removed'));
      el.querySelectorAll<HTMLElement>('[data-f="register"]').forEach((b) => setRegister(b, false, 'removed'));
      return;
    }
    const a = availability(live, now);
    setData(el, 'avail', a.key);
    setData(el, 'open', a.canRegister ? '1' : '0');
    setData(el, 'seats', String(a.seatsLeft));
    setText(el, '[data-f="seats"]', a.seatsText);
    setText(el, '[data-f="left"]', String(a.seatsLeft));
    el.querySelectorAll<HTMLElement>('[data-f="status"]').forEach((n) => {
      if (n.textContent !== a.label) n.textContent = a.label;
      setData(n, 'avail', a.key);
    });
    const fill = a.fill.toFixed(3);
    el.querySelectorAll<HTMLElement>('[data-f="meter"]').forEach((n) => {
      if (n.style.getPropertyValue('--fill') !== fill) n.style.setProperty('--fill', fill);
    });
    el.querySelectorAll<HTMLElement>('[data-f="register"]').forEach((b) => {
      const isLink = b.tagName === 'A';
      const stale = isLink !== a.canRegister || (!isLink && b.textContent !== (CLOSED_LABEL[a.key] ?? 'Registration closed'));
      if (stale) setRegister(b, a.canRegister, a.key);
    });
  });
}

const CLOSED_LABEL: Record<string, string> = {
  soldout: 'Sold out',
  regclosed: 'Registration closed',
  closed: 'Closed by the organisers',
  completed: 'This event has ended',
  removed: 'No longer available',
};

/**
 * Enable or disable a Register control without losing where it points.
 * Enabled it is a real link; disabled it becomes plain text, so there is never a link that goes nowhere.
 */
export function setRegister(b: HTMLElement, can: boolean, key: string) {
  const href = b.dataset.href || b.getAttribute('href') || '';
  const tag = can && href ? 'a' : 'span';
  let el = b;
  if (b.tagName.toLowerCase() !== tag) {
    el = document.createElement(tag);
    for (const attr of Array.from(b.attributes)) if (attr.name !== 'href') el.setAttribute(attr.name, attr.value);
    b.replaceWith(el);
  }
  if (href) el.dataset.href = href;
  if (tag === 'a') {
    el.setAttribute('href', href);
    el.removeAttribute('aria-disabled');
    el.textContent = el.dataset.label || 'Register';
  } else {
    el.setAttribute('aria-disabled', 'true');
    el.textContent = CLOSED_LABEL[key] ?? 'Registration closed';
  }
}

function applyAggregates(list: LiveFields[]) {
  const active = list.filter((e) => e.event_status === 'ACTIVE');
  const open = active.filter((e) => availability(e).canRegister);
  const values: Record<string, number> = {
    seatsLeft: open.reduce((n, e) => n + Math.max(0, e.total_seats - e.seats_filled), 0),
    seatsTotal: active.reduce((n, e) => n + e.total_seats, 0),
    openCount: open.length,
    upcoming: active.length,
  };
  document.querySelectorAll<HTMLElement>('[data-agg]').forEach((n) => {
    const v = values[n.dataset.agg!];
    if (typeof v === 'number' && n.textContent !== groupIN(v)) n.textContent = groupIN(v);
  });
}

/** Relative deadlines ("closes in 3 days") are only correct at view time, so they are written here. */
export function applyUntil(now = Date.now()) {
  document.querySelectorAll<HTMLElement>('[data-until]').forEach((n) => {
    const t = Number(n.dataset.until);
    const rel = fmtUntil(t, now);
    n.textContent = rel ? `(${rel})` : n.dataset.past ?? '';
  });
}

// ---- the status note --------------------------------------------------------

function renderNote(state: LiveState, at: number) {
  document.querySelectorAll<HTMLElement>('[data-live-note]').forEach((note) => {
    note.dataset.state = state;
    const text = note.querySelector<HTMLElement>('[data-live-text]');
    const retry = note.querySelector<HTMLButtonElement>('[data-live-retry]');
    if (text) {
      text.textContent =
        state === 'loading' ? 'Checking the latest seat counts…'
        : state === 'live' ? `Live seat counts, updated ${fmtAgo(at, Date.now())}`
        : state === 'offline' ? `Can't reach the events service. Showing seat counts saved on ${fmtStamp(at)}.`
        : `Can't reach the events service. Showing seat counts from ${fmtStamp(at)}.`;
    }
    if (retry) retry.hidden = state === 'live' || state === 'loading';
  });
}

// ---- lifecycle -----------------------------------------------------------

type Listener = (r: LiveResult) => void;
const listeners: Listener[] = [];
let last: LiveResult | null = null;
let inflight: Promise<LiveResult> | null = null;

export function onLive(fn: Listener) {
  listeners.push(fn);
  if (last) fn(last);
}

function publish(r: LiveResult) {
  last = r;
  r.events.forEach((live, id) => applyEvent(id, live));
  if (r.authoritative) {
    // Events rendered at build time that the API no longer returns have been removed.
    document.querySelectorAll<HTMLElement>('[data-ev]').forEach((el) => {
      const id = el.dataset.ev!;
      if (!r.events.has(id) && el.dataset.avail !== 'removed') applyEvent(id, null);
    });
  }
  applyAggregates([...r.events.values()]);
  renderNote(r.state, r.at);
  listeners.forEach((fn) => fn(r));
}

export function refresh(): Promise<LiveResult> {
  if (inflight) return inflight;
  renderNote('loading', Date.now());
  inflight = fetchList()
    .then((events) => {
      const at = Date.now();
      writeCache(at, events);
      return { state: 'live' as const, at, events: new Map(events.map((e) => [e.id, e])), authoritative: true };
    })
    .catch(() => {
      const cached = readCache();
      if (cached && cached.at > BUILT_AT) {
        return { state: 'offline' as const, at: cached.at, events: new Map(cached.events.map((e) => [e.id, e])), authoritative: false };
      }
      // Nothing newer than the build: keep the numbers already on the page.
      return { state: 'error' as const, at: BUILT_AT, events: new Map(), authoritative: false };
    })
    .then((r) => {
      publish(r);
      return r;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Resolves once the page has loaded and painted, so live requests never compete with the first render. */
export function afterFirstPaint(): Promise<void> {
  const loaded =
    document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true }));
  return loaded
    .then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    .then(
      () =>
        new Promise<void>((r) => {
          if ('requestIdleCallback' in window) (window as any).requestIdleCallback(() => r(), { timeout: 1200 });
          else setTimeout(r, 200);
        }),
    );
}

export function startLive() {
  applyUntil();
  document.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('[data-live-retry]');
    if (btn) refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && last && Date.now() - last.at > REFRESH_AFTER_MS) refresh();
  });
  // Keep "updated N minutes ago" honest while the page stays open.
  setInterval(() => {
    if (last?.state === 'live') renderNote('live', last.at);
    // Re-evaluate statuses so a deadline that passes while the page is open shows as closed.
    last?.events.forEach((live, id) => applyEvent(id, live));
    applyUntil();
  }, 30_000);
  return afterFirstPaint().then(refresh);
}
