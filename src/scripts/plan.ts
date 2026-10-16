// Your plan: the events you save as you browse, kept in this browser.
//
// Every Save button is a <button data-save="<event id>">. Saving updates every button for that
// event, the count in the header and, once the plan has two or more events, the clash notes
// ([data-clash="<event id>"]) on the page: an event clashes when any of its sessions overlaps a
// session of something else in the plan. Session times come from /plan-data.json, which is
// built with the site and fetched only when there is something to check.

import type { PlanEvent } from '../lib/plan-types';
import { afterFirstPaint } from './live';

const KEY = 'afterclass-plan';
let cache: string[] | null = null;

export function readPlan(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    cache = [];
  }
  return cache;
}

const listeners = new Set<() => void>();
export function onPlan(fn: () => void) {
  listeners.add(fn);
}
const emit = () => listeners.forEach((fn) => fn());

export function setPlan(ids: string[]) {
  cache = [...new Set(ids)];
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode or storage full: the plan still works for this page view */
  }
  emit();
}

export function toggle(id: string): boolean {
  const ids = readPlan();
  const on = !ids.includes(id);
  setPlan(on ? [...ids, id] : ids.filter((x) => x !== id));
  return on;
}

// ---- event data -------------------------------------------------------------

let data: Promise<Map<string, PlanEvent>> | null = null;
export function planData(): Promise<Map<string, PlanEvent>> {
  if (!data) {
    data = fetch('/plan-data.json')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j: { events: PlanEvent[] }) => new Map(j.events.map((e) => [e.id, e])))
      .catch((err) => {
        data = null;
        throw err;
      });
  }
  return data;
}

export const overlaps = (a: PlanEvent, b: PlanEvent) =>
  a.sessions.some(([s1, e1]) => b.sessions.some(([s2, e2]) => s1 < e2 && s2 < e1));

/** Events in the plan whose times overlap this one. */
export function clashesWith(id: string, map: Map<string, PlanEvent>, ids = readPlan()): PlanEvent[] {
  const ev = map.get(id);
  if (!ev || ev.past) return [];
  return ids
    .filter((x) => x !== id)
    .map((x) => map.get(x))
    .filter((o): o is PlanEvent => !!o && !o.past && overlaps(ev, o));
}

/** "TrackTact", "TrackTact and SpanCraft", "TrackTact, SpanCraft and 2 more" */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

// ---- painting ---------------------------------------------------------------

function paintButtons() {
  const ids = readPlan();
  document.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
    const on = ids.includes(b.dataset.save!);
    if (b.dataset.on === String(on)) return;
    b.dataset.on = String(on);
    const off = b.dataset.labelOff || 'Save';
    const yes = b.dataset.labelOn || 'Saved';
    const label = b.querySelector('[data-save-label]');
    if (label) label.textContent = on ? yes : off;
    const t = b.dataset.title;
    if (t) b.setAttribute('aria-label', on ? `${yes}. Remove ${t} from your plan` : `${off} ${t} to your plan`);
  });
  document.querySelectorAll<HTMLElement>('.ev[data-ev], .tt-ev[data-ev]').forEach((el) => {
    const on = ids.includes(el.dataset.ev!);
    if ((el.dataset.saved === '1') !== on) {
      if (on) el.dataset.saved = '1';
      else delete el.dataset.saved;
    }
  });
  document.querySelectorAll<HTMLElement>('[data-plan-count]').forEach((c) => {
    if (c.textContent !== String(ids.length)) c.textContent = String(ids.length);
  });
}

function paintClashes() {
  const notes = Array.from(document.querySelectorAll<HTMLElement>('[data-clash]'));
  if (!notes.length) return;
  const ids = readPlan();
  if (!ids.length) {
    notes.forEach((n) => (n.hidden = true));
    return;
  }
  planData()
    .then((map) => {
      const plan = readPlan();
      notes.forEach((n) => {
        const id = n.dataset.clash!;
        const list = clashesWith(id, map, plan);
        if (!list.length) {
          n.hidden = true;
          return;
        }
        const withWhen = n.hasAttribute('data-clash-when');
        const names = nameList(list.map((x) => (withWhen ? `${x.title} (${x.when})` : x.title)));
        const text = plan.includes(id) ? `Clashes with ${names}, also in your plan.` : `Clashes with ${names} in your plan.`;
        if (n.textContent !== text) n.textContent = text;
        n.hidden = false;
      });
    })
    .catch(() => {
      /* without session times there is nothing to compare; the notes stay hidden */
    });
}

function announce(msg: string) {
  const el = document.querySelector<HTMLElement>('[data-plan-announce]');
  if (!el) return;
  el.textContent = '';
  window.setTimeout(() => (el.textContent = msg), 60);
}

function bump() {
  document.querySelectorAll<HTMLElement>('[data-plan-count]').forEach((c) => {
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
  });
}

export function startPlan() {
  paintButtons();
  onPlan(() => {
    paintButtons();
    paintClashes();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = null;
      emit();
    }
  });
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-save]');
    if (!b) return;
    e.preventDefault();
    const on = toggle(b.dataset.save!);
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    bump();
    const n = readPlan().length;
    const what = b.dataset.title || b.dataset.name || 'This event';
    announce(on ? `${what} saved. ${n} in your plan.` : `${what} removed. ${n} in your plan.`);
  });
  afterFirstPaint().then(paintClashes);
}
