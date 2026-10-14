// Easter egg: "Class dismissed."
// Type the site's name anywhere, or click the big wordmark in the footer. A school bell rings
// (synthesised with Web Audio, nothing downloaded) and the navy field from the hero rises over
// the whole screen. Click, press any key, or wait, and it carries on upwards and out of sight.
// Loaded only when triggered, so it costs nothing on page load.

const CSS = `
.dismissed {
  position: fixed; inset: 0; z-index: 200;
  display: grid; align-content: end; gap: 1.25rem;
  padding: var(--margin) var(--margin) clamp(2.5rem, 8vh, 6rem);
  background: var(--navy); color: var(--paper);
  transform: translateY(100%);
  transition: transform 720ms var(--ease-in-out);
  cursor: pointer;
}
.dismissed.in { transform: none; }
.dismissed.out { transform: translateY(-100%); }
.dismissed .dm-title {
  font-family: var(--font-display); font-stretch: 75%; font-weight: 760;
  font-size: clamp(4.5rem, 1rem + 15vw, 15rem); line-height: 0.84; letter-spacing: -0.01em;
}
.dismissed .dm-title span { color: var(--accent); }
.dismissed .dm-sub { font-size: var(--fs-lead); color: var(--on-navy-soft); max-width: 36ch; }
@media (prefers-reduced-motion: reduce) {
  .dismissed { transform: none; opacity: 0; transition: opacity 200ms ease; }
  .dismissed.in { opacity: 1; }
  .dismissed.out { transform: none; opacity: 0; }
}
`;

/** An electric school bell: a few inharmonic partials struck about 24 times a second. */
function ring() {
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  try {
    const ctx: AudioContext = new AC();
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    out.gain.setValueAtTime(0.09, t + 1.15);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);

    const strike = ctx.createGain(); // the clapper: gain swings between 0 and 1
    strike.gain.value = 0.5;
    strike.connect(out);
    const clapper = ctx.createOscillator();
    clapper.type = 'square';
    clapper.frequency.value = 24;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    clapper.connect(depth).connect(strike.gain);

    const partials: [number, number][] = [[1170, 0.5], [2430, 0.22], [3580, 0.12], [4720, 0.06]];
    for (const [f, a] of partials) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(strike);
      o.start(t);
      o.stop(t + 1.75);
    }
    clapper.start(t);
    clapper.stop(t + 1.75);
    setTimeout(() => ctx.close(), 2200);
  } catch {
    /* no audio: the visual still plays */
  }
}

let open = false;

export function classDismissed() {
  if (open) return;
  open = true;
  if (!document.getElementById('dismissed-css')) {
    const style = document.createElement('style');
    style.id = 'dismissed-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  ring();

  const el = document.createElement('div');
  el.className = 'dismissed';
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<p class="dm-title">Class<br>dismissed<span>.</span></p>' +
    '<p class="dm-sub">The bell has gone. Everything good happens after class.</p>';
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      el.remove();
      open = false;
    }, 760);
  };
  const onKey = () => close();
  setTimeout(() => document.addEventListener('keydown', onKey), 400);
  el.addEventListener('click', close);
  setTimeout(close, 3200);
}
