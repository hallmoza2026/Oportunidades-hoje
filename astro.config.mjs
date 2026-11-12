import { defineConfig } from 'astro/config';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('./site.config.json', import.meta.url), 'utf8'));

export default defineConfig({
  site: cfg.url,
  compressHTML: true,
  build: { format: 'directory' },
});
