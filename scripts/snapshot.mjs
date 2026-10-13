// Refreshes src/data/snapshot.json from the Events API.
// The snapshot is what the build falls back to when the API is unreachable.
// Usage: npm run snapshot

import { writeFile } from 'node:fs/promises';

const BASE = (process.env.PUBLIC_EVENTS_API || 'https://render72.pages.dev').replace(/\/$/, '');

async function get(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const list = await get(`${BASE}/api/test/events`);
if (!Array.isArray(list.events) || !list.events.length) throw new Error('The API returned no events; snapshot left unchanged.');

const details = {};
for (const e of list.events) {
  const d = await get(`${BASE}/api/test/events/${encodeURIComponent(e.id)}`);
  details[e.id] = d.event;
}

const snapshot = {
  fetched_at: new Date().toISOString(),
  source: `${BASE}/api/test/events`,
  events: list.events,
  details,
};
await writeFile(new URL('../src/data/snapshot.json', import.meta.url), JSON.stringify(snapshot, null, 1) + '\n');
console.log(`Saved ${list.events.length} events to src/data/snapshot.json`);
