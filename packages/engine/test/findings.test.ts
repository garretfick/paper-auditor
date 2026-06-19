import { describe, it, expect } from 'vitest';
import { findUncitedClaims, type Claim } from '../src';

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    type: 'Background',
    confidence: 'low',
    spans: [
      {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 10, offset: 9 },
      },
    ],
    quotedText: 'A claim.',
    citationKeys: [],
    ...overrides,
  };
}

describe('findUncitedClaims', () => {
  it('emits one UncitedClaim Finding per Background Claim with no attached CitationKey', () => {
    const findings = findUncitedClaims([makeClaim()]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe('UncitedClaim');
  });

  it('emits no UncitedClaim for a Background Claim with at least one attached CitationKey', () => {
    const findings = findUncitedClaims([
      makeClaim({ citationKeys: ['wei2022'] }),
    ]);

    expect(findings).toHaveLength(0);
  });

  it('emits no UncitedClaim for Method, Result, Discussion, or Navigation Claims with no attached keys', () => {
    const claims: Claim[] = (
      ['Method', 'Result', 'Discussion', 'Navigation'] as const
    ).map((type) => makeClaim({ type }));

    const findings = findUncitedClaims(claims);

    expect(findings).toHaveLength(0);
  });

  it('emits one UncitedClaim per Background Claim when several appear in the input', () => {
    const findings = findUncitedClaims([
      makeClaim({ quotedText: 'First claim.' }),
      makeClaim({ quotedText: 'Second claim.' }),
      makeClaim({ quotedText: 'Third claim.' }),
    ]);

    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.type === 'UncitedClaim')).toBe(true);
  });

  it('carries the Claim Confidence into the Finding', () => {
    const findings = findUncitedClaims([
      makeClaim({ confidence: 'high', quotedText: 'A confident claim.' }),
    ]);

    expect(findings[0]!.confidence).toBe('high');
  });
});
