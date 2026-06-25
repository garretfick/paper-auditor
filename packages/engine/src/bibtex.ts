import { parse, type ParsedAuthor } from '@retorquere/bibtex-parser';
import type { BibEntry } from './resolver';

function formatAuthor(a: ParsedAuthor): string {
  if (a.lastName && a.firstName) return `${a.lastName}, ${a.firstName}`;
  if (a.lastName) return a.lastName;
  if (a.firstName) return a.firstName;
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
    const year =
      typeof f.year === 'string'
        ? f.year.trim()
        : typeof f.year === 'number'
          ? String(f.year)
          : '';
    return {
      citationKey: entry.key,
      title: typeof f.title === 'string' ? f.title : '',
      authors,
      ...(year ? { year } : {}),
      ...(typeof f.doi === 'string' ? { doi: f.doi } : {}),
      ...(typeof f.eprint === 'string' ? { arxivId: f.eprint } : {}),
    };
  });
}
