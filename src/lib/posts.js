const mods = import.meta.glob('../posts/*.md', { eager: true });

// O YAML do frontmatter converte "2026-11-01" num objecto Date. Guardamos sempre texto AAAA-MM-DD.
const dia = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

export const posts = Object.entries(mods)
  .map(([file, m]) => ({
    slug: file.split('/').pop().replace(/\.md$/, ''),
    title: m.frontmatter.title,
    description: m.frontmatter.description,
    date: dia(m.frontmatter.date),
    Content: m.Content,
  }))
  .sort((a, b) => b.date.localeCompare(a.date));
