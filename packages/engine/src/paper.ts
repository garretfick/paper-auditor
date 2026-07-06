import { readFile } from 'node:fs/promises';
import { sentences as splitSentences } from 'sbd';
import { parseBibliography } from './bibtex';
import type { BibEntry } from './resolver';

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface TextSpan {
  start: Position;
  end: Position;
}

export interface Sentence {
  text: string;
  span: TextSpan;
}

export interface Citation {
  citationKey: string;
  span: TextSpan;
}

export interface Paper {
  source: string;
  sentences: Sentence[];
  citations: Citation[];
  bibliography: BibEntry[];
}

export async function loadPaper(
  paperPath: string,
  bibPath: string,
): Promise<Paper> {
  const [source, bibText] = await Promise.all([
    readFile(paperPath, 'utf8').catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read Paper at ${paperPath}: ${detail}`);
    }),
    readFile(bibPath, 'utf8').catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read Bibliography at ${bibPath}: ${detail}`);
    }),
  ]);

  const bibliography = parseBibliography(bibText);
  if (bibText.trim().length > 0 && bibliography.length === 0) {
    throw new Error(
      `Malformed BibTeX in ${bibPath}: file has content but no entries were found`,
    );
  }

  return {
    source,
    sentences: extractSentences(source),
    citations: extractCitations(source, bibliography),
    bibliography,
  };
}

const PANDOC_KEY_RE = /@(\w+)/g;
const AUTHOR_YEAR_RE =
  /^([A-Z][\w]*(?:\s+[A-Z][\w]*)*)(?:\s+et\s+al\.?)?\s+(\d{4})$/;

function extractCitations(
  source: string,
  bibliography: BibEntry[],
): Citation[] {
  const citations: Citation[] = [];
  for (const bracket of source.matchAll(/\[([^\]]+)\]/g)) {
    const inside = bracket[1];
    if (!inside) continue;

    const pandoc = extractPandocCitations(source, bracket.index, inside);
    if (pandoc.length > 0) {
      citations.push(...pandoc);
      continue;
    }
    citations.push(
      ...extractAuthorYearCitations(
        source,
        bracket.index,
        bracket[0].length,
        inside,
        bibliography,
      ),
    );
  }
  return citations;
}

function extractPandocCitations(
  source: string,
  bracketStart: number,
  inside: string,
): Citation[] {
  const insideStart = bracketStart + 1;
  const out: Citation[] = [];
  for (const keyMatch of inside.matchAll(PANDOC_KEY_RE)) {
    const key = keyMatch[1];
    if (!key) continue;
    const atOffset = insideStart + keyMatch.index;
    const endOffset = atOffset + keyMatch[0].length;
    out.push({
      citationKey: key,
      span: {
        start: positionAt(source, atOffset),
        end: positionAt(source, endOffset),
      },
    });
  }
  return out;
}

function extractAuthorYearCitations(
  source: string,
  bracketStart: number,
  bracketLength: number,
  inside: string,
  bibliography: BibEntry[],
): Citation[] {
  const bracketSpan: TextSpan = {
    start: positionAt(source, bracketStart),
    end: positionAt(source, bracketStart + bracketLength),
  };
  const out: Citation[] = [];
  for (const part of inside.split(';')) {
    const trimmed = part.trim();
    const ay = AUTHOR_YEAR_RE.exec(trimmed);
    if (!ay) continue;
    const [, authorMatch, yearMatch] = ay;
    if (!authorMatch || !yearMatch) continue;
    const author = authorMatch;
    const year = Number(yearMatch);
    const entry = bibliography.find(
      (e) => e.year === year && firstAuthorLastName(e) === author,
    );
    out.push({
      citationKey: entry ? entry.citationKey : trimmed,
      span: bracketSpan,
    });
  }
  return out;
}

function extractSentences(source: string): Sentence[] {
  const texts = splitSentences(source);
  const result: Sentence[] = [];
  let cursor = 0;
  for (const text of texts) {
    const offset = source.indexOf(text, cursor);
    if (offset === -1) continue;
    const endOffset = offset + text.length;
    cursor = endOffset;
    result.push({
      text,
      span: {
        start: positionAt(source, offset),
        end: positionAt(source, endOffset),
      },
    });
  }
  return result;
}

function firstAuthorLastName(entry: BibEntry): string {
  const first = entry.authors[0] ?? '';
  const commaIdx = first.indexOf(',');
  return commaIdx >= 0 ? first.slice(0, commaIdx) : first;
}

export function positionAt(source: string, offset: number): Position {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column, offset };
}
