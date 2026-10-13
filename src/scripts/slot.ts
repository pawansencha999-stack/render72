// The photo inside the hero headline cycles through the weekend's events.
// Only the first photo loads with the page; the rest arrive after the page has finished loading,
// so the cycle never competes with the first paint. Paused off-screen and for reduced motion.

export function startSlot() {
  const slot = document.querySelector<HTMLElement>('.slot');
  if (!slot) return;
  const frames = Array.from(slot.querySelectorAll<HTMLElement>('picture'));
  if (frames.length < 2) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ready = new Set<number>([0]);
  let i = 0;
  let timer: number | undefined;
  let visible = true;

  const hydrate = () => {
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

  const tick = () => {
    let next = (i + 1) % frames.length;
    while (!ready.has(next) && next !== i) next = (next + 1) % frames.length;
    if (next !== i) {
      frames[i].classList.remove('on');
      frames[next].classList.add('on');
      i = next;
    }
  };

  const play = () => {
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
}
