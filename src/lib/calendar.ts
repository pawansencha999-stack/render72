import type { EventView } from './events';
import { istEpoch } from './format';

const pad = (n: number) => String(n).padStart(2, '0');
const utcStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
};
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
// RFC 5545 lines longer than 75 octets are folded.
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
};

export interface Session {
  start: number;
  end: number;
  venue: string;
}

/** Sessions that run straight through midnight become one calendar entry. */
export function sessionsOf(v: EventView): Session[] {
  const out: Session[] = [];
  for (const s of v.e.schedules) {
    const start = istEpoch(s.event_date, s.start_time);
    let end = istEpoch(s.event_date, s.end_time);
    if (s.end_time === '23:59') end += 60_000;
    const prev = out[out.length - 1];
    if (prev && prev.end === start && prev.venue === s.venue) prev.end = end;
    else out.push({ start, end, venue: s.venue });
  }
  return out;
}

export interface CalendarEntry {
  id: string;
  name: string;
  online: boolean;
  description: string;
  url: string;
  sessions: Session[];
}

/** One .ics file holding any number of events. Used at build time and in the browser. */
export function buildIcs(entries: CalendarEntry[], now = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//afterclass//Campus events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of entries) {
    ev.sessions.forEach((s, i) => {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ev.id}-${i}@afterclass`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART:${utcStamp(s.start)}`,
        `DTEND:${utcStamp(s.end)}`,
        fold(`SUMMARY:${esc(ev.name)}`),
        fold(`LOCATION:${esc(ev.online ? 'Online' : s.venue)}`),
        fold(`DESCRIPTION:${esc(`${ev.description}\n\n${ev.url}`)}`),
        fold(`URL:${ev.url}`),
        'END:VEVENT',
      );
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function icsFor(v: EventView, pageUrl: string, now = Date.now()): string {
  return buildIcs([{ id: v.id, name: v.e.name, online: v.online, description: v.e.blurb, url: pageUrl, sessions: sessionsOf(v) }], now);
}

export function registerMailto(v: EventView): string | null {
  const c = v.e.coordinators.find((x) => /@/.test(x.contact));
  if (!c) return null;
  const first = c.name.split(' ')[0];
  const team = v.e.max_teamsize > 1;
  const body = [
    `Hi ${first},`,
    '',
    `I'd like to register for ${v.e.name} (${v.whenDate}).`,
    '',
    'Name:',
    'College and year:',
    'Phone:',
    ...(team ? ['Team name:', `Team members (${v.team.toLowerCase()}):`] : []),
    '',
    'Thanks!',
  ].join('\n');
  return `mailto:${c.contact}?subject=${encodeURIComponent(`Registration: ${v.e.name}`)}&body=${encodeURIComponent(body)}`;
}
