export function parseTags(tags: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(tags)) return result;
  for (const tag of tags) {
    const t = tag as Record<string, string>;
    if (t.Key && t.Value !== undefined) result[t.Key] = t.Value;
  }
  return result;
}
