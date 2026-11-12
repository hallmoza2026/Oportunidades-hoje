// Verificação pós-build. Uso: npm run build && npm run check
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const jobs = JSON.parse(fs.readFileSync(path.join(root, 'data/jobs.json'), 'utf8')).jobs;
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); };

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dist);
const htmls = files.filter((f) => f.endsWith('.html'));
const exists = (urlPath) => {
  const p = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const base = path.join(dist, p);
  return [base, path.join(base, 'index.html'), base + '.html'].some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
};

// 1. Links e recursos internos
let nLinks = 0;
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|#|data:|javascript:)/.test(u) || !u.startsWith('/')) continue;
    nLinks++;
    ok(exists(u), `link interno partido: ${u} (em ${path.relative(dist, f)})`);
  }
}

// 2. Páginas de vaga
for (const j of jobs) {
  const f = path.join(dist, 'vagas', j.slug, 'index.html');
  if (!fs.existsSync(f)) { ok(false, `falta página da vaga ${j.slug}`); continue; }
  const html = fs.readFileSync(f, 'utf8');
  ok(html.includes(`href="${j.urlOriginal.replace(/&/g, '&#38;')}"`) || html.includes(j.urlOriginal), `vaga ${j.slug}: sem link para o anúncio original`);
  ok(/Nunca pague/.test(html), `vaga ${j.slug}: sem nota de segurança`);
  ok(/Denunciar esta vaga/.test(html), `vaga ${j.slug}: sem ligação de denúncia`);
}

// 3. JSON-LD válido e sem JobPosting para fontes que o proíbem
const proibidas = new Set(JSON.parse(JSON.stringify(
  (await import('yaml')).default.parse(fs.readFileSync(path.join(root, 'sources.yaml'), 'utf8')).sources.filter((s) => !s.googleJobs).map((s) => s.id))));
let nLd = 0;
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    nLd++;
    try {
      const ld = JSON.parse(m[1].replace(/&#34;/g, '"').replace(/&quot;/g, '"'));
      if (ld['@type'] === 'JobPosting') {
        const slug = f.split(path.sep).slice(-2)[0];
        const job = jobs.find((j) => j.slug === slug);
        ok(job && !proibidas.has(job.fonte), `JobPosting em vaga de fonte que o proíbe: ${slug}`);
        for (const k of ['title', 'description', 'datePosted', 'hiringOrganization']) ok(ld[k], `JobPosting sem ${k}: ${slug}`);
      }
    } catch (e) { ok(false, `JSON-LD inválido em ${path.relative(dist, f)}: ${e.message}`); }
  }
}

// 4. Sitemap e robots
const sm = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
for (const j of jobs) ok(sm.includes(`/vagas/${j.slug}/`), `sitemap sem ${j.slug}`);
ok(/^<\?xml/.test(sm) && sm.includes('</urlset>'), 'sitemap mal formado');
ok(/Sitemap: https?:\/\//.test(fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8')), 'robots.txt sem Sitemap');

// 5. Peso por página (HTML gzip + CSS gzip), alvo < 150 KB
const css = files.filter((f) => f.endsWith('.css')).reduce((s, f) => s + zlib.gzipSync(fs.readFileSync(f)).length, 0);
let maior = 0;
for (const f of htmls) { const w = zlib.gzipSync(fs.readFileSync(f)).length + css; maior = Math.max(maior, w); ok(w < 150 * 1024, `página pesada (${(w / 1024).toFixed(0)} KB): ${path.relative(dist, f)}`); }

// 6. Sem recolha de e-mails junto de listas de vagas (exigência da Remotive)
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  if (html.includes('class="vaga"') || html.includes('class="vaga ')) ok(!/type="email"/.test(html), `campo de e-mail numa página com vagas: ${path.relative(dist, f)}`);
}

// 7. Dados de exemplo nunca em produção
const meta = JSON.parse(fs.readFileSync(path.join(root, 'data/jobs.json'), 'utf8')).meta;
if (meta.exemplo) console.warn('AVISO: data/jobs.json contém dados de EXEMPLO (fixture). Não publicar assim.');
if (process.env.CI && meta.exemplo) ok(false, 'dados de exemplo em build de CI');

// 8. Segredos no código
const alvo = walk(root).filter((f) => !/node_modules|[\\/]dist[\\/]|[\\/]\.git[\\/]|package-lock|og\.png|data[\\/]jobs\.json/.test(f));
const padroes = [/ghp_[A-Za-z0-9]{20,}/, /\bsk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /api[_-]?key\s*[:=]\s*["'][^"']{12,}/i, /secret\s*[:=]\s*["'][^"']{12,}/i];
for (const f of alvo) { let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; } for (const p of padroes) ok(!p.test(t), `possível segredo em ${path.relative(root, f)}`); }

console.log(`Páginas HTML: ${htmls.length} | links internos: ${nLinks} | blocos JSON-LD: ${nLd} | vagas: ${jobs.length} | página mais pesada: ${(maior / 1024).toFixed(1)} KB (gzip)`);
if (falhas.length) { console.error('\nFALHAS:\n - ' + falhas.join('\n - ')); process.exit(1); }
console.log('Todas as verificações passaram.');
