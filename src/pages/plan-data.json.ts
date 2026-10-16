// What the browser needs to work with someone's saved plan: each event's sessions (to find
// clashes and build a calendar file), fee, deadline and where it is. Built with the site.
import type { APIRoute } from 'astro';
import { getDataset } from '../lib/api';
import { toView } from '../lib/events';
import { sessionsOf } from '../lib/calendar';
import type { PlanEvent } from '../lib/plan-types';

export const GET: APIRoute = async () => {
  const ds = await getDataset();
  const events: PlanEvent[] = ds.events.map((e) => {
    const v = toView(e, ds.fetchedAt);
    return {
      id: v.id,
      name: e.name,
      title: v.title,
      href: v.href,
      blurb: e.blurb,
      online: v.online,
      venue: v.venueShort,
      when: v.whenShort,
      sessions: sessionsOf(v).map((s) => [s.start, s.end, s.venue]),
      price: e.price,
      priceText: [v.price.amount, v.price.unit].filter(Boolean).join(' '),
      deadlineMs: v.deadlineMs,
      deadline: v.deadline,
      past: v.isPast,
    };
  });
  return new Response(JSON.stringify({ builtAt: ds.fetchedAt, events }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
