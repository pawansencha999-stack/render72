// Page chrome: the header takes the colour of the section beneath it, and sections
// reveal their parts once as they scroll into view. Content is visible without this script.

export function startChrome() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  startEasterEggs();

  // Reveals
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.remove('pending');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
    );
    const fold = window.innerHeight;
    items.forEach((el) => {
      // Already on screen: leave it alone. Below the fold: hide now, reveal on arrival.
      if (el.getBoundingClientRect().top < fold) return;
      el.classList.add('pending');
      io.observe(el);
    });
  }

  // Header colour follows the chapter directly under its bottom edge.
  const header = document.querySelector<HTMLElement>('.site-header');
  const chapters = Array.from(document.querySelectorAll<HTMLElement>('main [data-chapter], footer[data-chapter]'));
  if (!header || !chapters.length) return;

  let queued = false;
  const update = () => {
    queued = false;
    const y = header.offsetHeight + 1;
    let on = 'paper';
    // Last match wins, so a coloured field nested inside a section takes precedence.
    for (let i = chapters.length - 1; i >= 0; i--) {
      const c = chapters[i];
      const r = c.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) {
        on = c.dataset.chapter || 'paper';
        break;
      }
    }
    if (header.dataset.on !== on) header.dataset.on = on;
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  update();
}

// ---- easter eggs ------------------------------------------------------------

function startEasterEggs() {
  // A note for anyone who opens the developer tools.
  console.log(
    '%cafterclass%c\nBuilt for Render72 with Astro: static HTML, about 20 KB of JavaScript, live seat counts.\nTwo things to try: click the photo in the home page headline, and type this site\'s name anywhere.',
    'font: 800 28px/1.2 "Anek Latin", sans-serif; font-stretch: 75%; color: #f7941d; background: #1f2b4d; padding: 4px 10px;',
    'font: 14px/1.5 sans-serif; color: inherit;',
  );

  const bell = () => import('./bell').then((m) => m.classDismissed());

  // Type "afterclass" anywhere (outside form fields) and the bell rings.
  const word = 'afterclass';
  let typed = '';
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-word.length);
    if (typed === word) {
      typed = '';
      bell();
    }
  });

  // Or click the big wordmark in the footer.
  document.querySelectorAll<HTMLElement>('[data-bell]').forEach((el) => el.addEventListener('click', bell));
}
