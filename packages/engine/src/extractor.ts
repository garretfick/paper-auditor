import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { Paper, TextSpan } from './paper';
import { positionAt } from './paper';

export type ClaimType =
  | 'Background'
  | 'Method'
  | 'Result'
  | 'Discussion'
  | 'Navigation';

export type Confidence = 'high' | 'medium' | 'low';

export interface Claim {
  type: ClaimType;
  confidence: Confidence;
  spans: TextSpan[];
  quotedText: string;
  citationKeys: string[];
}

export type ClaimExtractor = (paper: Paper) => Promise<Claim[]>;

const claimItemSchema = z.object({
  quotedText: z.string(),
  claimType: z.enum([
    'Background',
    'Method',
    'Result',
    'Discussion',
    'Navigation',
  ]),
  confidence: z.enum(['high', 'medium', 'low']),
  citationKeys: z.array(z.string()),
});

const claimsResponseSchema = z.object({
  claims: z.array(z.unknown()),
});

export interface OllamaClaimExtractorOptions {
  model?: LanguageModel;
  modelName?: string;
  baseURL?: string;
  apiKey?: string;
}

const SYSTEM_PROMPT = `You are an academic paper auditor. Extract every claim from the paper text.

A claim is a unit of assertion. It may span part of a sentence, an entire sentence, or multiple sentences. One sentence may contain multiple distinct claims.

For each claim, return:
- quotedText: the verbatim text of the claim, exactly as it appears in the source
- claimType: one of Background (about prior work / established facts — needs a citation), Method (the author's own approach), Result (the author's own findings), Discussion (interpretation), Navigation (structural sentences like "Section 3 presents…")
- confidence: high, medium, or low
- citationKeys: the citation keys [@key] that the LLM judges support this claim (no positional rule — attach by meaning)

Examples:

INPUT: "Transformers exhibit emergent capabilities [@wei2022]."
OUTPUT: { "claims": [{ "quotedText": "Transformers exhibit emergent capabilities", "claimType": "Background", "confidence": "high", "citationKeys": ["wei2022"] }] }

INPUT: "We achieve 92% accuracy on the test set, which is consistent with prior work [@smith2021]."
OUTPUT: { "claims": [
  { "quotedText": "We achieve 92% accuracy on the test set", "claimType": "Result", "confidence": "high", "citationKeys": [] },
  { "quotedText": "which is consistent with prior work", "claimType": "Background", "confidence": "medium", "citationKeys": ["smith2021"] }
] }

INPUT: "Several pretrained models — including BERT [@devlin], GPT [@radford], and T5 [@raffel] — pretrain on large corpora."
OUTPUT: { "claims": [
  { "quotedText": "BERT [@devlin] ... pretrain on large corpora", "claimType": "Background", "confidence": "high", "citationKeys": ["devlin"] },
  { "quotedText": "GPT [@radford] ... pretrain on large corpora", "claimType": "Background", "confidence": "high", "citationKeys": ["radford"] },
  { "quotedText": "T5 [@raffel] ... pretrain on large corpora", "claimType": "Background", "confidence": "high", "citationKeys": ["raffel"] }
] }`;

function defaultOllamaModel(opts: OllamaClaimExtractorOptions): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: opts.baseURL ?? 'http://localhost:11434/v1',
    apiKey: opts.apiKey ?? 'ollama',
  });
  return provider(opts.modelName ?? 'llama3.1:8b');
}

function resolveClaim(
  raw: z.infer<typeof claimItemSchema>,
  source: string,
): Claim {
  const offset = source.indexOf(raw.quotedText);
  const spans: TextSpan[] =
    offset === -1
      ? []
      : [
          {
            start: positionAt(source, offset),
            end: positionAt(source, offset + raw.quotedText.length),
          },
        ];
  return {
    type: raw.claimType,
    confidence: raw.confidence,
    spans,
    quotedText: raw.quotedText,
    citationKeys: raw.citationKeys,
  };
}

export function createOllamaClaimExtractor(
  opts: OllamaClaimExtractorOptions = {},
): ClaimExtractor {
  const model = opts.model ?? defaultOllamaModel(opts);
  const modelName = opts.modelName ?? 'llama3.1:8b';
  const baseURL = opts.baseURL ?? 'http://localhost:11434/v1';

  return async (paper) => {
    let rawJson: unknown;
    try {
      const { output } = await generateText({
        model,
        output: Output.json({
          name: 'claims_response',
          description:
            'A JSON object with a single "claims" array. Each claim has quotedText, claimType, confidence, and citationKeys.',
        }),
        system: SYSTEM_PROMPT,
        prompt: paper.source,
        temperature: 0,
      });
      rawJson = output;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Ollama Claim Extractor failed (${detail}). Check that Ollama is running at ${baseURL} and that the "${modelName}" model is pulled (\`ollama pull ${modelName}\`).`,
      );
    }

    const envelope = claimsResponseSchema.safeParse(rawJson);
    if (!envelope.success) {
      const preview = JSON.stringify(rawJson).slice(0, 500);
      throw new Error(
        `Ollama Claim Extractor: model response is not a {"claims": [...]} object. First 500 chars: ${preview}. Zod error: ${envelope.error.message}`,
      );
    }

    const claims: Claim[] = [];
    let skipped = 0;
    for (const item of envelope.data.claims) {
      const parsed = claimItemSchema.safeParse(item);
      if (parsed.success) {
        claims.push(resolveClaim(parsed.data, paper.source));
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      console.warn(
        `Ollama Claim Extractor: skipped ${String(skipped)} malformed claim(s) out of ${String(envelope.data.claims.length)} returned by the model.`,
      );
    }
    if (process.env.PAPER_AUDITOR_DEBUG_EXTRACTOR === '1') {
      console.error('--- Claims extracted ---');
      for (const c of claims) {
        console.error(
          `  [${c.type}/${c.confidence}] keys=${JSON.stringify(c.citationKeys)} text="${c.quotedText.slice(0, 80)}"`,
        );
      }
    }
    return claims;
  };
}

export const stubClaimExtractor: ClaimExtractor = (paper) => {
  return Promise.resolve(
    paper.sentences.map((sentence) => {
      const citationKeys = paper.citations
        .filter(
          (c) =>
            c.span.start.offset >= sentence.span.start.offset &&
            c.span.end.offset <= sentence.span.end.offset,
        )
        .map((c) => c.citationKey);
      return {
        type: 'Background' as const,
        confidence: 'low' as const,
        spans: [sentence.span],
        quotedText: sentence.text,
        citationKeys,
      };
    }),
  );
};
