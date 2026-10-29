import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchBox } from '../src/components/SearchBox';

describe('SearchBox', () => {
  it('no navega mientras se escribe, solo al enviar', () => {
    render(<SearchBox />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'gatos' } });
    expect(window.location.pathname).toBe('/');
    fireEvent.submit(input.closest('form')!);
    expect(window.location.pathname).toBe('/buscar');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('gatos');
  });

  it('abre directamente un enlace de YouTube sin buscar', () => {
    render(<SearchBox />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ?t=30' } });
    fireEvent.submit(input.closest('form')!);
    expect(window.location.pathname).toBe('/ver/dQw4w9WgXcQ');
    expect(new URLSearchParams(window.location.search).get('t')).toBe('30');
  });
});
