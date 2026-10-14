// The photo inside the hero headline.
//
// 1. It cycles through events you can still join. Only the first photo loads with the page;
//    the rest arrive after the page has finished loading, so the cycle never competes with the
//    first paint. Paused off-screen and for reduced motion.
// 2. Easter egg: it is a slot machine. Click it (or focus it and press Enter) and it spins,
//    slows down and deals you one event, which the hero then offers to you.

export function startSlot() {
  const slot = document.querySelector<HTMLElement>('.slot');
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!slot || !hero) return;
  const frames = Array.from(slot.querySelectorAll<HTMLElement>('picture'));
  if (frames.length < 2) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ready = new Set<number>([0]);
  let i = 0;
  let timer: number | undefined;
  let visible = true;
  let hydrated = false;
  let spinning = false;
  let dealt = false; // after a spin the dealt photo stays put

  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    frames.forEach((pic, n) => {
      if (n === 0) return;
      pic.querySelectorAll<HTMLSourceElement>('source[data-srcset]').forEach((s) => {
        s.srcset = s.dataset.srcset!;
        s.removeAttribute('data-srcset');
      });
      const img = pic.querySelector('img');
      if (img?.dataset.src) {
        img.addEventListener('load', () => ready.add(n), { once: true });
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
    });
  };

  const show = (next: number) => {
    if (next === i) return;
    frames[i].classList.remove('on');
    frames[next].classList.add('on');
    i = next;
  };

  const tick = () => {
    let next = (i + 1) % frames.length;
    while (!ready.has(next) && next !== i) next = (next + 1) % frames.length;
    show(next);
  };

  const play = () => {
    if (reduce || dealt || spinning) return;
    if (timer === undefined && visible && document.visibilityState === 'visible') timer = window.setInterval(tick, 1700);
  };
  const pause = () => {
    window.clearInterval(timer);
    timer = undefined;
  };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? play() : pause();
  }).observe(slot);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? play() : pause()));

  const begin = () => window.setTimeout(() => { hydrate(); play(); }, 900);
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });

  // ---- the slot machine ---------------------------------------------------

  const def = hero.querySelector<HTMLElement>('.foot-default');
  const pick = hero.querySelector<HTMLElement>('.foot-pick');
  const announce = hero.querySelector<HTMLElement>('[data-pick-announce]');
  const field = (k: string) => hero.querySelector<HTMLElement>(`[data-pick="${k}"]`);

  // A transparent button laid exactly over the photo, so the headline itself stays plain text.
  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'slot-hit';
  hit.title = 'Spin';
  hit.setAttribute('aria-label', 'Spin the slot machine: deal me a random event I can still join');
  hero.appendChild(hit);
  const place = () => {
    const h = hero.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    Object.assign(hit.style, {
      left: `${r.left - h.left}px`,
      top: `${r.top - h.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };
  place();
  new ResizeObserver(place).observe(hero);
  document.fonts?.ready.then(place);

  const isOpen = (n: number) => {
    const id = frames[n].dataset.id;
    const live = id ? hero.querySelector<HTMLElement>(`.slot-live [data-ev="${CSS.escape(id)}"]`) : null;
    return !live || live.dataset.open !== '0';
  };

  const whenLoaded = (n: number) =>
    new Promise<void>((resolve) => {
      const img = frames[n].querySelector('img');
      if (!img || (img.complete && img.naturalWidth)) return resolve();
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
      setTimeout(resolve, 1500);
    });

  const reveal = (n: number) => {
    const f = frames[n].dataset;
    const live = f.id ? hero.querySelector<HTMLElement>(`.slot-live [data-ev="${CSS.escape(f.id)}"] [data-f="seats"]`) : null;
    const seats = live?.textContent?.trim() ?? '';
    field('title')!.textContent = f.title ?? '';
    field('sub')!.textContent = f.sub ? `, ${f.sub}` : '';
    field('when')!.textContent = f.when ?? '';
    field('where')!.textContent = f.where ?? '';
    field('seats')!.textContent = seats ? `${seats.charAt(0).toUpperCase()}${seats.slice(1)}.` : '';
    const link = field('href') as HTMLAnchorElement;
    link.href = f.href ?? '/events/';
    link.textContent = `See ${f.title}`;
    if (def) def.hidden = true;
    if (pick) pick.hidden = false;
    if (announce) announce.textContent = `The slot picked ${f.title}. ${f.when}.`;
  };

  const spin = async () => {
    if (spinning) return;
    spinning = true;
    pause();
    hydrate();
    if (pick && !pick.hidden && announce) announce.textContent = 'Spinning…';

    // Deal one of the events that is still open, never the one already showing.
    const choices = frames.map((_, n) => n).filter((n) => n !== i && isOpen(n));
    const pool = choices.length ? choices : frames.map((_, n) => n).filter((n) => n !== i);
    const target = pool[Math.floor(Math.random() * pool.length)];

    if (!reduce) {
      slot.classList.remove('landed');
      slot.classList.add('spinning');
      const n = frames.length;
      const steps = ((target - i + n) % n) + n; // one full turn, then on to the target
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        await new Promise((r) => setTimeout(r, 45 + 300 * t * t * t)); // fast, then slowing down
        if (s === steps) await whenLoaded(target);
        show((i + 1) % n);
      }
      slot.classList.remove('spinning');
      void slot.offsetWidth; // restart the landing animation
      slot.classList.add('landed');
    } else {
      await whenLoaded(target);
      show(target);
    }
    dealt = true;
    spinning = false;
    reveal(target);
  };

  hit.addEventListener('click', spin);
  hero.querySelector('[data-spin-again]')?.addEventListener('click', spin);
  hero.querySelector('[data-pick-back]')?.addEventListener('click', () => {
    if (pick) pick.hidden = true;
    if (def) def.hidden = false;
    slot.classList.remove('landed');
    dealt = false;
    play();
    hit.focus();
  });
}
