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
    citations: extractCitations(source),
    bibliography,
  };
}

function extractCitations(source: string): Citation[] {
  const citations: Citation[] = [];
  for (const bracket of source.matchAll(/\[([^\]]+)\]/g)) {
    const inside = bracket[1];
    if (!inside) continue;
    const insideStart = bracket.index + 1;
    for (const keyMatch of inside.matchAll(/@(\w+)/g)) {
      const key = keyMatch[1];
      if (!key) continue;
      const atOffset = insideStart + keyMatch.index;
      const endOffset = atOffset + keyMatch[0].length;
      citations.push({
        citationKey: key,
        span: {
          start: positionAt(source, atOffset),
          end: positionAt(source, endOffset),
        },
      });
    }
  }
  return citations;
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
