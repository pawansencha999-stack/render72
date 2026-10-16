// View models: everything a page needs to show an event, computed once at build time.

import type { EventDetail, Session } from './types';
import { availability, type Availability } from './availability';
import {
  fmtDay, fmtTimeRange, fmtTime, fmtDeadline, fmtPrice, fmtTeam, slugify, splitName, istEpoch, parseYMD,
} from './format';

export interface TimeBlock {
  date: string;
  startMin: number; // minutes from 00:00 IST
  endMin: number;
  venue: string;
}

export interface EventView {
  e: EventDetail;
  id: string;
  slug: string;
  href: string;
  title: string;
  subtitle: string;
  days: string[];
  firstDay: string;
  isPast: boolean;
  whenDate: string;
  whenTime: string;
  whenShort: string;
  venue: string;
  venueShort: string;
  online: boolean;
  price: { amount: string; unit: string; short: string };
  team: string;
  teamKind: 'solo' | 'team' | 'either';
  deadline: string;
  deadlineMs: number;
  startMs: number;
  endMs: number;
  avail: Availability;
  kind: 'tech' | 'culture';
  club: string;
  blocks: TimeBlock[];
  search: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayRange(a: string, b: string): string {
  if (a === b) return fmtDay(a);
  const A = parseYMD(a);
  const B = parseYMD(b);
  const da = fmtDay(a).split(' ')[0];
  const db = fmtDay(b).split(' ')[0];
  if (A.m === B.m) return `${da} ${A.d} – ${db} ${B.d} ${MONTHS[B.m - 1]}`;
  return `${fmtDay(a)} – ${fmtDay(b)}`;
}

const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  if (h === 23 && m === 59) return 1440;
  return h * 60 + m;
};

