// The plan page: show the saved events, work out the numbers, and offer the calendar file,
// a share link and a way to clear the plan. A link with ?p=… shows someone else's plan,
// with a button to add it to yours.

import { buildIcs } from '../lib/calendar';
import { fmtRupees, plural } from '../lib/format';
import { clashesWith, onPlan, planData, readPlan, setPlan } from './plan';
import type { PlanEvent } from '../lib/plan-types';

/** Shared links carry the first ten hex digits of each id, which is plenty to tell 30 events apart. */
const short = (id: string) => id.replace(/-/g, '').slice(0, 10);

export function startPlanPage() {
  const root = document.querySelector<HTMLElement>('[data-plan-page]');
  if (!root) return;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const qa = <T extends HTMLElement = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));

  const rows = qa('.list .ev[data-ev]');
  const days = qa('[data-plan-day]');
  const bars = qa('.tt-ev[data-ev]');
  const known = [...new Set(rows.map((r) => r.dataset.ev!))];
  const msg = q('[data-plan-msg]');

  // A shared plan?
  const p = new URLSearchParams(location.search).get('p');
  const shared = p
    ? p.split('.').map((s) => known.find((id) => short(id) === s)).filter((x): x is string => !!x)
    : null;
  if (shared) {
    const box = q('[data-plan-shared]')!;
    box.hidden = false;
    q('[data-shared-count]')!.textContent = `${plural(shared.length, 'event')}.`;
    q('[data-shared-add]')!.addEventListener('click', () => {
      setPlan([...readPlan(), ...shared]);
      location.href = '/plan/';
    });
    q<HTMLButtonElement>('[data-plan-clear]')!.hidden = true;
  }

  const current = () => (shared ?? readPlan()).filter((id) => known.includes(id));

  const say = (html: string) => {
    if (msg) msg.innerHTML = html;
  };

  function render() {
    const ids = current();
    const set = new Set(ids);
    rows.forEach((r) => (r.hidden = !set.has(r.dataset.ev!)));
    days.forEach((d) => {
      const n = d.querySelectorAll('.ev[data-ev]:not([hidden])').length;
      d.hidden = n === 0;
      const c = d.querySelector('[data-day-count]');
      if (c) c.textContent = plural(n, 'event');
    });
    bars.forEach((b) => b.classList.toggle('dim', !set.has(b.dataset.ev!)));
    const has = ids.length > 0;
    qa('[data-plan-filled]').forEach((s) => (s.hidden = !has));
    q('[data-plan-empty]')!.hidden = has;
    if (has) stats(ids);
  }

  function stats(ids: string[]) {
    const set = (k: string, v: string) => {
      const el = q(`[data-stat="${k}"]`);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('count', String(ids.length));
    planData()
      .then((map) => {
        const evs = ids.map((id) => map.get(id)).filter((x): x is PlanEvent => !!x);
        const dayset = new Set(evs.flatMap((e) => e.sessions.map(([s]) => new Date(s + 5.5 * 3600_000).toISOString().slice(0, 10))));
        set('days', dayset.size ? `across ${plural(dayset.size, 'day')}` : '');
        const hours = evs.reduce((n, e) => n + e.sessions.reduce((m, [s, t]) => m + (t - s), 0), 0) / 3600_000;
        set('hours', String(Math.round(hours)));

        // Each clashing pair once.
        const pairs: string[] = [];
        evs.forEach((e, i) => clashesWith(e.id, map, ids).forEach((o) => {
          if (ids.indexOf(o.id) > i) pairs.push(`${e.title} and ${o.title}`);
        }));
        set('clashes', String(pairs.length));
        set('clash-text', pairs.length ? pairs.slice(0, 2).join('; ') + (pairs.length > 2 ? `; ${pairs.length - 2} more` : '') : 'Nothing overlaps');
        const fig = q('[data-clash-fig]');
        if (fig) fig.toggleAttribute('data-has', pairs.length > 0);

        const paid = evs.filter((e) => e.price > 0);
        set('fees', fmtRupees(paid.reduce((n, e) => n + e.price, 0)));
        const free = evs.length - paid.length;
        set('free', paid.length ? `once per event, as listed${free ? `; ${free} free` : ''}` : 'every event here is free');

        const now = Date.now();
        const next = evs.filter((e) => e.deadlineMs > now && !e.past).sort((a, b) => a.deadlineMs - b.deadlineMs)[0];
        set('deadline', next ? next.deadline : 'None left');
        set('deadline-for', next ? `to register for ${next.title}` : 'Every deadline in your plan has passed');
      })
      .catch(() => set('clash-text', 'Times unavailable right now'));
  }

  // Calendar file with every event in the plan.
  q('[data-plan-ics]')?.addEventListener('click', () => {
    planData()
      .then((map) => {
        const evs = current().map((id) => map.get(id)).filter((x): x is PlanEvent => !!x && !x.past);
        const ics = buildIcs(
          evs.map((e) => ({
            id: e.id,
            name: e.name,
            online: e.online,
            description: e.blurb,
            url: new URL(e.href, location.origin).href,
            sessions: e.sessions.map(([start, end, venue]) => ({ start, end, venue })),
          })),
        );
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'afterclass-plan.ics';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        say(`Calendar file with ${plural(evs.length, 'event')} downloaded. Open it to add them to your calendar.`);
      })
      .catch(() => say('Couldn’t build the calendar file just now. Try again in a moment.'));
  });

  // Share link.
  q('[data-plan-share]')?.addEventListener('click', async () => {
    const url = new URL(`/plan/?p=${current().map(short).join('.')}`, location.origin).href;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await nav.share({ title: 'My afterclass plan', url });
        return;
      } catch {
        /* cancelled: fall through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied. Whoever opens it sees your plan and can add it to theirs.');
    } catch {
      say(`Copy this link: <span class="num">${url}</span>`);
    }
  });

  // Clear, with undo.
  q('[data-plan-clear]')?.addEventListener('click', () => {
    const before = readPlan();
    setPlan([]);
    q('[data-plan-empty]')?.querySelector<HTMLElement>('h2')?.setAttribute('tabindex', '-1');
    const empty = q('[data-plan-empty]');
    const undo = document.createElement('p');
    undo.className = 'small undo';
    undo.innerHTML = `Plan cleared. <button type="button">Undo</button>`;
    undo.querySelector('button')!.addEventListener('click', () => {
      setPlan(before);
      undo.remove();
    });
    empty?.prepend(undo);
    undo.querySelector('button')!.focus();
  });

  onPlan(render);
  render();
}
