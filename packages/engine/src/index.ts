import type { Claim, ClaimExtractor } from './extractor';
import type { CitationFilter } from './filter';
import { loadPaper } from './paper';
import {
  matchAuthorYear,
  resolveBibEntry,
  type OpenAlexClient,
} from './resolver';

export * from './resolver';
export * from './bibtex';
export * from './openalex';
export * from './paper';
export * from './extractor';
export * from './filter';

export type FindingType =
  | 'UnresolvedCitation'
  | 'FabricatedSource'
  | 'UnverifiableSource'
  | 'UncitedClaim';

export interface AuditOptions {
  openAlexClient?: OpenAlexClient;
  claimExtractor?: ClaimExtractor;
  citationFilter?: CitationFilter;
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

  // High-recall candidates are narrowed by the optional LLM Citation Filter,
  // then resolved: Pandoc Citations by Citation Key, author-year Citations by
  // first-author surname + year. See ADR-0007.
  const citations = opts.citationFilter
    ? await opts.citationFilter(paper, paper.citations)
    : paper.citations;

  for (const citation of citations) {
    const location = {
      line: citation.span.start.line,
      column: citation.span.start.column,
    };
    if (citation.syntax === 'author-year') {
      const surname = citation.surname ?? '';
      const year = citation.year ?? '';
      if (!matchAuthorYear(surname, year, paper.bibliography)) {
        findings.push({
          type: 'UnresolvedCitation',
          location,
          subject: citation.rawText ?? `(${surname} ${year})`,
          detail: `Author-year Citation "${citation.rawText ?? `${surname} ${year}`}" has no matching Bibliography entry (no Source with first author "${surname}" and year ${year})`,
          confidence: 'high',
        });
      }
    } else if (!bibByKey.has(citation.citationKey)) {
      findings.push({
        type: 'UnresolvedCitation',
        location,
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
