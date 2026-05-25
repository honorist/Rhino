import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RdoTab from './RdoTab';
import type { Contract } from './types';

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'concluido',
  rdos: [
    {
      id: 'r1',
      numero: 7,
      data: '2026-05-19',
      diaSemana: 'Terça',
      moi: [{ qtd: 2 }],
      mod: [{ qtd: 8 }],
      seguranca: { acidente: 'nao_houve' },
    },
  ],
};

function renderTab(contract: Contract = CONTRACT) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  }
  return render(<RdoTab contract={contract} />, { wrapper: Wrapper });
}

describe('RdoTab (aba migrada)', () => {
  it('lista os RDOs do contrato', () => {
    renderTab();
    expect(screen.getByText('#7')).toBeInTheDocument();
    // MO total = 2 (MOI) + 8 (MOD) = 10.
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('abre o modal de detalhe ao clicar numa linha', () => {
    renderTab();
    fireEvent.click(screen.getByText('#7'));
    expect(
      screen.getByText(/RDO #7/),
    ).toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há RDOs', () => {
    renderTab({ ...CONTRACT, rdos: [] });
    expect(screen.getByText('Nenhum RDO registrado.')).toBeInTheDocument();
  });

  it('abre o formulário ao clicar em "+ Novo RDO"', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: '+ Novo RDO' }));
    expect(screen.getByText('Novo RDO')).toBeInTheDocument();
    expect(screen.getByText('Cabeçalho')).toBeInTheDocument();
  });
});
