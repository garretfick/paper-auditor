import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createOllamaClaimExtractor, type Paper } from '../src';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const goldenDir = path.join(here, 'fixtures', 'extractor-golden');

interface ExpectedGolden {
  description: string;
  minClaims: number;
  maxClaims: number;
  mustHaveCitationKey?: string;
  mustHaveClaimType?: string;
}

const fixtureNames = readdirSync(goldenDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Golden-set evaluation. Per the PRD, this is a regression suite for prompt
// tuning, not a CI gate — failures here mean "the prompt needs work," not
// "block the merge." Gated on RUN_LIVE_OLLAMA=1; respects OLLAMA_MODEL.
describe('Claim Extractor golden set', () => {
  for (const name of fixtureNames) {
    it.skipIf(process.env.RUN_LIVE_OLLAMA !== '1')(
      name,
      async () => {
        const source = readFileSync(
          path.join(goldenDir, name, 'input.md'),
          'utf8',
        );
        const expected = JSON.parse(
          readFileSync(path.join(goldenDir, name, 'expected.json'), 'utf8'),
        ) as ExpectedGolden;

        const extractor = createOllamaClaimExtractor({
          ...(process.env.OLLAMA_MODEL
            ? { modelName: process.env.OLLAMA_MODEL }
            : {}),
        });
        const paper: Paper = {
          source,
          sentences: [],
          citations: [],
          bibliography: [],
        };

        const claims = await extractor(paper);

        expect(claims.length).toBeGreaterThanOrEqual(expected.minClaims);
        expect(claims.length).toBeLessThanOrEqual(expected.maxClaims);
        if (expected.mustHaveCitationKey) {
          const allCitationKeys = claims.flatMap((c) => c.citationKeys);
          expect(allCitationKeys).toContain(expected.mustHaveCitationKey);
        }
        if (expected.mustHaveClaimType) {
          expect(
            claims.some((c) => c.type === expected.mustHaveClaimType),
          ).toBe(true);
        }
      },
      60_000,
    );
  }
});
