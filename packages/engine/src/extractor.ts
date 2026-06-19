import type { Paper, TextSpan } from './paper';

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
