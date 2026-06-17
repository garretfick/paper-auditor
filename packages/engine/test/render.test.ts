import { describe, it, expect } from 'vitest';
import { renderReport, type Finding } from '../src';

describe('renderReport', () => {
  it('renders an UnresolvedCitation Finding with its subject visible', () => {
    const finding: Finding = {
      type: 'UnresolvedCitation',
      location: { line: 3, column: 22 },
      subject: '[@nonexistent]',
      detail: 'Citation Key "nonexistent" not found in Bibliography',
      confidence: 'high',
    };

    const output = renderReport([finding]);

    expect(output).toContain('[@nonexistent]');
  });

  it('renders a "no Findings" message when the findings array is empty', () => {
    const output = renderReport([]);

    expect(output).toContain('No Findings');
  });

  it('shows location and confidence for each of multiple Findings', () => {
    const findings: Finding[] = [
      {
        type: 'UnresolvedCitation',
        location: { line: 3, column: 22 },
        subject: '[@alpha]',
        detail: 'Citation Key "alpha" not found in Bibliography',
        confidence: 'high',
      },
      {
        type: 'UnresolvedCitation',
        location: { line: 5, column: 10 },
        subject: '[@beta]',
        detail: 'Citation Key "beta" not found in Bibliography',
        confidence: 'medium',
      },
    ];

    const output = renderReport(findings);

    expect(output).toContain('[@alpha]');
    expect(output).toContain('[@beta]');
    expect(output).toContain('line 3');
    expect(output).toContain('line 5');
    expect(output).toContain('high');
    expect(output).toContain('medium');
  });
});
