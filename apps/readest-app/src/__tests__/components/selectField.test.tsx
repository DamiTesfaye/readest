import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SelectField from '@/components/themefonts/SelectField';

afterEach(cleanup);

describe('SelectField label', () => {
  it('renders the label with the popover field label font', () => {
    render(<SelectField label='Letter Spacing' value={0} min={-2} max={10} onChange={vi.fn()} />);
    expect(screen.getByText('Letter Spacing').className).toContain('popover-field-label');
  });
});

describe('popover-field-label style', () => {
  it('uses Avenir Next LT Pro at the field label size', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const rule = css.match(/\.popover-field-label\s*\{[^}]*\}/)?.[0];
    expect(rule).toBeTruthy();
    expect(rule).toContain("'Avenir Next LT Pro'");
    expect(rule).toContain('0.6875rem');
  });
});
