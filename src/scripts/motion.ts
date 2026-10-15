// Pointer-driven motion: 3D tilt on photos, magnetic buttons, depth in the hero headline,
// the seat ticker's pause button and the finder's photo previews.
//
// Everything here is decoration on top of a page that already works. It starts after the
// first paint, only runs for a mouse or trackpad (not touch), and stays off for people who
// ask their system to reduce motion. Only transforms change, so nothing triggers layout.

import { afterFirstPaint } from './live';

const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Run fn at most once per animation frame. */
function perFrame<T extends unknown[]>(fn: (...a: T) => void) {
  let queued = false;
  let args: T;
  return (...a: T) => {
    args = a;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...args);
    });
  };
}

/** Photos lean towards the pointer, like a card picked up off a table. */
function tilt() {
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((host) => {
    const sel = host.dataset.tilt;
    const el = (sel ? host.querySelector<HTMLElement>(sel) : host) ?? host;
    el.setAttribute('data-tilt-el', '');
    const max = Number(host.dataset.tiltMax) || 7;
    const move = perFrame((x: number, y: number) => {
      el.classList.add('tilting');
      el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) scale(1.03)`;
    });
    host.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      move((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
    });
    host.addEventListener('pointerleave', () => {
      requestAnimationFrame(() => {
        el.classList.remove('tilting');
        el.style.transform = '';
      });
    });
  });
}

/** Buttons drift a little towards the pointer as it approaches, then spring back. */
function magnetic() {
  document.querySelectorAll<HTMLElement>('.button').forEach((b) => {
    if (b.closest('.mobile-bar')) return;
    const pull = perFrame((x: number, y: number) => {
      b.style.setProperty('--mx', `${x.toFixed(1)}px`);
      b.style.setProperty('--my', `${y.toFixed(1)}px`);
    });
    b.addEventListener('pointermove', (e) => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      const r = b.getBoundingClientRect();
      pull((e.clientX - (r.left + r.width / 2)) * 0.18, (e.clientY - (r.top + r.height / 2)) * 0.3);
    });
    b.addEventListener('pointerleave', () => pull(0, 0));
  });
}

/** The two lines of the hero headline sit at different depths and shift with the pointer. */
function heroDepth() {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return;
  const set = perFrame((x: number, y: number) => {
    hero.style.setProperty('--px', x.toFixed(3));
    hero.style.setProperty('--py', y.toFixed(3));
  });
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
  });
  hero.addEventListener('pointerleave', () => set(0, 0));
}

/** The seat ticker scrolls continuously; this button stops it (WCAG 2.2.2). */
function ticker() {
  document.querySelectorAll<HTMLElement>('.ticker').forEach((t) => {
    const btn = t.querySelector<HTMLButtonElement>('[data-ticker-toggle]');
    btn?.addEventListener('click', () => {
      const paused = t.classList.toggle('paused');
      btn.textContent = paused ? 'Play' : 'Pause';
      btn.setAttribute('aria-label', paused ? 'Play the ticker' : 'Pause the ticker');
    });
  });
}

/** Finder: pointing at (or tabbing to) an event swaps the big photo to that event. */
function finderPreview() {
  document.querySelectorAll<HTMLElement>('.finder .panel').forEach((panel) => {
    // The first event's photo is the base layer; the others are stacked over it, unloaded.
    const photo = panel.querySelector<HTMLAnchorElement>('.panel-photo');
    const pics = Array.from(panel.querySelectorAll<HTMLElement>('.panel-photo picture[data-row]'));
    if (!photo || !pics.length) return;
    let hydrated = false;
    const hydrate = () => {
      if (hydrated) return;
      hydrated = true;
      pics.forEach((p) => {
        p.querySelectorAll<HTMLSourceElement>('source[data-srcset]').forEach((s) => {
          s.srcset = s.dataset.srcset!;
          s.removeAttribute('data-srcset');
        });
        const img = p.querySelector('img');
        if (img?.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
      });
    };
    const show = (i: number, href?: string) => {
      const target = pics.find((p) => p.dataset.row === String(i));
      if (i !== 0 && !target) return; // that event has no photo: keep the current one
      pics.forEach((p) => p.classList.toggle('on', p === target));
      if (href) photo.href = href;
    };
    panel.addEventListener('pointerenter', hydrate);
    panel.addEventListener('focusin', hydrate);
    panel.querySelectorAll<HTMLElement>('.row').forEach((row, i) => {
      const href = row.querySelector<HTMLAnchorElement>('a.what')?.href;
      row.addEventListener('pointerenter', () => show(i, href));
      row.addEventListener('focusin', () => show(i, href));
    });
  });
}

export function startMotion() {
  afterFirstPaint().then(() => {
    ticker(); // the pause button must always work
    finderPreview();
    if (reduced() || !finePointer()) return;
    tilt();
    magnetic();
    heroDepth();
  });
}
