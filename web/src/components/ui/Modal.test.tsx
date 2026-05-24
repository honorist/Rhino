import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Modal from './Modal';

const noop = () => {};

describe('Modal', () => {
  it('não renderiza nada quando open=false', () => {
    render(
      <Modal open={false} title="Título" onClose={noop}>
        conteúdo
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renderiza título e conteúdo quando aberto', () => {
    render(
      <Modal open title="Novo Cliente" onClose={noop}>
        corpo do modal
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Novo Cliente')).toBeInTheDocument();
    expect(screen.getByText('corpo do modal')).toBeInTheDocument();
  });

  it('fecha ao clicar no botão Fechar', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        x
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('fecha ao pressionar Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        x
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renderiza o rodapé quando fornecido', () => {
    render(
      <Modal open title="T" onClose={noop} footer={<span>rodapé</span>}>
        x
      </Modal>,
    );
    expect(screen.getByText('rodapé')).toBeInTheDocument();
  });
});
