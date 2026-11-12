# Vagas Hoje

Site estático (Astro) que reúne vagas de emprego de outras fontes, com pesquisa e filtros, blog, SEO e actualização automática a cada 6 horas. Para publicar, veja **DEPLOY.md**.

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências |
| `npm run ingest` | Recolhe as vagas das fontes activas e grava `data/jobs.json` |
| `npm run ingest:fixture` | Igual, mas com dados de **teste** (marca o site com aviso vermelho). Não fazer commit do resultado |
| `npm run build` | Gera o site em `dist/` |
| `npm run preview` | Vê o site gerado |
| `npm run check` | Verifica links, JSON-LD, sitemap, peso das páginas, segredos e as regras das fontes |

## Mudar o nome, o foco e os textos

Tudo está em `site.config.json`: nome, slogan, endereço, e-mail, categorias, dias de validade das vagas. Os nomes de países e as palavras-chave das categorias estão em `data/taxonomy.json`.

## Fontes de vagas

Estão em `sources.yaml`. Cada fonte falha sozinha: se uma cair, o robô mantém as vagas antigas dessa fonte e continua com as outras.

| Fonte | Estado | Notas |
|---|---|---|
| Remotive | Activa | Só vagas remotas. Termos verificados: link para o original e citar a fonte, atraso de 24 h, máx. ~4 consultas/dia, **proibido** reenviar para Google Jobs/LinkedIn e **proibido** usar as vagas para recolher e-mails. O site cumpre tudo isto |
| Submissões | Activa | Vagas aprovadas por si em `data/manual-jobs.json` |
| ReliefWeb | Desligada | Exige um *appname* aprovado e leitura dos termos de reutilização. Há o campo `url` para um feed RSS |
| Arbeitnow | Desligada | Foco europeu. Os campos da resposta não estão documentados na página oficial; confirme antes de escrever o adaptador |

**Adicionar uma fonte RSS:** em `sources.yaml` copie a entrada `reliefweb`, ponha `tipo: rss`, o `url` do feed e `activa: true`. **Antes disso, leia os termos da fonte** e preencha `atrasoHoras`, `intervaloMinHoras`, `googleJobs` e `proibeCaptacao` conforme o que ela permitir.

**Adicionar uma vaga à mão:** acrescente um objecto a `data/manual-jobs.json`:

```json
{
  "idOrigem": "m1",
  "titulo": "Assistente Administrativo",
  "empresa": "Empresa Lda",
  "local": "Maputo, Moçambique",
  "remoto": false,
  "tipo": "Tempo inteiro",
  "descricao": "Texto completo da vaga.",
  "urlOriginal": "https://empresa.example/emprego/assistente",
  "dataPublicacao": "2026-11-10T08:00:00"
}
```

Só as vagas manuais mostram o texto completo e geram dados estruturados do Google (`JobPosting`), porque é conteúdo enviado por quem tem o direito de o divulgar. Das restantes fontes mostramos só um resumo.

## Forçar uma actualização

No GitHub: **Actions → Atualizar vagas → Run workflow**.

## Como a ingestão protege o site

Descarta vagas sem título ou com link inválido, com padrões de burla (`data/blocklist.json`), duplicadas, expiradas, e as que ainda não passaram o atraso exigido pela fonte. Nenhuma chave está no código: chaves de API vão nos *Secrets* do GitHub.

## Limitações conhecidas

- A recolha da Remotive foi testada com dados no formato documentado, não contra a API real (o ambiente de desenvolvimento não tinha acesso à rede). A primeira execução no GitHub é o teste real: veja o registo.
- As páginas legais são texto-modelo. Reveja-as com um profissional antes de monetizar.
- A lista da página inicial mostra todas as vagas. Acima de umas centenas, convém paginar.
