import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import url from 'node:url';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import {
  createOllamaClaimExtractor,
  loadPaper,
  positionAt,
  stubClaimExtractor,
  type Paper,
  type Sentence,
} from '../src';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, 'fixtures');

function sentenceOf(source: string, text: string): Sentence {
  const offset = source.indexOf(text);
  return {
    text,
    span: {
      start: positionAt(source, offset),
      end: positionAt(source, offset + text.length),
    },
  };
}

function mockClaimsResult(claims: unknown[]): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ claims }) }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  };
}

describe('stubClaimExtractor', () => {
  it('emits one Background Claim per Sentence with low Confidence', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'two-sentences.md'),
      path.join(fixturesDir, 'two-sentences.bib'),
    );

    const claims = await stubClaimExtractor(paper);

    expect(claims).toHaveLength(2);
    for (const claim of claims) {
      expect(claim.type).toBe('Background');
      expect(claim.confidence).toBe('low');
    }
  });

  it('attaches Citations whose span falls inside the Sentence span', async () => {
    const paper = await loadPaper(
      path.join(fixturesDir, 'cite-in-sentence.md'),
      path.join(fixturesDir, 'cite-in-sentence.bib'),
    );

    const claims = await stubClaimExtractor(paper);

    expect(claims.some((c) => c.citationKeys.includes('wei2022'))).toBe(true);
  });
});

