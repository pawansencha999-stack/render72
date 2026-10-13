// @ts-check
import { defineConfig } from 'astro/config';

// The public URL of the deployed site. Set SITE_URL in your host's build settings
// (for example https://afterclass.pages.dev). Used for canonical links, sitemap and social cards.
const site =
  process.env.SITE_URL ||
  (process.env.CF_PAGES_BRANCH === 'main' && process.env.CF_PAGES_URL) ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  process.env.URL || // Netlify
  undefined;

export default defineConfig({
  site,
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Small pages: inline all CSS so nothing blocks the first paint.
    inlineStylesheets: 'always',
  },
  image: {
    domains: ['images.pexels.com'],
  },
  // Start loading an event page when the pointer rests on its link.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  devToolbar: { enabled: false },
});
