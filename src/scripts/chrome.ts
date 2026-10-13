// Page chrome: the header takes the colour of the section beneath it, and sections
// reveal their parts once as they scroll into view. Content is visible without this script.

export function startChrome() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
