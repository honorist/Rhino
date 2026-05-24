import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AiChat from './AiChat';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiChat (view migrada)', () => {
  it('mostra o estado inicial vazio', () => {
    render(<AiChat />);
    expect(screen.getByText('🤖 Assistente IA')).toBeInTheDocument();
    expect(
      screen.getByText(/Posso responder perguntas/),
    ).toBeInTheDocument();
  });

  it('envia uma pergunta e exibe a resposta da IA', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ reply: 'Seu saldo é R$ 1.000,00' })),
    );
    render(<AiChat />);
    fireEvent.change(
      screen.getByPlaceholderText(/Qual é o saldo atual/),
      { target: { value: 'Qual meu saldo?' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(
      await screen.findByText('Seu saldo é R$ 1.000,00'),
    ).toBeInTheDocument();
  });
});
