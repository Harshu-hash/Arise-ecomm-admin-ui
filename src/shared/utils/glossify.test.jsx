import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { glossify } from './glossify';

describe('glossify', () => {
  it('passes plain text through unchanged when nothing matches', () => {
    expect(glossify('Order funnel')).toBe('Order funnel');
  });

  it('passes through non-string children untouched', () => {
    expect(glossify(42)).toBe(42);
    expect(glossify(null)).toBe(null);
  });

  it('wraps a recognised abbreviation in a tooltip-bearing span', () => {
    render(<div>{glossify('GMV')}</div>);
    const span = screen.getByText('GMV');
    expect(span.tagName).toBe('SPAN');
  });

  it('does not match an abbreviation that is only a substring of a longer word', () => {
    render(<div>{glossify('GSTIN pending')}</div>);
    // GSTIN itself is a real glossary entry, so it must still get wrapped —
    // but as GSTIN whole, not a stray GST matched out of its middle.
    expect(screen.getByText('GSTIN').tagName).toBe('SPAN');
  });

  it('prefers the longest match — GSTR-8 over GSTR over GST', () => {
    render(<div>{glossify('Filed in GSTR-8 this month')}</div>);
    expect(screen.getByText('GSTR-8').tagName).toBe('SPAN');
    expect(screen.queryByText('GST')).not.toBeInTheDocument();
    expect(screen.queryByText('GSTR')).not.toBeInTheDocument();
  });

  it('leaves an abbreviation-shaped substring inside another word alone', () => {
    // "MANUAL_CPC" should not get a stray "CPC" match pulled out of it.
    const { container } = render(<div>{glossify('MANUAL_CPC')}</div>);
    expect(container.textContent).toBe('MANUAL_CPC');
    expect(container.querySelector('span')).toBeNull();
  });
});
