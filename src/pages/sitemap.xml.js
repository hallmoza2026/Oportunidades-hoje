import { config, jobs, paises, abs, slugify } from '../lib/data.js';
import { posts } from '../lib/posts.js';

export function GET() {
  const fixas = ['/', '/recentes/', '/remoto/', '/blog/', '/publicar/', '/sobre/', '/contacto/', '/privacidade/', '/termos/', '/remocao/'];
  const urls = [
    ...fixas.map((p) => ({ loc: abs(p) })),
    ...config.categorias.map((c) => ({ loc: abs(`/categoria/${c.slug}/`) })),
    ...[...new Set([config.paisFoco, ...paises.map((p) => p.nome)])].map((n) => ({ loc: abs(`/local/${slugify(n)}/`) })),
    ...jobs.map((j) => ({ loc: abs(`/vagas/${j.slug}/`), lastmod: j.dataPublicacao })),
    ...posts.map((p) => ({ loc: abs(`/blog/${p.slug}/`), lastmod: new Date(p.date).toISOString() })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
