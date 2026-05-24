import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ToastProvider from './ToastProvider';
import { useToast } from './ToastContext';

function Trigger() {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show('Salvo com sucesso', 'success')}>
      disparar
    </button>
  );
}

describe('ToastProvider / useToast', () => {
  it('exibe um toast quando show() é chamado', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'disparar' }).click();
    });
    expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument();
  });

  it('useToast lança erro fora de um ToastProvider', () => {
    function Orphan() {
      useToast();
      return null;
    }
    // suprime o console.error esperado do React ao renderizar com throw
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
