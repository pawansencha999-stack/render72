// The countdown to the weekend in the figures section. The page is built with the numbers at
// build time; this corrects them and ticks once a second while the countdown is on screen.

import { afterFirstPaint } from './live';

export function startCountdown() {
  const box = document.querySelector<HTMLElement>('[data-countdown]');
  if (!box) return;
  const start = Number(box.dataset.countdown);
  const end = Number(box.dataset.end) || start;
  const part = (k: string) => box.querySelector<HTMLElement>(`[data-cd="${k}"]`)!;
  const label = box.querySelector<HTMLElement>('[data-cd-label]')!;
  const two = (n: number) => String(n).padStart(2, '0');
  const set = (el: HTMLElement, v: string) => {
    if (el.textContent !== v) el.textContent = v;
  };

  let timer: number | undefined;
  const tick = () => {
    const now = Date.now();
    const left = start - now;
    if (left <= 0) {
      box.dataset.state = now < end ? 'on' : 'over';
      label.textContent = now < end ? 'The weekend is on now.' : 'The weekend is over. See you at the next one.';
      window.clearInterval(timer);
      return;
    }
    set(part('d'), String(Math.floor(left / 86_400_000)));
    set(part('h'), two(Math.floor(left / 3_600_000) % 24));
    set(part('m'), two(Math.floor(left / 60_000) % 60));
    set(part('s'), two(Math.floor(left / 1000) % 60));
  };

  afterFirstPaint().then(() => {
    tick();
    let visible = false;
    const run = () => {
      window.clearInterval(timer);
      timer = undefined;
      if (visible && document.visibilityState === 'visible' && box.dataset.state === undefined) {
        tick();
        timer = window.setInterval(tick, 1000);
      }
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      run();
    }).observe(box);
    document.addEventListener('visibilitychange', run);
  });
}
