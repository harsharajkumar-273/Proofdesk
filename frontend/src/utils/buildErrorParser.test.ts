import { describe, expect, it } from 'vitest';
import { parseBuildErrors } from './buildErrorParser';

describe('buildErrorParser', () => {
  it('humanizes XML mismatch errors into professor-facing guidance', () => {
    const diagnostics = parseBuildErrors(
      '',
      'chapters/vectors.xml:42: Opening and ending tag mismatch: theorem line 38 and proof',
      ['chapters/vectors.xml']
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('XML tags do not close');
    expect(diagnostics[0].hint).toContain('matching name');
    expect(diagnostics[0].code).toBe('xml_tag_mismatch');
  });

  it('humanizes unsupported LaTeX commands', () => {
    const diagnostics = parseBuildErrors(
      '',
      'appendix/formulas.tex:18: Undefined control sequence.',
      ['appendix/formulas.tex']
    );

    expect(diagnostics[0].message).toContain('LaTeX contains a command');
    expect(diagnostics[0].code).toBe('latex_undefined_control_sequence');
  });
});
