import { parse, type ParsedAuthor } from '@retorquere/bibtex-parser';
import type { BibEntry } from './resolver';

function formatAuthor(a: ParsedAuthor): string {
  if (a.lastName && a.firstName) return `${a.lastName}, ${a.firstName}`;
  if (a.lastName) return a.lastName;
  if (a.firstName) return a.firstName;
  const institutional = (a as ParsedAuthor & { name?: string }).name;
  if (institutional) return institutional;
  return '';
}

export function parseBibliography(bibtex: string): BibEntry[] {
  const result = parse(bibtex);
  return result.entries.map((entry) => {
    const f = entry.fields;
    const authorField = f.author;
    const authors = Array.isArray(authorField)
      ? authorField.map(formatAuthor).filter((a) => a !== '')
      : [];
    const yearRaw = f.year;
    const yearStr =
      typeof yearRaw === 'string'
        ? yearRaw
        : typeof yearRaw === 'number'
          ? String(yearRaw)
          : '';
    const yearMatch = /\d{4}/.exec(yearStr);
    const year = yearMatch ? Number(yearMatch[0]) : undefined;
    return {
      citationKey: entry.key,
      title: typeof f.title === 'string' ? f.title : '',
      authors,
      ...(year !== undefined ? { year } : {}),
      ...(typeof f.doi === 'string' ? { doi: f.doi } : {}),
      ...(typeof f.eprint === 'string' ? { arxivId: f.eprint } : {}),
    };
  });
}
