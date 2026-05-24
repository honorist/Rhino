import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import AditivosTab from './AditivosTab';
import type { Contract } from './types';

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  aditivos: [
    {
      id: 'a1',
      numero: '1',
      tipo: 'valor',
      descricao: 'Acréscimo de escopo',
      valorDelta: 5_000,
      data: '2026-03-01',
      aprovado: true,
    },
  ],
};

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<AditivosTab contract={CONTRACT} />, { wrapper: Wrapper });
}

describe('AditivosTab (aba migrada)', () => {
  it('lista os aditivos do contrato', () => {
    renderTab();
    expect(screen.getByText('Acréscimo de escopo')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });

  it('abre o modal de novo aditivo', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Aditivo' }));
    expect(screen.getByText('Novo Aditivo')).toBeInTheDocument();
  });
});
