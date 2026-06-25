import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { Citation, Paper } from './paper';

/**
 * Narrows a high-recall set of candidate Citations down to the ones that are
 * genuine bibliographic Citations, discarding citation-shaped false positives
 * (cross-references like `[@fig:1]`, bare years, capitalized-word-plus-number).
 *
 * A Citation Filter is a pure discriminator: it never sees the Bibliography and
 * never normalizes Citation Keys — surname+year resolution stays independent of
 * the model. See ADR-0007.
 */
export type CitationFilter = (
  paper: Paper,
  candidates: Citation[],
) => Promise<Citation[]>;

/** Pass-through Filter for tests and for opting out of the LLM pass. */
export const stubCitationFilter: CitationFilter = (_paper, candidates) =>
  Promise.resolve(candidates);

export interface OllamaCitationFilterOptions {
  model?: LanguageModel;
  modelName?: string;
  baseURL?: string;
  apiKey?: string;
}

const SYSTEM_PROMPT = `You are an academic paper auditor. A high-recall pattern matcher found candidate citation strings in a paper. Some are genuine bibliographic citations that point to a source in the reference list. Others are false positives.

Common false positives to reject:
- Cross-references such as "[@fig:1]", "[@eq:2]", "[@tbl:3]", "[@sec:intro]" (these point to figures/equations/tables/sections, not sources)
- Bare years or capitalized words next to a number that are not citations (e.g. "(Table 2020)", "Section 3 (2024)")
- Ordinary prose that merely resembles an author-year reference

For each candidate, decide: is this a genuine bibliographic citation to a Source?

Return JSON: { "keep": [<ids of the genuine citations>] }. Include an id only when you are confident the candidate is a real citation; omit everything else.`;

const responseSchema = z.object({
  keep: z.array(z.number()),
});

function contextAround(
  source: string,
  citation: Citation,
  radius = 80,
): string {
  const start = Math.max(0, citation.span.start.offset - radius);
  const end = Math.min(source.length, citation.span.end.offset + radius);
  return source.slice(start, end).replace(/\s+/g, ' ').trim();
}

function defaultOllamaModel(opts: OllamaCitationFilterOptions): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: opts.baseURL ?? 'http://localhost:11434/v1',
    apiKey: opts.apiKey ?? 'ollama',
  });
  return provider(opts.modelName ?? 'llama3.1:8b');
}

export function createOllamaCitationFilter(
  opts: OllamaCitationFilterOptions = {},
): CitationFilter {
  const model = opts.model ?? defaultOllamaModel(opts);
  const modelName = opts.modelName ?? 'llama3.1:8b';
  const baseURL = opts.baseURL ?? 'http://localhost:11434/v1';

  return async (paper, candidates) => {
    if (candidates.length === 0) return [];

    const listing = candidates
      .map(
        (c, i) =>
          `#${String(i)}: "${c.rawText ?? c.citationKey}" — context: …${contextAround(paper.source, c)}…`,
      )
      .join('\n');

    let rawJson: unknown;
    try {
      const { output } = await generateText({
        model,
        output: Output.json({
          name: 'citation_filter_response',
          description:
            'A JSON object with a single "keep" array of candidate ids (numbers) that are genuine bibliographic citations.',
        }),
        system: SYSTEM_PROMPT,
        prompt: listing,
        temperature: 0,
      });
      rawJson = output;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Ollama Citation Filter failed (${detail}). Check that Ollama is running at ${baseURL} and that the "${modelName}" model is pulled (\`ollama pull ${modelName}\`).`,
      );
    }

    const parsed = responseSchema.safeParse(rawJson);
    if (!parsed.success) {
      const preview = JSON.stringify(rawJson).slice(0, 500);
      throw new Error(
        `Ollama Citation Filter: model response is not a {"keep": [...]} object. First 500 chars: ${preview}. Zod error: ${parsed.error.message}`,
      );
    }

    const keep = new Set(parsed.data.keep);
    return candidates.filter((_, i) => keep.has(i));
  };
}
