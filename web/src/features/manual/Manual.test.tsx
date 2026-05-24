import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Manual from './Manual';

describe('Manual (view migrada)', () => {
  it('mostra a seção Início por padrão', () => {
    render(<Manual />);
    expect(screen.getByText('Bem-vindo ao Rhino')).toBeInTheDocument();
  });

  it('alterna a seção ao clicar no menu lateral', () => {
    render(<Manual />);
    fireEvent.click(screen.getByText('Glossário'));
    expect(screen.getByText('📚 Glossário')).toBeInTheDocument();
    expect(screen.getByText('Boletim de Medição — NF gerada pelas saídas')).toBeInTheDocument();
  });
});
