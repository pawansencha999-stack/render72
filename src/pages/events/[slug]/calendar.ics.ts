import type { APIRoute, GetStaticPaths } from 'astro';
import { getDataset } from '../../../lib/api';
import { toView } from '../../../lib/events';
import { icsFor } from '../../../lib/calendar';

export const getStaticPaths: GetStaticPaths = async () => {
  const ds = await getDataset();
  return ds.events.map((e) => {
    const v = toView(e, ds.fetchedAt);
    return { params: { slug: v.slug }, props: { id: v.id } };
  });
};

export const GET: APIRoute = async ({ props, site }) => {
  const ds = await getDataset();
  const e = ds.events.find((x) => x.id === (props as { id: string }).id)!;
  const v = toView(e, ds.fetchedAt);
  const url = site ? new URL(v.href, site).href : v.href;
  return new Response(icsFor(v, url, ds.fetchedAt), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
