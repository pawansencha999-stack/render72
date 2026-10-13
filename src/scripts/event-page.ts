// Event page: confirm this event against GET /api/test/events/{id}, keep the
// "on this page" bar in step with the reader, share, and show the phone action bar.

import { afterFirstPaint, applyEvent, fetchEvent } from './live';

export function startEventDetail() {
  const article = document.querySelector<HTMLElement>('[data-event-page]');
  if (!article) return;
  const id = article.dataset.ev!;

  // Live check of this one event. A 404 means the organisers removed it.
  afterFirstPaint()
    .then(() => fetchEvent(id))
    .then((ev) => {
      if (ev === null) {
        applyEvent(id, null);
        const note = document.querySelector<HTMLElement>('[data-removed-note]');
        if (note) note.hidden = false;
        return;
      }
      applyEvent(id, {
        id: ev.id,
        event_status: ev.event_status,
        registration_status: ev.registration_status,
        seats_filled: ev.seats_filled,
        total_seats: ev.total_seats,
        registration_deadline: ev.registration_deadline,
      });
    })
    .catch(() => {
      /* Network trouble: the list refresh in live.ts reports it in the status note. */
    });

  // Coming from a filtered list? Send "All events" back to that exact view.
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin && ref.pathname === '/events/' && ref.search) {
      document.querySelectorAll<HTMLAnchorElement>('.crumbs a[href="/events/"]').forEach((a) => (a.href = `/events/${ref.search}`));
    }
  } catch {
    /* ignore malformed referrers */
  }

  // Share: the system share sheet where there is one, otherwise copy the link.
  const msg = document.querySelector<HTMLElement>('[data-share-msg]');
  document.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = new URL(btn.dataset.url || location.pathname, location.origin).href;
      const title = btn.dataset.title || document.title;
      try {
        if (navigator.share) {
          await navigator.share({ title, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        if (msg) msg.textContent = 'Link copied. Paste it anywhere to share this event.';
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        if (msg) msg.textContent = `Copy this link to share: ${url}`;
      }
    });
  });

  // Highlight the section being read in the "on this page" bar.
  const links = new Map<string, HTMLAnchorElement>();
  document.querySelectorAll<HTMLAnchorElement>('.on-page a').forEach((a) => links.set(a.hash.slice(1), a));
  const targets = [...links.keys()].map((k) => document.getElementById(k)).filter(Boolean) as HTMLElement[];
  if ('IntersectionObserver' in window && targets.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          links.forEach((a) => a.removeAttribute('aria-current'));
          const a = links.get(e.target.id);
          if (a) {
            a.setAttribute('aria-current', 'true');
            a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    targets.forEach((t) => io.observe(t));
  }

  // On phones, a fixed bar with the price and Register appears once the main button scrolls away.
  const bar = document.querySelector<HTMLElement>('.mobile-bar');
  const main = document.querySelector<HTMLElement>('.facts .actions');
  if (bar && main && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => bar.classList.toggle('show', !e.isIntersecting && e.boundingClientRect.top < 0)).observe(main);
  }
}
