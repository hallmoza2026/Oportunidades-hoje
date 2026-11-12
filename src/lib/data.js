import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

export const config = JSON.parse(read('site.config.json'));
const file = JSON.parse(read('data/jobs.json'));
export const meta = file.meta;
export const jobs = file.jobs;
export const sources = Object.fromEntries(YAML.parse(read('sources.yaml')).sources.map((s) => [s.id, s]));

export const slugify = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const categoriaNome = (slug) => config.categorias.find((c) => c.slug === slug)?.nome ?? 'Outras';
export const fonteDe = (job) => sources[job.fonte] ?? { nome: job.fonte, atribuicao: { texto: job.fonte, link: '' } };

// Locale "pt" e não "pt-MZ"/"pt-PT": estes dão "9/11/2026", que é ambíguo. "pt" dá "9 de nov. de 2026".
export const fmtData = (iso) =>
  new Date(iso).toLocaleDateString('pt', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtDataCurta = (iso) =>
  new Date(iso).toLocaleDateString('pt', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const abs = (p = '/') => new URL(p, config.url).href;

// "Remoto" e "Outro" não são países: Remoto tem a sua página (/remoto/) e Outro não merece página própria.
export const paises = [...new Set(jobs.map((j) => j.pais).filter((p) => p !== 'Remoto' && p !== 'Outro'))]
  .map((nome) => ({ nome, slug: slugify(nome) }))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

export const categoriasUsadas = config.categorias.filter((c) => jobs.some((j) => j.categoria === c.slug));

const ISO_PAIS = { 'Moçambique': 'MZ', Angola: 'AO', Portugal: 'PT', Brasil: 'BR' };

// JSON-LD JobPosting: só quando a fonte permite Google Jobs, há texto completo e todos os campos obrigatórios.
// Nunca inventa valores: se faltar algo, devolve null.
export function jobPostingLd(job) {
  const src = fonteDe(job);
  if (!src.googleJobs || !job.descricao || !job.titulo || !job.empresa || !job.dataPublicacao || !job.validoAte) return null;
  if (job.empresa === 'Empresa não indicada') return null;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.titulo,
    description: job.descricao,
    datePosted: job.dataPublicacao,
    validThrough: job.validoAte,
    hiringOrganization: { '@type': 'Organization', name: job.empresa },
    directApply: false,
    url: abs(`/vagas/${job.slug}/`),
  };
  if (job.remoto) {
    ld.jobLocationType = 'TELECOMMUTE';
    const cc = ISO_PAIS[job.pais];
    if (!cc) return null;
    ld.applicantLocationRequirements = { '@type': 'Country', name: cc };
  } else {
    const cc = ISO_PAIS[job.pais];
    if (!cc) return null;
    ld.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: cc, addressLocality: job.local ? job.local.split(',')[0].trim() : undefined } };
  }
  return ld;
}