describe('createOllamaClaimExtractor', () => {
  it('parses the LLM response into typed Claims with TextSpans resolved against the source', async () => {
    const source = 'Transformers exhibit emergent capabilities [@wei2022].\n';
    const paper: Paper = {
      source,
      sentences: [],
      citations: [],
      bibliography: [],
    };

    const mockResult: LanguageModelV3GenerateResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            claims: [
              {
                quotedText: 'Transformers exhibit emergent capabilities',
                claimType: 'Background',
                confidence: 'high',
                citationKeys: ['wei2022'],
              },
            ],
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: 100,
          noCache: 100,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 100, text: 100, reasoning: 0 },
      },
      warnings: [],
    };
    const mockModel = new MockLanguageModelV3({ doGenerate: mockResult });

    const extractor = createOllamaClaimExtractor({ model: mockModel });
    const claims = await extractor(paper);

    expect(claims).toHaveLength(1);
    expect(claims[0]!.type).toBe('Background');
    expect(claims[0]!.confidence).toBe('high');
    expect(claims[0]!.citationKeys).toEqual(['wei2022']);
    expect(claims[0]!.quotedText).toBe(
      'Transformers exhibit emergent capabilities',
    );
    expect(claims[0]!.spans).toHaveLength(1);
    const sliced = source.slice(
      claims[0]!.spans[0]!.start.offset,
      claims[0]!.spans[0]!.end.offset,
    );
    expect(sliced).toBe('Transformers exhibit emergent capabilities');
  });

  it('skips malformed claims and keeps the valid ones (lenient per-claim parsing)', async () => {
    const source = 'A claim. Another claim. A third claim.';
    const paper: Paper = {
      source,
      sentences: [],
      citations: [],
      bibliography: [],
    };

    // Two valid claims plus one with an out-of-enum claimType — the kind of
    // imperfection real LLMs produce. The valid ones should still come through.
    const mockResult: LanguageModelV3GenerateResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            claims: [
              {
                quotedText: 'A claim',
                claimType: 'Background',
                confidence: 'high',
                citationKeys: [],
              },
              {
                quotedText: 'Another claim',
                claimType: 'NotAValidType',
                confidence: 'high',
                citationKeys: [],
              },
              {
                quotedText: 'A third claim',
                claimType: 'Method',
                confidence: 'medium',
                citationKeys: [],
              },
            ],
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    };
    const mockModel = new MockLanguageModelV3({ doGenerate: mockResult });

    const extractor = createOllamaClaimExtractor({ model: mockModel });
    const claims = await extractor(paper);

    expect(claims).toHaveLength(2);
    expect(claims.map((c) => c.type)).toEqual(['Background', 'Method']);
  });

  it('deduplicates Claims the model emits twice (same quotedText)', async () => {
    const source = 'The standard defines five programming languages.\n';
    const paper: Paper = {
      source,
      sentences: [],
      citations: [],
      bibliography: [],
    };

    const duplicated = {
      quotedText: 'The standard defines five programming languages',
      claimType: 'Background',
      confidence: 'high',
      citationKeys: [],
    };
    const mockResult: LanguageModelV3GenerateResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ claims: [duplicated, duplicated] }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    };
    const mockModel = new MockLanguageModelV3({ doGenerate: mockResult });

    const extractor = createOllamaClaimExtractor({ model: mockModel });
    const claims = await extractor(paper);

    expect(claims).toHaveLength(1);
    expect(claims[0]!.quotedText).toBe(
      'The standard defines five programming languages',
    );
  });

  it('preserves distinct Claims in order (dedup only collapses true duplicates)', async () => {
    const source = 'First claim here. Second claim here. Third claim here.\n';
    const paper: Paper = {
      source,
      sentences: [],
      citations: [],
      bibliography: [],
    };

    const mk = (quotedText: string) => ({
      quotedText,
      claimType: 'Background' as const,
      confidence: 'high' as const,
      citationKeys: [],
    });
    const mockResult: LanguageModelV3GenerateResult = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            claims: [
              mk('First claim here'),
              mk('Second claim here'),
              mk('Third claim here'),
            ],
          }),
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    };
    const mockModel = new MockLanguageModelV3({ doGenerate: mockResult });

    const extractor = createOllamaClaimExtractor({ model: mockModel });
    const claims = await extractor(paper);

    expect(claims.map((c) => c.quotedText)).toEqual([
      'First claim here',
      'Second claim here',
      'Third claim here',
    ]);
  });

  it('falls back to the overlapping Sentence span when quotedText is paraphrased', async () => {
    const source =
      'The software model defines a hierarchical organization of user programs.\n';
    const sentence = sentenceOf(
      source,
      'The software model defines a hierarchical organization of user programs.',
    );
    const paper: Paper = {
      source,
      sentences: [sentence],
      citations: [],
      bibliography: [],
    };

    // British spelling — the LLM paraphrased, so indexOf() misses.
    const mockModel = new MockLanguageModelV3({
      doGenerate: mockClaimsResult([
        {
          quotedText:
            'The software model defines a hierarchical organisation of user programmes',
          claimType: 'Background',
          confidence: 'high',
          citationKeys: [],
        },
      ]),
    });

    const extractor = createOllamaClaimExtractor({ model: mockModel });
    const claims = await extractor(paper);

    expect(claims).toHaveLength(1);
    expect(claims[0]!.spans).toHaveLength(1);
    expect(claims[0]!.spans[0]).toEqual(sentence.span);
  });

  it('emits empty spans and warns when quotedText matches no Sentence', async () => {
    const source =
      'The software model defines a hierarchical organization of user programs.\n';
    const paper: Paper = {
      source,
      sentences: [
        sentenceOf(
          source,
          'The software model defines a hierarchical organization of user programs.',
        ),
      ],
      citations: [],
      bibliography: [],
    };

    const orphanText = 'Wholly unrelated invented gibberish xyzzy plugh';
    const mockModel = new MockLanguageModelV3({
      doGenerate: mockClaimsResult([
        {
          quotedText: orphanText,
          claimType: 'Background',
          confidence: 'high',
          citationKeys: [],
        },
      ]),
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const extractor = createOllamaClaimExtractor({ model: mockModel });
      const claims = await extractor(paper);

      expect(claims).toHaveLength(1);
      expect(claims[0]!.spans).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(orphanText));
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to generic Ollama guidance when the model inventory is also unreachable', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: () => Promise.reject(new Error('connect ECONNREFUSED')),
    });

    const extractor = createOllamaClaimExtractor({
      model: mockModel,
      fetch: () => Promise.reject(new Error('connect ECONNREFUSED')),
    });
    const paper: Paper = {
      source: 'A claim.',
      sentences: [],
      citations: [],
      bibliography: [],
    };

    const err = (await extractor(paper).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/Ollama Claim Extractor failed/);
    expect(err.message).toMatch(/http:\/\/localhost:11434\/v1/);
    expect(err.message).toMatch(/ollama pull llama3\.1:8b/);
  });

  it('lists the models the Ollama at the base URL actually has pulled when the LLM call fails', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: () => Promise.reject(new Error('No object generated')),
    });

    const tagsFetch: typeof fetch = (input) => {
      expect(input).toBe('http://localhost:11434/api/tags');
      return Promise.resolve(
        Response.json({
          models: [{ name: 'llama3.1:8b' }, { name: 'mistral:latest' }],
        }),
      );
    };

    const extractor = createOllamaClaimExtractor({
      model: mockModel,
      fetch: tagsFetch,
    });
    const paper: Paper = {
      source: 'A claim.',
      sentences: [],
      citations: [],
      bibliography: [],
    };

    await expect(extractor(paper)).rejects.toThrow(
      /llama3\.1:8b.*mistral:latest/s,
    );
  });

  it('flags a missing configured model and the port-hijack possibility when the model is not in the pulled list', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: () => Promise.reject(new Error('No object generated')),
    });

    const tagsFetch: typeof fetch = () =>
      Promise.resolve(Response.json({ models: [{ name: 'mistral:latest' }] }));

    const extractor = createOllamaClaimExtractor({
      model: mockModel,
      modelName: 'llama3.1:8b',
      fetch: tagsFetch,
    });
    const paper: Paper = {
      source: 'A claim.',
      sentences: [],
      citations: [],
      bibliography: [],
    };

    const err = (await extractor(paper).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/ollama pull llama3\.1:8b/);
    expect(err.message).toMatch(/127\.0\.0\.1:11434/);
  });

  it('does not advise pulling the model when it is already in the pulled list', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: () => Promise.reject(new Error('No object generated')),
    });

    const tagsFetch: typeof fetch = () =>
      Promise.resolve(Response.json({ models: [{ name: 'llama3.1:8b' }] }));

    const extractor = createOllamaClaimExtractor({
      model: mockModel,
      modelName: 'llama3.1:8b',
      fetch: tagsFetch,
    });
    const paper: Paper = {
      source: 'A claim.',
      sentences: [],
      citations: [],
      bibliography: [],
    };

    const err = (await extractor(paper).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/llama3\.1:8b/);
    expect(err.message).not.toMatch(/ollama pull/);
  });
});
