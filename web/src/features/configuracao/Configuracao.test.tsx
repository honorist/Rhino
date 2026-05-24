import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Configuracao from './Configuracao';

describe('Configuracao (view migrada)', () => {
  it('mostra a seção Tipos de Custo por padrão', () => {
    render(
      <MemoryRouter>
        <Configuracao />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /Tipos de Custo/ }),
    ).toBeInTheDocument();
  });

  it('alterna a seção ao clicar no menu', () => {
    render(
      <MemoryRouter>
        <Configuracao />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Templates de Docs'));
    expect(
      screen.getByRole('heading', { name: /Templates de Docs/ }),
    ).toBeInTheDocument();
  });
});
