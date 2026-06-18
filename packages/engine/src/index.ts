import { readFile } from 'node:fs/promises';
import { parseBibliography } from './bibtex';
import { resolveBibEntry, type OpenAlexClient } from './resolver';

export * from './resolver';
export * from './bibtex';
export * from './openalex';

export type FindingType = 'UnresolvedCitation' | 'FabricatedSource';

export interface AuditOptions {
  openAlexClient?: OpenAlexClient;
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
  const [paperText, bibText] = await Promise.all([
    readFile(paperPath, 'utf8').catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read Paper at ${paperPath}: ${detail}`);
    }),
    readFile(bibPath, 'utf8').catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read Bibliography at ${bibPath}: ${detail}`);
    }),
  ]);

  const citationKeys: string[] = [];
  for (const bracket of paperText.matchAll(/\[([^\]]+)\]/g)) {
    const inside = bracket[1];
    if (!inside) continue;
    for (const keyMatch of inside.matchAll(/@(\w+)/g)) {
      const key = keyMatch[1];
      if (key) citationKeys.push(key);
    }
  }

  const entries = parseBibliography(bibText);
  if (bibText.trim().length > 0 && entries.length === 0) {
    throw new Error(
      `Malformed BibTeX in ${bibPath}: file has content but no entries were found`,
    );
  }
  const bibByKey = new Map(entries.map((e) => [e.citationKey, e]));

  const findings: Finding[] = [];
  for (const key of citationKeys) {
    if (!bibByKey.has(key)) {
      findings.push({
        type: 'UnresolvedCitation',
        location: { line: 0, column: 0 },
        subject: `[@${key}]`,
        detail: `Citation Key "${key}" not found in Bibliography`,
        confidence: 'high',
      });
    }
  }

  if (opts.openAlexClient) {
    for (const entry of entries) {
      const resolution = await resolveBibEntry(entry, opts.openAlexClient);
      if (resolution.kind === 'fabricated-source') {
        findings.push({
          type: 'FabricatedSource',
          location: { line: 0, column: 0 },
          subject: `[@${entry.citationKey}]`,
          detail: resolution.detail,
          confidence: 'high',
        });
      }
    }
  }

  return { findings };
}