function nextDay(ymd: string): string {
  const { y, m, d } = parseYMD(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/** Human description of when an event happens, from its sessions. */
function describeWhen(sessions: Session[]): { date: string; time: string; short: string } {
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  if (sessions.length === 1) {
    return {
      date: fmtDay(first.event_date),
      time: fmtTimeRange(first.start_time, first.end_time),
      short: `${fmtDay(first.event_date)}, ${fmtTime(first.start_time)}`,
    };
  }
  // Overnight: sessions that run into each other across midnight read as one stretch.
  const continuous = sessions.every((s, i) => {
    if (i === 0) return true;
    const prev = sessions[i - 1];
    return toMin(prev.end_time) >= 1440 && s.start_time === '00:00' && s.event_date === nextDay(prev.event_date);
  });
  const dayWord = (ymd: string) => fmtDay(ymd).split(' ')[0];
  if (continuous) {
    return {
      date: dayRange(first.event_date, last.event_date),
      time: `${fmtTime(first.start_time)} ${dayWord(first.event_date)} – ${fmtTime(last.end_time)} ${dayWord(last.event_date)}`,
      short: `${fmtDay(first.event_date)}, ${fmtTime(first.start_time)}`,
    };
  }
  const sameHours = sessions.every((s) => s.start_time === first.start_time && s.end_time === first.end_time);
  return {
    date: dayRange(first.event_date, last.event_date),
    time: sameHours ? `${fmtTimeRange(first.start_time, first.end_time)}, each day` : `${sessions.length} sessions`,
    short: `${fmtDay(first.event_date)}, ${fmtTime(first.start_time)}`,
  };
}

/** "Robotics Arena, Mechanical Workshop Hall" → "Robotics Arena". */
export function shortVenue(v: string): string {
  const a = v.split(',')[0].trim();
  return a.length > 28 && a.includes(' and ') ? a.split(' and ')[0].trim() : a;
}

const usedSlugs = new Map<string, string>();

function uniqueSlug(name: string, id: string): string {
  let s = slugify(name) || id.slice(0, 8);
  const owner = usedSlugs.get(s);
  if (owner && owner !== id) s = `${s}-${id.slice(0, 6)}`;
  usedSlugs.set(s, id);
  return s;
}

export function toView(e: EventDetail, now = Date.now()): EventView {
  const sessions = e.schedules;
  const [title, subtitle] = splitName(e.name);
  const when = describeWhen(sessions);
  const venues = [...new Set(sessions.map((s) => s.venue).filter(Boolean))];
  const online = e.event_mode === 'ONLINE';
  const slug = uniqueSlug(e.name, e.id);
  const ss = e.schedule_summary;
  const club = e.organizers[0]?.name ?? '';
  const teamKind = e.max_teamsize <= 1 ? 'solo' : e.min_teamsize > 1 ? 'team' : 'either';
  const blocks: TimeBlock[] = sessions.map((s) => ({
    date: s.event_date,
    startMin: toMin(s.start_time),
    endMin: Math.max(toMin(s.end_time), toMin(s.start_time) + 30),
    venue: s.venue,
  }));

  return {
    e,
    id: e.id,
    slug,
    href: `/events/${slug}/`,
    title,
    subtitle,
    days: [...new Set(sessions.map((s) => s.event_date))],
    firstDay: ss.start_date,
    // CLOSED means registration is closed, not that the event has happened: a closed event
    // with dates ahead stays in the upcoming list, marked "Closed".
    isPast: e.event_status === 'COMPLETED' || istEpoch(ss.end_date, ss.end_time) < now,
    whenDate: when.date,
    whenTime: when.time,
    whenShort: when.short,
    venue: venues[0] ?? (online ? 'Online' : ''),
    venueShort: online ? 'Online' : shortVenue(venues[0] ?? ''),
    online,
    price: fmtPrice(e.price, e.is_per_head, e.max_teamsize),
    team: fmtTeam(e.min_teamsize, e.max_teamsize),
    teamKind,
    deadline: fmtDeadline(e.registration_deadline),
    deadlineMs: Date.parse(e.registration_deadline) || 0,
    startMs: istEpoch(ss.start_date, ss.start_time),
    endMs: istEpoch(ss.end_date, ss.end_time),
    avail: availability(e, now),
    kind: e.is_technical ? 'tech' : 'culture',
    club,
    blocks,
    search: [e.name, e.blurb, e.category, club, ...e.tags, ...venues].join(' ').toLowerCase(),
  };
}

export interface Overview {
  upcoming: EventView[];
  past: EventView[];
  days: string[];
  seatsTotal: number;
  seatsLeft: number;
  openCount: number;
  prizePool: number;
  clubs: number;
  free: number;
  first?: EventView;
  last?: EventView;
  /** The main run of consecutive days (the fest weekend), its events, and anything outside it. */
  mainDays: string[];
  main: EventView[];
  extra: EventView[];
  mainFirst?: EventView;
  mainLast?: EventView;
}

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** The longest run of consecutive days; ties go to the run with more events. */
function mainRun(days: string[], count: (d: string) => number): string[] {
  let best: string[] = [];
  let run: string[] = [];
  for (const d of days) {
    if (run.length && dayMs(d) - dayMs(run[run.length - 1]) !== 86_400_000) run = [];
    run.push(d);
    const score = (r: string[]) => r.reduce((n, x) => n + count(x), 0);
    if (run.length > best.length || (run.length === best.length && score(run) > score(best))) best = [...run];
  }
  return best;
}

export function overview(views: EventView[]): Overview {
  const upcoming = views.filter((v) => !v.isPast);
  const past = views.filter((v) => v.isPast).sort((a, b) => b.startMs - a.startMs);
  const days = [...new Set(upcoming.flatMap((v) => v.days))].sort();
  const open = upcoming.filter((v) => v.avail.canRegister);
  const lastByEnd = [...upcoming].sort((a, b) => b.endMs - a.endMs)[0];
  const mainDays = mainRun(days, (d) => upcoming.filter((v) => v.days.includes(d)).length);
  const main = upcoming.filter((v) => v.days.some((d) => mainDays.includes(d)));
  const extra = upcoming.filter((v) => !main.includes(v));
  return {
    upcoming,
    past,
    days,
    // Same rule as the live count in the browser: seats of events still running (not closed).
    seatsTotal: upcoming.filter((v) => v.e.event_status === 'ACTIVE').reduce((n, v) => n + v.e.total_seats, 0),
    seatsLeft: open.reduce((n, v) => n + v.avail.seatsLeft, 0),
    openCount: open.length,
    prizePool: upcoming.reduce((n, v) => n + v.e.prizes.reduce((m, p) => m + p.amount, 0), 0),
    clubs: new Set(views.flatMap((v) => v.e.organizers.map((o) => o.name))).size,
    free: upcoming.filter((v) => v.e.price === 0).length,
    first: upcoming[0],
    last: lastByEnd,
    mainDays,
    main,
    extra,
    mainFirst: main[0],
    mainLast: [...main].sort((a, b) => b.endMs - a.endMs)[0],
  };
}

/** The view-transition-name shared by an event's photo on every page, so it can morph between them. */
export function vtName(id: string): string {
  return `vt-${id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
}
