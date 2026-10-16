// Formatting helpers shared by the build (Astro) and the browser scripts.
// All event times in the API are Indian Standard Time (UTC+05:30). We format them by hand
// instead of through Intl so the server-rendered and browser-rendered text always match.

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const IST_OFFSET_MS = 330 * 60 * 1000;

export interface YMD { y: number; m: number; d: number; dow: number }

export function parseYMD(ymd: string): YMD {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return { y, m, d, dow };
}

export function parseHM(hm: string): { h: number; mi: number } {
  const [h, mi] = (hm || '0:0').split(':').map(Number);
  return { h: h || 0, mi: mi || 0 };
}

/** Milliseconds since epoch for an IST wall-clock date and time. */
export function istEpoch(ymd: string, hm = '00:00'): number {
  const { y, m, d } = parseYMD(ymd);
  const { h, mi } = parseHM(hm);
  return Date.UTC(y, m - 1, d, h, mi) - IST_OFFSET_MS;
}

/** "Fri 13 Nov" or, long, "Friday 13 November". */
export function fmtDay(ymd: string, style: 'short' | 'long' | 'weekday' | 'date' = 'short'): string {
  const { m, d, dow } = parseYMD(ymd);
  if (style === 'long') return `${DAYS_LONG[dow]} ${d} ${MONTHS_LONG[m - 1]}`;
  if (style === 'weekday') return DAYS_LONG[dow];
  if (style === 'date') return `${d} ${MONTHS_SHORT[m - 1]}`;
  return `${DAYS_SHORT[dow]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "Friday 13 to Sunday 15 November", or "Sunday 18 October to Sunday 15 November" across months. */
export function fmtSpan(first: string, last: string): string {
  if (!first || !last) return '';
  if (first === last) return fmtDay(first, 'long');
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${fmtDay(first, 'weekday')} ${parseYMD(first).d} to ${fmtDay(last, 'long')}`
    : `${fmtDay(first, 'long')} to ${fmtDay(last, 'long')}`;
}

/** "6 pm", "9:30 am", "noon", "midnight". */
export function fmtTime(hm: string, withMeridiem = true): string {
  const { h, mi } = parseHM(hm);
  if ((h === 23 && mi === 59) || (h === 0 && mi === 0) || h === 24) return 'midnight';
  if (h === 12 && mi === 0) return 'noon';
  const mer = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const base = mi ? `${h12}:${String(mi).padStart(2, '0')}` : `${h12}`;
  return withMeridiem ? `${base} ${mer}` : base;
}

function meridiem(hm: string): string {
  const { h, mi } = parseHM(hm);
  if ((h === 23 && mi === 59) || (h === 0 && mi === 0) || (h === 12 && mi === 0)) return 'x';
  return h >= 12 ? 'pm' : 'am';
}

/** "2–6 pm", "9:30 am – 4:30 pm". */
export function fmtTimeRange(start: string, end: string): string {
  const ms = meridiem(start);
  const me = meridiem(end);
  if (ms !== 'x' && ms === me) return `${fmtTime(start, false)}–${fmtTime(end)}`;
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

/** Deadline string from an ISO timestamp, shown in IST: "Tue 10 Nov, 6 pm". */
export function fmtDeadline(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const ist = new Date(t + IST_OFFSET_MS);
  const ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
  const hm = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
  return `${fmtDay(ymd)}, ${fmtTime(hm)}`;
}

/** "13 Oct, 11:40 pm" for an epoch, in IST. Used for "data as of" notes. */
export function fmtStamp(ms: number): string {
  const ist = new Date(ms + IST_OFFSET_MS);
  const ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
  const hm = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
  return `${fmtDay(ymd, 'date')}, ${fmtTime(hm)}`;
}

/** "in 3 days", "in 5 hours", "in 12 minutes". Returns '' once the moment has passed. */
export function fmtUntil(target: number, now: number): string {
  const diff = target - now;
  if (diff <= 0) return '';
  const min = Math.round(diff / 60000);
  if (min < 60) return `in ${Math.max(1, min)} minute${min === 1 ? '' : 's'}`;
  const hrs = Math.round(min / 60);
  if (hrs < 36) return `in ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `in ${days} days`;
}

/** "just now", "4 minutes ago". */
export function fmtAgo(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return `on ${fmtStamp(then)}`;
}

/** Indian digit grouping: 379500 → "3,79,500". */
export function groupIN(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + rest + ',' + last3;
}

export function fmtRupees(n: number): string {
  return `₹${groupIN(n)}`;
}

/** { amount: "₹800", unit: "per team" } or { amount: "Free", unit: "" }. */
export function fmtPrice(price: number, perHead: boolean, maxTeam = 1): { amount: string; unit: string; short: string } {
  if (!price) return { amount: 'Free', unit: '', short: 'Free' };
  const unit = perHead || maxTeam <= 1 ? 'per person' : 'per team';
  return { amount: fmtRupees(price), unit, short: `${fmtRupees(price)} ${unit}` };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "Solo", "Teams of 2–4", "Solo or teams up to 3", "Teams of 2". */
export function fmtTeam(min: number, max: number): string {
  const lo = Math.max(1, min || 1);
  const hi = Math.max(lo, max || lo);
  if (hi === 1) return 'Solo';
  if (lo === 1) return `Solo or teams up to ${hi}`;
  if (lo === hi) return `Teams of ${hi}`;
  return `Teams of ${lo}–${hi}`;
}

export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** URL-safe slug from an event name. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "CivicForge 24: Build for the City" → ["CivicForge 24", "Build for the City"]. */
export function splitName(name: string): [string, string] {
  const i = name.indexOf(':');
  if (i < 0) return [name.trim(), ''];
  return [name.slice(0, i).trim(), name.slice(i + 1).trim()];
}

/** Tags arrive in mixed styles ("Civic Tech", "film-photography"); show them consistently. */
export function fmtTag(t: string): string {
  const s = t.replace(/[-_]+/g, ' ').trim();
  if (!s) return s;
  // Keep acronyms (CTF, NLP, UI/UX) and brand casing (VALORANT); otherwise sentence case.
  if (/^[A-Z0-9/ ]+$/.test(s) && s.length <= 10) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/\b(ai|ui|ux|html|css|rag|ctf|nlp)\b/g, (m) => m.toUpperCase()).replace(/\bindia\b/g, 'India').replace(/\barduino\b/g, 'Arduino').replace(/\bfigma\b/g, 'Figma').replace(/\bpython\b/g, 'Python').replace(/\bleds\b/g, 'LEDs');
}
