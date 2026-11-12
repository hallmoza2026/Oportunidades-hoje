// Ingestão de vagas. Uso: node scripts/ingest.mjs [--fixture]
// --fixture lê scripts/fixtures/*.json em vez da rede (apenas para testes; marca o resultado como "exemplo").
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { XMLParser } from 'fast-xml-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const FIXTURE = process.argv.includes('--fixture');
const UA = 'VagasHojeBot/1.0 (+contacto no site)';

const config = rd('site.config.json');
const taxonomy = rd('data/taxonomy.json');
const blocklist = rd('data/blocklist.json');
const sources = YAML.parse(fs.readFileSync(path.join(root, 'sources.yaml'), 'utf8')).sources;
const jobsFile = path.join(root, 'data/jobs.json');
const previous = fs.existsSync(jobsFile) && !FIXTURE ? rd('data/jobs.json') : { meta: { fontes: {} }, jobs: [] };

const now = Date.now();
const H = 3600 * 1000;
const scamRes = blocklist.padroesBurla.map((p) => new RegExp(p, 'i'));

// ---------- utilitários ----------
const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const stripHtml = (h = '') =>
  decode(String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const excerpt = (t, n = 300) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…');
const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const slugify = (s) => norm(s).replace(/\s+/g, '-').slice(0, 70).replace(/-$/, '');
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
// Datas sem fuso (ex.: "2026-11-05T10:00:00", formato da Remotive) são tratadas como UTC,
// para o resultado ser igual no teu computador e no CI.
const isoDate = (d) => {
  if (!d) return null;
  const s = String(d).trim();
  const t = new Date(/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d)?$/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
  return isNaN(t) ? null : t.toISOString();
};

// Palavras com 4+ letras casam no início de uma palavra (permite radicais: "financ" -> "finanças").
// Palavras curtas ("ti", "hr", "seo") só casam como palavra inteira, senão "ti" apanhava tudo.
function classify(text, map, fallback) {
  const t = norm(text);
  for (const [key, words] of Object.entries(map)) {
    const hit = words.some((w) => {
      const k = norm(w);
      if (!k) return false;
      return new RegExp(k.length < 4 ? `(^| )${k}( |$)` : `(^| )${k}`).test(t);
    });
    if (hit) return key;
  }
  return fallback;
}

// ---------- adaptadores (cada um devolve vagas "cruas" no esquema comum) ----------
async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Tipos de contrato da fonte (inglês) para português. Valores desconhecidos ficam vazios em vez de aparecerem em inglês.
const TIPOS = { full_time: 'Tempo inteiro', part_time: 'Tempo parcial', contract: 'Contrato', freelance: 'Freelance', internship: 'Estágio', temporary: 'Temporário' };

const adapters = {
  async remotive(src) {
    const data = FIXTURE ? rd('scripts/fixtures/remotive.json') : await getJson(src.url);
    return (data.jobs || []).map((j) => ({
      idOrigem: String(j.id), titulo: j.title, empresa: j.company_name, local: j.candidate_required_location || 'Remoto',
      remoto: true, tipo: TIPOS[j.job_type] || '', categoriaOrigem: j.category || '',
      html: j.description || '', urlOriginal: j.url, dataPublicacao: j.publication_date,
    }));
  },
  async rss(src) {
    if (!src.url) throw new Error('url do feed não configurado');
    const r = await fetch(src.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const x = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(await r.text());
    const items = x?.rss?.channel?.item ?? x?.feed?.entry ?? [];
    return (Array.isArray(items) ? items : [items]).map((i) => ({
      idOrigem: String(i.guid?.['#text'] ?? i.guid ?? i.id ?? i.link?.['@_href'] ?? i.link),
      titulo: stripHtml(String(i.title?.['#text'] ?? i.title ?? '')), empresa: i.author?.name ?? i['dc:creator'] ?? '',
      local: '', remoto: false, tipo: '', categoriaOrigem: '',
      html: String(i.description ?? i.summary?.['#text'] ?? i.summary ?? i.content?.['#text'] ?? ''),
      urlOriginal: typeof i.link === 'string' ? i.link : i.link?.['@_href'] ?? '', dataPublicacao: i.pubDate ?? i.published ?? i.updated,
    }));
  },
  async manual(src) {
    return JSON.parse(fs.readFileSync(path.join(root, src.url), 'utf8'));
  },
};

// ---------- normalização e filtros ----------
function normalise(raw, src, stats) {
  const url = safeUrl(raw.urlOriginal);
  const titulo = stripHtml(raw.titulo || '');
  if (!url || !titulo) { stats.descartadas++; return null; }
  const bodyText = stripHtml(raw.html || raw.descricao || raw.resumo || '');
  const fullText = `${titulo} ${bodyText}`;
  if (scamRes.some((re) => re.test(fullText))) { stats.burla++; return null; }
  const data = isoDate(raw.dataPublicacao) || new Date(now).toISOString();
  const resumo = excerpt(bodyText);
  // Texto completo só para fontes cujos termos o permitem (submissões próprias). As outras mostram apenas o excerto.
  const descricao = src.googleJobs ? bodyText.slice(0, 5000) : undefined;
  const local = (raw.local || '').trim();
  const pais = classify(`${local} ${titulo}`, taxonomy.paises, raw.remoto ? 'Remoto' : 'Outro');
  const categoria = classify(`${titulo} ${raw.categoriaOrigem || ''}`, taxonomy.categorias, 'outras');
  const empresa = (raw.empresa || '').trim() || 'Empresa não indicada';
  const dedupKey = hash(norm(`${titulo}|${empresa}|${local}`));
  const id = `${src.id}-${hash(src.id + ':' + (raw.idOrigem || url))}`;
  return {
    id, slug: `${slugify(titulo + ' ' + empresa)}-${id.slice(-6)}`, titulo, empresa, local: local || (raw.remoto ? 'Remoto' : ''),
    pais, remoto: !!raw.remoto, tipo: raw.tipo || '', categoria, resumo, descricao, urlOriginal: url, fonte: src.id,
    dataPublicacao: data, validoAte: new Date(new Date(data).getTime() + config.diasValidade * 24 * H).toISOString(),
    dedupKey, exemplo: FIXTURE || undefined,
  };
}

// ---------- execução ----------
const summary = { porFonte: {}, avisos: [], novas: 0, removidas: 0 };
const prevById = new Map(previous.jobs.map((j) => [j.id, j]));
const collected = [];
const fontesMeta = { ...(previous.meta?.fontes || {}) };

for (const src of sources) {
  if (!src.activa) continue;
  const stats = { obtidas: 0, descartadas: 0, burla: 0, atrasadas: 0, estado: 'ok' };
  summary.porFonte[src.id] = stats;
  const last = fontesMeta[src.id]?.ultimaConsulta ? new Date(fontesMeta[src.id].ultimaConsulta).getTime() : 0;
  // Tolerância de 20 min: o cron do GitHub Actions atrasa de forma variável. Sem isto, uma execução
  // que chegue 5h52 depois da anterior seria ignorada e as vagas ficariam até 12 h sem actualizar.
  const mustWait = !FIXTURE && src.intervaloMinHoras && now - last < src.intervaloMinHoras * H - 20 * 60 * 1000;
  const keepPrevious = (motivo) => {
    stats.estado = motivo;
    for (const j of previous.jobs) if (j.fonte === src.id && new Date(j.validoAte).getTime() > now) collected.push({ ...j, _mantida: true });
  };
  if (mustWait) { keepPrevious('ignorada (intervalo mínimo respeitado)'); continue; }
  const adapter = adapters[src.tipo];
  if (!adapter) { summary.avisos.push(`${src.id}: tipo "${src.tipo}" sem adaptador`); keepPrevious('sem adaptador'); continue; }
  try {
    if (FIXTURE && src.tipo !== 'remotive' && src.tipo !== 'manual') throw new Error('sem fixture para este tipo');
    const rawJobs = await adapter(src);
    stats.obtidas = rawJobs.length;
    for (const raw of rawJobs) {
      const job = normalise(raw, src, stats);
      if (!job) continue;
      if (src.atrasoHoras && now - new Date(job.dataPublicacao).getTime() < src.atrasoHoras * H) { stats.atrasadas++; continue; }
      if (new Date(job.validoAte).getTime() < now) continue;
      const old = prevById.get(job.id);
      job.primeiraVez = old?.primeiraVez || new Date(now).toISOString();
      job.visto = new Date(now).toISOString();
      collected.push(job);
    }
    fontesMeta[src.id] = { ultimaConsulta: new Date(now).toISOString() };
  } catch (e) {
    summary.avisos.push(`${src.id}: falhou (${e.message}); vagas anteriores mantidas`);
    keepPrevious('erro: ' + e.message);
  }
}

// deduplicar por URL e por chave título+empresa+local
const seenUrl = new Set(), seenKey = new Set();
let jobs = collected.filter((j) => {
  if (seenUrl.has(j.urlOriginal) || seenKey.has(j.dedupKey)) return false;
  seenUrl.add(j.urlOriginal); seenKey.add(j.dedupKey); return true;
}).map(({ _mantida, ...j }) => j);

jobs.sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao));
const newIds = new Set(jobs.map((j) => j.id));
summary.novas = jobs.filter((j) => !prevById.has(j.id)).length;
summary.removidas = previous.jobs.filter((j) => !newIds.has(j.id)).length;

const out = { meta: { geradoEm: new Date(now).toISOString(), exemplo: FIXTURE, total: jobs.length, fontes: fontesMeta }, jobs };
fs.writeFileSync(jobsFile, JSON.stringify(out, null, 1));

console.log(`\nIngestão ${FIXTURE ? '(FIXTURE - dados de exemplo)' : ''} concluída: ${jobs.length} vagas`);
for (const [id, s] of Object.entries(summary.porFonte)) console.log(`  - ${id}: obtidas=${s.obtidas} descartadas=${s.descartadas} burla=${s.burla} atrasadas(24h)=${s.atrasadas} estado=${s.estado}`);
console.log(`  novas=${summary.novas} removidas=${summary.removidas}`);
for (const a of summary.avisos) console.warn('  AVISO:', a);
