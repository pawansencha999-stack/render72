// Search, filters, sort and view for the events page.
//
// All events are already in the HTML. This script only shows, hides and reorders them,
// so filtering is instant and works offline. The current choices live in the URL
// (?q=&day=&f=&sort=&view=) so a filtered view can be shared, bookmarked or reloaded.

import { onLive } from './live';
import { plural } from '../lib/format';

type Sort = 'date' | 'deadline' | 'seats' | 'price';
interface State {
  q: string;
  day: string;
  f: Set<string>;
  sort: Sort;
  view: 'list' | 'timetable';
}

const GROUPS: Record<string, string[]> = {
  avail: ['open'],
  cost: ['free'],
  kind: ['tech', 'culture'],
  type: ['competition', 'workshop'],
  mode: ['offline', 'online'],
  team: ['solo', 'team'],
};
const groupOf = (v: string) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(v));

export function startEventsPage() {
  const form = document.getElementById('controls') as HTMLFormElement | null;
  if (!form) return;
  form.addEventListener('submit', (e) => e.preventDefault());

  const rows = Array.from(document.querySelectorAll<HTMLElement>('.list-view .ev'));
  const bars = Array.from(document.querySelectorAll<HTMLElement>('.tt-ev'));
  const groups = Array.from(document.querySelectorAll<HTMLElement>('.list-view .group[data-group]'));
  const flatGroup = document.querySelector<HTMLElement>('.group.flat')!;
  const flatList = document.querySelector<HTMLElement>('[data-flat]')!;
  const flatTitle = document.querySelector<HTMLElement>('[data-flat-title]')!;
  const homes = new Map<string, HTMLElement>();
  groups.forEach((g) => {
    const ul = g.querySelector<HTMLElement>('ul');
    if (ul && g.dataset.group !== 'flat') homes.set(g.dataset.group!, ul);
  });
  const panels = document.querySelectorAll<HTMLElement>('[data-view-panel]');
  const ttDays = Array.from(document.querySelectorAll<HTMLElement>('.tt-day'));
  const ttPast = document.querySelector<HTMLElement>('.tt-past');
  const count = document.getElementById('results-count')!;
  const empty = document.querySelector<HTMLElement>('[data-empty]')!;
  const clearBtns = document.querySelectorAll<HTMLButtonElement>('[data-clear]');
  const fcount = document.querySelector<HTMLElement>('[data-fcount]');
  const toggle = document.querySelector<HTMLButtonElement>('.toggle-filters');
  const panel = document.getElementById('filter-panel');
  const search = form.elements.namedItem('q') as HTMLInputElement;
  const sortSel = form.elements.namedItem('sort') as HTMLSelectElement;
  const dayLabels = new Map<string, string>();
  form.querySelectorAll<HTMLInputElement>('input[name="day"]').forEach((i) => dayLabels.set(i.value, i.nextElementSibling?.textContent ?? i.value));

  // ---- state <-> URL ------------------------------------------------------
  const read = (): State => {
    const p = new URLSearchParams(location.search);
    const day = p.get('day') ?? 'all';
    const sort = (p.get('sort') as Sort) ?? 'date';
    const view = p.get('view') === 'timetable' ? 'timetable' : 'list';
    return {
      q: (p.get('q') ?? '').slice(0, 80),
      day: dayLabels.has(day) ? day : 'all',
      f: new Set((p.get('f') ?? '').split(',').filter((x) => groupOf(x))),
      sort: ['date', 'deadline', 'seats', 'price'].includes(sort) ? sort : 'date',
      view,
    };
  };

  const write = (s: State) => {
    const p = new URLSearchParams();
    if (s.q) p.set('q', s.q);
    if (s.day !== 'all') p.set('day', s.day);
    if (s.f.size) p.set('f', [...s.f].join(','));
    if (s.sort !== 'date') p.set('sort', s.sort);
    if (s.view !== 'list') p.set('view', s.view);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  const fromForm = (): State => ({
    q: search.value.trim(),
    day: (form.querySelector<HTMLInputElement>('input[name="day"]:checked')?.value) ?? 'all',
    f: new Set(Array.from(form.querySelectorAll<HTMLInputElement>('.chip input:checked')).map((i) => i.value)),
    sort: sortSel.value as Sort,
    view: (form.querySelector<HTMLInputElement>('input[name="view"]:checked')?.value as State['view']) ?? 'list',
  });

  const toForm = (s: State) => {
    search.value = s.q;
    form.querySelectorAll<HTMLInputElement>('input[name="day"]').forEach((i) => (i.checked = i.value === s.day));
    form.querySelectorAll<HTMLInputElement>('.chip input').forEach((i) => (i.checked = s.f.has(i.value)));
    sortSel.value = s.sort;
    form.querySelectorAll<HTMLInputElement>('input[name="view"]').forEach((i) => (i.checked = i.value === s.view));
  };

  // ---- matching -------------------------------------------------------------
  const matches = (el: HTMLElement, s: State, tokens: string[]) => {
    const d = el.dataset;
    if (s.day === 'past') {
      if (d.past !== '1') return false;
    } else {
      if (d.past === '1') return false;
      if (s.day !== 'all' && !(d.days ?? '').split(' ').includes(s.day)) return false;
    }
    const tags = (d.tags ?? '').split(' ');
    for (const [g, opts] of Object.entries(GROUPS)) {
      const chosen = opts.filter((o) => s.f.has(o));
      if (!chosen.length) continue;
      if (g === 'avail') {
        if (d.open !== '1') return false;
      } else if (!chosen.some((o) => tags.includes(o))) return false;
    }
    if (tokens.length) {
      const hay = d.search ?? '';
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  };

  const key = (el: HTMLElement, sort: Sort) => {
    const d = el.dataset;
    if (sort === 'deadline') return Number(d.deadline) || Infinity;
    if (sort === 'seats') return d.open === '1' ? Number(d.seats) : 1e9 + Number(d.seats);
    if (sort === 'price') return Number(d.price);
    return Number(d.start);
  };

  // ---- render -------------------------------------------------------------
  let state = read();
  toForm(state);

  const render = () => {
    const s = state;
    const tokens = s.q.toLowerCase().split(/\s+/).filter(Boolean);
    const visible = rows.filter((r) => matches(r, s, tokens));
    const vis = new Set(visible);
    rows.forEach((r) => (r.hidden = !vis.has(r)));

    const grouped = s.sort === 'date' && s.day === 'all';
    if (grouped) {
      // Put each row back in its day, in time order.
      homes.forEach((ul, g) => {
        const own = rows.filter((r) => r.dataset.home === g).sort((a, b) => key(a, 'date') - key(b, 'date'));
        own.forEach((r) => ul.appendChild(r));
      });
      groups.forEach((g) => {
        const id = g.dataset.group!;
        if (id === 'flat') return (g.hidden = true);
        const n = rows.filter((r) => r.dataset.home === id && vis.has(r)).length;
        g.hidden = id === 'past' ? true : n === 0;
        const c = g.querySelector<HTMLElement>('[data-group-count]');
        if (c) c.textContent = plural(n, 'event');
      });
    } else {
      groups.forEach((g) => (g.hidden = g.dataset.group !== 'flat'));
      visible.sort((a, b) => key(a, s.sort) - key(b, s.sort) || key(a, 'date') - key(b, 'date'));
      visible.forEach((r) => flatList.appendChild(r));
      flatGroup.hidden = visible.length === 0;
      const sortLabel = sortSel.options[sortSel.selectedIndex]?.text.toLowerCase();
      const dayLabel = s.day === 'all' ? 'All upcoming' : s.day === 'past' ? 'Already happened' : dayLabels.get(s.day) ?? '';
      flatTitle.textContent = s.sort === 'date' ? dayLabel : `${dayLabel}, by ${sortLabel}`;
    }

    // Timetable: dim what the filters leave out so clashes stay visible.
    bars.forEach((b) => {
      const on = matches(b, { ...s, day: 'all' }, tokens);
      b.classList.toggle('dim', !on);
      b.querySelector('a')?.setAttribute('tabindex', on ? '0' : '-1');
      if (on) b.removeAttribute('aria-hidden');
      else b.setAttribute('aria-hidden', 'true');
    });
    ttDays.forEach((d) => (d.hidden = s.day === 'past' || (s.day !== 'all' && d.dataset.day !== s.day)));
    if (ttPast) ttPast.hidden = s.day !== 'past';

    panels.forEach((p) => (p.hidden = p.dataset.viewPanel !== s.view));
    form.dataset.view = s.view;
    document.querySelectorAll<HTMLAnchorElement>('.site-header a[href^="/events/"]').forEach((a) => {
      const isTt = a.getAttribute('href')!.includes('view=timetable');
      if (isTt === (s.view === 'timetable')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const n = visible.length;
    const what = s.day === 'past' ? 'past event' : 'upcoming event';
    count.textContent = n ? `Showing ${plural(n, what)}` : `No ${what}s match`;
    const hasFilters = s.f.size > 0 || !!s.q || s.day !== 'all';
    empty.hidden = n > 0 || s.view === 'timetable';
    clearBtns.forEach((b) => (b.hidden = !hasFilters && b.closest('[data-empty]') === null));
    if (fcount) {
      fcount.hidden = s.f.size === 0;
      fcount.textContent = String(s.f.size);
    }
    write(s);
  };

  const update = () => {
    state = fromForm();
    render();
  };

  let t: number | undefined;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(update, 120);
  });
  form.addEventListener('change', (e) => {
    if ((e.target as HTMLElement) !== search) update();
  });
  clearBtns.forEach((b) =>
    b.addEventListener('click', () => {
      state = { q: '', day: 'all', f: new Set(), sort: 'date', view: state.view };
      toForm(state);
      render();
      search.focus();
    }),
  );
  // "/" jumps to the search box, as on many listing sites.
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing =
      t.isContentEditable ||
      /^(TEXTAREA|SELECT)$/.test(t.tagName) ||
      (t.tagName === 'INPUT' && !/^(radio|checkbox|button|submit)$/.test((t as HTMLInputElement).type));
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !typing) {
      e.preventDefault();
      search.focus();
    }
  });
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    panel?.classList.toggle('open', open);
  });

  // Sticky controls get a shadow once they float over the list. taste-skill-ignore
  const sentinel = document.createElement('div');
  form.before(sentinel);
  new IntersectionObserver(([e]) => form.classList.toggle('stuck', !e.isIntersecting), {
    rootMargin: `-${(document.querySelector('.site-header') as HTMLElement)?.offsetHeight ?? 68}px 0px 0px 0px`,
  }).observe(sentinel);

  // "Now" line on the timetable during the event days.
  const placeNow = () => {
    const now = new Date(Date.now() + 330 * 60_000);
    const today = now.toISOString().slice(0, 10);
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    document.querySelectorAll<HTMLElement>('.tt').forEach((tt) => {
      const line = tt.querySelector<HTMLElement>('.tt-now');
      if (!line) return;
      const h0 = Number(getComputedStyle(tt).getPropertyValue('--h0'));
      const hours = Number(getComputedStyle(tt).getPropertyValue('--hours'));
      const inRange = tt.dataset.day === today && mins >= h0 * 60 && mins <= (h0 + hours) * 60;
      line.hidden = !inRange;
      if (inRange) tt.style.setProperty('--now', String(mins));
    });
  };
  placeNow();
  setInterval(placeNow, 60_000);

  // Live seat counts can change what "Open for registration" and "Fewest seats" show.
  onLive(() => render());
  render();
}
