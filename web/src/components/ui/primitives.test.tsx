import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Button from './Button';
import { Badge } from './badge';
import EmptyState from './EmptyState';
import Spinner from './Spinner';
import DataTable, { type Column } from './DataTable';

describe('Button', () => {
  it('renderiza com variante danger', () => {
    render(<Button variant="danger">Excluir</Button>);
    const btn = screen.getByRole('button', { name: 'Excluir' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-destructive');
  });

  it('usa type="button" por padrão', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('dispara onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ok</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Badge', () => {
  it('renderiza com data-slot badge', () => {
    render(<Badge variant="success">Ativo</Badge>);
    expect(screen.getByText('Ativo')).toHaveAttribute('data-slot', 'badge');
  });

  it('usa variante secondary por padrão', () => {
    const { container } = render(<Badge>Neutro</Badge>);
    expect(container.firstChild).toHaveAttribute('data-slot', 'badge');
  });
});

describe('EmptyState', () => {
  it('exibe a mensagem', () => {
    render(<EmptyState message="Nada por aqui" />);
    expect(screen.getByText('Nada por aqui')).toBeInTheDocument();
  });
});

describe('Spinner', () => {
  it('mostra o rótulo padrão', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...');
  });
});

describe('DataTable', () => {
  interface Row {
    id: string;
    nome: string;
  }
  const columns: Column<Row>[] = [{ header: 'Nome', cell: (row) => row.nome }];

  it('renderiza uma linha por registro', () => {
    render(
      <DataTable
        columns={columns}
        rows={[
          { id: '1', nome: 'Ana' },
          { id: '2', nome: 'Bia' },
        ]}
        rowKey={(row) => row.id}
      />,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bia')).toBeInTheDocument();
  });

  it('mostra a mensagem de vazio sem linhas', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        emptyMessage="Sem dados"
      />,
    );
    expect(screen.getByText('Sem dados')).toBeInTheDocument();
  });

  it('dispara onRowClick com a linha', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', nome: 'Ana' }]}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByText('Ana'));
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', nome: 'Ana' });
  });
});
