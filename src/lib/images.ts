// Responsive images, optimised at build time.
//
// Event photos come from Pexels. We download them during the build and serve resized
// AVIF/WebP copies from our own domain: smaller files, no third-party cookies, and the
// pictures keep working even if Pexels is slow. If a picture can't be fetched, callers get
// null and render a flat placeholder with the alt text instead of breaking the build.

import { getImage } from 'astro:assets';

export type Format = 'avif' | 'webp';

export interface Responsive {
  src: string;
  width: number;
  height: number;
  sources: { type: string; srcset: string }[];
}

const reachable = new Map<string, Promise<boolean>>();

/** HEAD-check a remote image once per build so a dead URL can't fail the build later. */
function check(url: string): Promise<boolean> {
  if (!reachable.has(url)) {
    reachable.set(
      url,
      (async () => {
        if (process.env.SKIP_IMAGE_CHECK === '1') return true;
        for (let i = 0; i < 2; i++) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          try {
            const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
            if (res.ok) return true;
          } catch {
            /* retry once */
          } finally {
            clearTimeout(t);
          }
        }
        console.warn(`[afterclass] Image unreachable at build, using placeholder: ${url}`);
        return false;
      })(),
    );
  }
  return reachable.get(url)!;
}

export async function responsive(
  url: string | undefined,
  opts: { widths: number[]; ratio?: [number, number]; formats?: Format[]; quality?: number },
): Promise<Responsive | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  if (!(await check(url))) return null;
  const { widths, ratio = [3, 2], formats = ['avif', 'webp'], quality = 62 } = opts;
  const h = (w: number) => Math.round((w * ratio[1]) / ratio[0]);
  try {
    const sources = await Promise.all(
      formats.map(async (format) => {
        const imgs = await Promise.all(
          widths.map((w) =>
            getImage({ src: url, width: w, height: h(w), format, quality: format === 'avif' ? quality - 8 : quality, fit: 'cover' }),
          ),
        );
        return { type: `image/${format}`, srcset: imgs.map((img, i) => `${img.src} ${widths[i]}w`).join(', ') };
      }),
    );
    const mid = widths[Math.min(widths.length - 1, 1)];
    const fallback = await getImage({ src: url, width: mid, height: h(mid), format: 'webp', quality, fit: 'cover' });
    return { src: fallback.src, width: mid, height: h(mid), sources };
  } catch (err) {
    console.warn(`[afterclass] Could not optimise ${url}: ${(err as Error).message}`);
    return null;
  }
}
