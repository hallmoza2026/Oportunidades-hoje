import { config, jobs, abs } from '../lib/data.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function GET() {
  const items = jobs.slice(0, 50).map((j) => `
    <item>
      <title>${esc(j.titulo)} - ${esc(j.empresa)}</title>
      <link>${abs(`/vagas/${j.slug}/`)}</link>
      <guid isPermaLink="true">${abs(`/vagas/${j.slug}/`)}</guid>
      <pubDate>${new Date(j.dataPublicacao).toUTCString()}</pubDate>
      <description>${esc(j.resumo)}</description>
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(config.nome)}: novas vagas</title>
  <link>${abs('/')}</link>
  <description>${esc(config.slogan)}</description>
  <language>${config.idioma}</language>${items}
</channel></rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
