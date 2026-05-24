import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TopProgressBar from './TopProgressBar';

function Wrap({ children, qc }: { children: React.ReactNode; qc: QueryClient }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TopProgressBar', () => {
  it('renderiza vazio (sem classes) quando não há fetch nem mutation', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <Wrap qc={qc}>
        <TopProgressBar />
      </Wrap>,
    );
    const bar = container.querySelector('#rh-progress');
    expect(bar?.className.trim()).toBe('');
  });

  it('ganha is-loading enquanto uma query está pendente', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolve!: (v: number) => void;
    const queryFn = () =>
      new Promise<number>((res) => {
        resolve = res;
      });

    function Inner() {
      useQuery({ queryKey: ['demo'], queryFn });
      return null;
    }

    const { container } = render(
      <Wrap qc={qc}>
        <TopProgressBar />
        <Inner />
      </Wrap>,
    );

    await waitFor(() => {
      const bar = container.querySelector('#rh-progress');
      expect(bar?.classList.contains('is-loading')).toBe(true);
    });

    resolve(42);

    await waitFor(() => {
      const bar = container.querySelector('#rh-progress');
      // Ao terminar, classe vira is-done por 600ms; aceitamos qualquer estado
      // diferente de is-loading.
      expect(bar?.classList.contains('is-loading')).toBe(false);
    });
  });

  it('mantém div com markup fixo (#rh-progress > .rh-progress__fill)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <Wrap qc={qc}>
        <TopProgressBar />
      </Wrap>,
    );
    expect(container.querySelector('#rh-progress .rh-progress__fill')).toBeTruthy();
    // silencia o linter sobre 'screen'
    expect(screen).toBeTruthy();
  });
});
