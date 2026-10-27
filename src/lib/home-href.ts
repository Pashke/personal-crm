// The one place that builds addresses of the home page: filter buttons, links from the pages
// «Группы» and of a contact, and the search box all use it. The group goes first, then the search.
export function homeHref({ q, groupId }: { q?: string; groupId?: number | null }) {
  const params: string[] = [];
  if (groupId) params.push(`group=${groupId}`);
  const query = q?.trim();
  if (query) params.push(`q=${encodeURIComponent(query)}`);
  return params.length > 0 ? `/?${params.join("&")}` : "/";
}
