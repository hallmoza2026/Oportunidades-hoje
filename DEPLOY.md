# Publicar o site (cerca de 15 minutos, grátis)

**Atenção ao enviar para o GitHub pelo telemóvel:** o GitHub não descompacta ficheiros .zip. Extraia o zip primeiro e envie os ficheiros e pastas (incluindo `.github`, `.gitignore` e `.node-version`, que começam por ponto). Se o telemóvel não deixar escolher pastas ocultas, no GitHub use **Add file → Create new file** e escreva o caminho completo, por exemplo `.github/workflows/update-jobs.yml`, colando o conteúdo.

O código já está pronto e testado. Falta ligá-lo a contas que só você pode criar.

1. **Criar conta no GitHub** (github.com) e um repositório novo, vazio, chamado `vagas-hoje`.

2. **Enviar o código** (na pasta do projecto):
   ```bash
   git remote add origin https://github.com/O-SEU-UTILIZADOR/vagas-hoje.git
   git branch -M main
   git push -u origin main
   ```

3. **Criar conta no Cloudflare** (dash.cloudflare.com) e abrir **Workers & Pages → Create → Pages → Connect to Git**. Escolha o repositório `vagas-hoje`.

4. **Configurar a compilação** (não use "None": este projecto precisa de compilar):
   - Framework preset: `Astro`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: deixe vazio (o `package.json` tem de estar na raiz do repositório, não dentro de uma pasta)
   - Variável de ambiente: `NODE_VERSION` = `22.23.4` (o Astro 7 exige pelo menos esta versão; o ficheiro `.node-version` já a indica)

5. **Guardar e implementar.** Ao fim de 1–2 minutos recebe um endereço `https://vagas-hoje.pages.dev` (ou parecido).

6. **Pôr o endereço real no site.** Em `site.config.json` mude `"url"` para o endereço que o Cloudflare lhe deu e o `"email"` para o seu. Isto é essencial para o SEO (canonical e sitemap). Faça commit e push.

7. **Carregar as primeiras vagas.** No GitHub: separador **Actions → Atualizar vagas → Run workflow**. Em 1–2 minutos o robô recolhe as vagas, grava-as no repositório e o Cloudflare publica de novo sozinho. Daí em diante repete-se a cada 6 horas.
   - Se o separador Actions pedir, active os workflows.
   - Em **Settings → Actions → General → Workflow permissions**, escolha **Read and write permissions**.

8. **Abrir o site e conferir:** as vagas aparecem, a pesquisa funciona, o botão de uma vaga abre o anúncio original.

9. **Dizer ao Google que o site existe.** Em search.google.com/search-console adicione o site e envie `https://O-SEU-ENDERECO/sitemap.xml`. Faça o mesmo em bing.com/webmasters.

10. **(Opcional) Domínio próprio.** No Cloudflare Pages: **Custom domains → Set up a custom domain**. Depois actualize o `"url"` em `site.config.json`.

## Para activar mais tarde

| O quê | Como |
|---|---|
| Formulário Publicar vaga | Crie um formulário em formspree.io ou web3forms.com e cole o endereço em `formularioPublicar.action` de `site.config.json` |
| Visitas sem cookies | Cloudflare → Web Analytics, copie o token para `analytics.cloudflareToken` |
| ReliefWeb (ONG/humanitárias) | Peça um *appname* em apidoc.reliefweb.int, leia os termos, depois siga o `README.md` |
| Newsletter | Crie conta em buttondown.com ou mailerlite.com e cole o endereço de subscrição em `newsletter.url` |
| Anúncios (AdSense) | Só depois de o site ter tráfego e de rever Privacidade e Termos com um profissional |

## Se algo falhar

- **Site sem vagas:** o passo 7 ainda não correu, ou a execução falhou. Veja o registo em Actions.
- **Execução falha em "Construir e verificar":** a mensagem diz o que está errado (link partido, página pesada, etc.). Não publica nada até estar corrigido.
- **Aviso vermelho "Dados de exemplo":** nunca deve aparecer em produção. Corra `npm run ingest` (sem `--fixture`) e faça commit de `data/jobs.json`.
