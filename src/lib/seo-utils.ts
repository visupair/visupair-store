/** Strip simple HTML tags for meta descriptions and schema. */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Google typically shows ~150–160 characters for snippets. */
export function truncateMetaDescription(text: string, max = 155): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}
