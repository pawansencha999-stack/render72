import type { APIRoute } from 'astro';
import { getDataset } from '../lib/api';
import { toView } from '../lib/events';

export const GET: APIRoute = async ({ site }) => {
  const ds = await getDataset();
  const base = site ?? new URL('https://example.invalid');
  const paths = ['/', '/events/', '/plan/', ...ds.events.map((e) => toView(e, ds.fetchedAt).href)];
  const lastmod = new Date(ds.fetchedAt).toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${new URL(p, base).href}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
