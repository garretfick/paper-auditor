import type { BibEntry } from './resolver';

const ENTRY_REGEX = /@\w+\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\}/g;

function getField(body: string, name: string): string | undefined {
  const match = body.match(new RegExp(`${name}\\s*=\\s*\\{([^}]+)\\}`, 'i'));
  return match?.[1]?.trim();
}

export function parseBibliography(bibtex: string): BibEntry[] {
  const entries: BibEntry[] = [];
  for (const match of bibtex.matchAll(ENTRY_REGEX)) {
    const citationKey = match[1]!;
    const body = match[2] ?? '';
    const authorField = getField(body, 'author');
    const doi = getField(body, 'doi');
    const arxivId = getField(body, 'eprint');
    entries.push({
      citationKey,
      title: getField(body, 'title') ?? '',
      authors: authorField ? authorField.split(/\s+and\s+/) : [],
      ...(doi ? { doi } : {}),
      ...(arxivId ? { arxivId } : {}),
    });
  }
  return entries;
}
