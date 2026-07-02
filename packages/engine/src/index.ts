import type { Claim, ClaimExtractor } from './extractor';
import { loadPaper } from './paper';
import { resolveBibEntry, type OpenAlexClient } from './resolver';

export * from './resolver';
export * from './bibtex';
export * from './openalex';
export * from './paper';
export * from './extractor';

export type FindingType =
  | 'UnresolvedCitation'
  | 'FabricatedSource'
  | 'UnverifiableSource'
  | 'UncitedClaim'
  | 'NoCitationsDetected';

export interface AuditOptions {
  openAlexClient?: OpenAlexClient;
  claimExtractor?: ClaimExtractor;
}

export interface Finding {
  type: FindingType;
  location: { line: number; column: number };
  subject: string;
  detail: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AuditResult {
  findings: Finding[];
}

export function findUncitedClaims(claims: Claim[]): Finding[] {
  const findings: Finding[] = [];
  for (const claim of claims) {
    if (claim.type === 'Background' && claim.citationKeys.length === 0) {
      const firstSpan = claim.spans[0];
      findings.push({
        type: 'UncitedClaim',
        location: firstSpan
          ? { line: firstSpan.start.line, column: firstSpan.start.column }
          : { line: 0, column: 0 },
        subject: claim.quotedText,
        detail: 'Background Claim with no attached Citation',
        confidence: claim.confidence,
      });
    }
  }
  return findings;
}

export function renderReport(findings: Finding[]): string {
  if (findings.length === 0) return '# Audit report\n\nNo Findings.\n';

  const byType = new Map<FindingType, Finding[]>();
  for (const f of findings) {
    const list = byType.get(f.type) ?? [];
    list.push(f);
    byType.set(f.type, list);
  }

  const sections: string[] = ['# Audit report'];
  for (const [type, group] of byType) {
    sections.push(`## ${type} (${String(group.length)})`);
    for (const f of group) {
      sections.push(
        `- \`${f.subject}\` (line ${String(f.location.line)}, column ${String(f.location.column)}) — ${f.detail} [confidence: ${f.confidence}]`,
      );
    }
  }

  return sections.join('\n\n') + '\n';
}

export async function audit(
  paperPath: string,
  bibPath: string,
  opts: AuditOptions = {},
): Promise<AuditResult> {
  const paper = await loadPaper(paperPath, bibPath);
  const bibByKey = new Map(paper.bibliography.map((e) => [e.citationKey, e]));

  const findings: Finding[] = [];

  if (paper.citations.length === 0 && paper.bibliography.length === 0) {
    findings.push({
      type: 'NoCitationsDetected',
      location: { line: 0, column: 0 },
      subject: paperPath,
      detail:
        'No Citations and no Bibliography were detected — the audit ran Claim-coverage only. Did you mean to supply a .bib file, or is the Paper using a citation syntax the tool does not parse?',
      confidence: 'high',
    });
  }

  for (const citation of paper.citations) {
    if (!bibByKey.has(citation.citationKey)) {
      findings.push({
        type: 'UnresolvedCitation',
        location: {
          line: citation.span.start.line,
          column: citation.span.start.column,
        },
        subject: `[@${citation.citationKey}]`,
        detail: `Citation Key "${citation.citationKey}" not found in Bibliography`,
        confidence: 'high',
      });
    }
  }

  if (opts.claimExtractor) {
    const claims = await opts.claimExtractor(paper);
    findings.push(...findUncitedClaims(claims));
  }

  if (opts.openAlexClient) {
    for (const entry of paper.bibliography) {
      const resolution = await resolveBibEntry(entry, opts.openAlexClient);
      if (resolution.kind === 'fabricated-source') {
        findings.push({
          type: 'FabricatedSource',
          location: { line: 0, column: 0 },
          subject: `[@${entry.citationKey}]`,
          detail: resolution.detail,
          confidence: 'high',
        });
      } else if (resolution.kind === 'unverifiable-source') {
        findings.push({
          type: 'UnverifiableSource',
          location: { line: 0, column: 0 },
          subject: `[@${entry.citationKey}]`,
          detail: resolution.detail,
          confidence: 'medium',
        });
      }
    }
  }

  return { findings };
}
