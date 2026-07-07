import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { Paper, Sentence, TextSpan } from './paper';
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
  fetch?: typeof fetch;
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

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\w+/g) ?? [];
}

// Fraction of quotedText's tokens that also appear in the sentence.
function tokenOverlap(quotedText: string, sentenceText: string): number {
  const quoted = tokenize(quotedText);
  if (quoted.length === 0) return 0;
  const inSentence = new Set(tokenize(sentenceText));
  const shared = quoted.filter((t) => inSentence.has(t)).length;
  return shared / quoted.length;
}

const OVERLAP_THRESHOLD = 0.5;

function bestOverlappingSentence(
  quotedText: string,
  sentences: Sentence[],
): Sentence | null {
  let best: Sentence | null = null;
  let bestScore = OVERLAP_THRESHOLD;
  for (const sentence of sentences) {
    const score = tokenOverlap(quotedText, sentence.text);
    if (score >= bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  return best;
}

function resolveClaim(
  raw: z.infer<typeof claimItemSchema>,
  paper: Paper,
): Claim {
  const source = paper.source;
  const offset = source.indexOf(raw.quotedText);
  let spans: TextSpan[];
  if (offset !== -1) {
    spans = [
      {
        start: positionAt(source, offset),
        end: positionAt(source, offset + raw.quotedText.length),
      },
    ];
  } else {
    const fallback = bestOverlappingSentence(raw.quotedText, paper.sentences);
    if (fallback) {
      spans = [fallback.span];
    } else {
      spans = [];
      console.warn(
        `Ollama Claim Extractor: could not locate claim text in the paper (no verbatim or overlapping-sentence match); span left empty for: "${raw.quotedText}"`,
      );
    }
  }
  return {
    type: raw.claimType,
    confidence: raw.confidence,
    spans,
    quotedText: raw.quotedText,
    citationKeys: raw.citationKeys,
  };
}

function diagnoseFailure(
  detail: string,
  baseURL: string,
  modelName: string,
  models: string[] | null,
): string {
  const head = `Ollama Claim Extractor failed (${detail}).`;
  if (models === null) {
    return `${head} Check that Ollama is running at ${baseURL} and that the "${modelName}" model is pulled (\`ollama pull ${modelName}\`).`;
  }
  const list = models.length > 0 ? models.join(', ') : '(none)';
  const inventory = `The Ollama at ${baseURL} has these models pulled: ${list}.`;
  if (!models.includes(modelName)) {
    return `${head} ${inventory} The configured "${modelName}" model is not in that list — run \`ollama pull ${modelName}\`, or configure one of the listed models. If \`ollama list\` on the command line does show "${modelName}", a different Ollama process is likely bound to this port (a common cause is a Docker container with an IPv6 wildcard binding hijacking localhost); point the auditor at http://127.0.0.1:11434/v1 to force IPv4.`;
  }
  return `${head} ${inventory}`;
}

async function pulledModelNames(
  baseURL: string,
  fetchImpl: typeof fetch,
): Promise<string[] | null> {
  const tagsURL = `${baseURL.replace(/\/v1\/?$/, '')}/api/tags`;
  try {
    const res = await fetchImpl(tagsURL);
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: { name?: string }[] };
    const names = (body.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === 'string');
    return names;
  } catch {
    return null;
  }
}

export function createOllamaClaimExtractor(
  opts: OllamaClaimExtractorOptions = {},
): ClaimExtractor {
  const model = opts.model ?? defaultOllamaModel(opts);
  const modelName = opts.modelName ?? 'llama3.1:8b';
  const baseURL = opts.baseURL ?? 'http://localhost:11434/v1';
  const fetchImpl = opts.fetch ?? fetch;

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
      const models = await pulledModelNames(baseURL, fetchImpl);
      throw new Error(diagnoseFailure(detail, baseURL, modelName, models));
    }

    const envelope = claimsResponseSchema.safeParse(rawJson);
    if (!envelope.success) {
      const preview = JSON.stringify(rawJson).slice(0, 500);
      throw new Error(
        `Ollama Claim Extractor: model response is not a {"claims": [...]} object. First 500 chars: ${preview}. Zod error: ${envelope.error.message}`,
      );
    }

    const claims: Claim[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const item of envelope.data.claims) {
      const parsed = claimItemSchema.safeParse(item);
      if (parsed.success) {
        const claim = resolveClaim(parsed.data, paper);
        const dedupKey = `${claim.quotedText} ${String(
          claim.spans[0]?.start.offset ?? -1,
        )}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        claims.push(claim);
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
