import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { Input } from '../../components/ui/controls';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';

interface Cliente {
  id: string;
  nome: string;
  empresa?: string;
}
interface ContratoPortal {
  id: string;
  name: string;
  contractNumber?: string;
  status?: string;
  value?: number;
  startDate?: string;
  endDate?: string;
  progresso?: number;
  totalRdos?: number;
}
interface NfPortal {
  numero?: string;
  dataEmissao?: string;
  valor?: number;
  status?: string;
}
interface PropostaPortal {
  id: string;
  numero?: string;
  ano?: number;
  revisao?: number;
  titulo?: string;
  valorTotal?: number;
  valor_total?: number;
  dataEmissao?: string;
  data_emissao?: string;
  status?: string;
}
interface RdoPortal {
  contractName?: string;
  data?: string;
  clima?: string;
  atividades?: string;
  fotos?: { url?: string; legenda?: string }[];
}
interface PortalDashboard {
  cliente: Cliente;
  contratos: ContratoPortal[];
  nfs: NfPortal[];
  rdos?: RdoPortal[];
  propostas?: PropostaPortal[];
}

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Em andamento',
  concluido: 'Concluído',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
};
const STATUS_COR: Record<string, string> = {
  ativo: '#38A169',
  concluido: '#3182CE',
  pausado: '#D69E2E',
  cancelado: '#E53E3E',
};
const KEY_SESSION = 'rhino-portal-cliente';

function PortalLogin({ onSuccess }: { onSuccess: (c: Cliente) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const j = (await res.json()) as { cliente?: Cliente; error?: string };
      if (!res.ok || !j.cliente) throw new Error(j.error || 'Erro ao entrar');
      sessionStorage.setItem(KEY_SESSION, JSON.stringify(j.cliente));
      onSuccess(j.cliente);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao entrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-lg)',
        minHeight: '70vh',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-lg)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Área do Cliente
          </h1>
          <p
            className="text-muted"
            style={{ marginTop: 6, fontSize: 14 }}
          >
            Acompanhe seus contratos e obras
          </p>
        </div>
        <Card style={{ padding: 'var(--sp-xl)' }}>
          <form
            onSubmit={submit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}
          >
            <label>
              <div className="form-label">Email</div>
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              <div className="form-label">Senha</div>
              <Input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </label>
            {erro && (
              <div
                style={{
                  color: '#c33',
                  fontSize: 13,
                  padding: '8px 12px',
                  background: 'rgba(220,38,38,.08)',
                  borderRadius: 6,
                }}
              >
                {erro}
              </div>
            )}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function PortalDashboardView({
  data,
  onLogout,
}: {
  data: PortalDashboard;
  onLogout: () => void;
}) {
  const totalValor = data.contratos.reduce(
    (s, c) => s + (Number(c.value) || 0),
    0,
  );
  const nfsEmitidas = data.nfs.filter((n) => n.status === 'emitida').length;
  const contratosAtivos = data.contratos.filter((c) => c.status === 'ativo')
    .length;
  const totalRdos = (data.rdos ?? []).length;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-md)',
          padding: 'var(--sp-md) var(--sp-lg)',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          borderRadius: 8,
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Área do Cliente</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            {data.cliente.nome}
            {data.cliente.empresa ? ` · ${data.cliente.empresa}` : ''}
          </div>
        </div>
        <Button variant="secondary" onClick={onLogout}>
          Sair
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        {[
          { label: 'Contratos ativos', value: String(contratosAtivos) },
          { label: 'Valor total', value: formatBRL(totalValor) },
          { label: 'NFs emitidas', value: String(nfsEmitidas) },
          { label: 'Diários de obra', value: String(totalRdos) },
        ].map((k) => (
          <Card
            key={k.label}
            style={{ padding: 'var(--sp-lg)', textAlign: 'center' }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-primary)',
              }}
            >
              {k.value}
            </div>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {k.label}
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 0, marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            padding: 'var(--sp-lg)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            Meus Contratos
          </h2>
        </div>
        {data.contratos.length === 0 ? (
          <div
            className="text-muted"
            style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}
          >
            Nenhum contrato vinculado.
          </div>
        ) : (
          data.contratos.map((c) => {
            const prog = Math.max(0, Math.min(100, Number(c.progresso) || 0));
            const corProg =
              prog >= 90 ? '#E53E3E' : prog >= 70 ? '#D69E2E' : '#38A169';
            return (
              <div
                key={c.id}
                style={{
                  padding: 'var(--sp-lg)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 'var(--sp-md)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.contractNumber && (
                      <div className="text-muted" style={{ fontSize: 13 }}>
                        {c.contractNumber}
                      </div>
                    )}
                    <div className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
                      {formatDateBR(c.startDate)} → {formatDateBR(c.endDate)}
                      {(c.totalRdos ?? 0) > 0 &&
                        ` · ${c.totalRdos} RDO${c.totalRdos !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background: `${STATUS_COR[c.status ?? ''] ?? '#718096'}22`,
                        color: STATUS_COR[c.status ?? ''] ?? '#718096',
                      }}
                    >
                      {STATUS_LABEL[c.status ?? ''] ?? c.status}
                    </span>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>
                      {formatBRL(c.value ?? 0)}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 'var(--sp-md)' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      marginBottom: 4,
                    }}
                  >
                    <span>Execução financeira</span>
                    <span>{prog}%</span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: 'var(--color-surface-2)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${prog}%`,
                        background: corProg,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Card>

      {(data.propostas ?? []).length > 0 && (
        <Card style={{ padding: 0, marginBottom: 'var(--sp-lg)' }}>
          <div
            style={{
              padding: 'var(--sp-lg)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Minhas Propostas
            </h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Título</th>
                  <th>Valor</th>
                  <th>Emissão</th>
                  <th>Status</th>
                  <th>Baixar</th>
                </tr>
              </thead>
              <tbody>
                {(data.propostas ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>
                        PC_{p.numero ?? '—'}-
                        {String(p.ano ?? 0).padStart(2, '0')}
                        {(p.revisao ?? 0) > 0
                          ? ` Rev.${String(p.revisao).padStart(2, '0')}`
                          : ''}
                      </strong>
                    </td>
                    <td>{p.titulo ?? '—'}</td>
                    <td>{formatBRL(p.valorTotal ?? p.valor_total ?? 0)}</td>
                    <td>{formatDateBR(p.dataEmissao ?? p.data_emissao)}</td>
                    <td>{p.status ?? '—'}</td>
                    <td>
                      <a
                        className="action-link"
                        href={`/api/portal/propostas/${p.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        style={{ marginRight: 8 }}
                      >
                        PDF
                      </a>
                      <a
                        className="action-link"
                        href={`/api/portal/propostas/${p.id}/docx`}
                        target="_blank"
                        rel="noopener"
                      >
                        DOCX
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.nfs.length > 0 && (
        <Card style={{ padding: 0, marginBottom: 'var(--sp-lg)' }}>
          <div
            style={{
              padding: 'var(--sp-lg)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Notas Fiscais
            </h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.nfs.map((n, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{n.numero ?? '—'}</strong>
                    </td>
                    <td>{formatDateBR(n.dataEmissao)}</td>
                    <td>{formatBRL(n.valor ?? 0)}</td>
                    <td
                      style={{
                        color: n.status === 'emitida' ? '#38A169' : '#D69E2E',
                        fontWeight: 600,
                      }}
                    >
                      {n.status === 'emitida' ? 'Emitida' : 'Pendente'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/** Portal do Cliente — login + dashboard (porte de js/views/Portal.js). */
export default function Portal() {
  const [cliente, setCliente] = useState<Cliente | null>(() => {
    try {
      const raw = sessionStorage.getItem(KEY_SESSION);
      return raw ? (JSON.parse(raw) as Cliente) : null;
    } catch {
      return null;
    }
  });
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [resDash, resProp] = await Promise.all([
        fetch('/api/portal/dashboard'),
        fetch('/api/portal/propostas').catch(() => null),
      ]);
      if (resDash.status === 401) {
        sessionStorage.removeItem(KEY_SESSION);
        setCliente(null);
        return;
      }
      const dashboard = (await resDash.json()) as PortalDashboard;
      if (resProp && resProp.ok) {
        try {
          const j = (await resProp.json()) as { propostas?: PropostaPortal[] };
          dashboard.propostas = j.propostas ?? [];
        } catch {
          dashboard.propostas = [];
        }
      } else {
        dashboard.propostas = [];
      }
      setData(dashboard);
    } catch {
      setErro('Erro ao carregar dados. Recarregue a página.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (cliente) void carregar();
    else setData(null);
  }, [cliente, carregar]);

  async function handleLogout() {
    try {
      await fetch('/api/portal/logout', { method: 'POST' });
    } catch {
      /* ignora — limpa sessão local mesmo assim */
    }
    sessionStorage.removeItem(KEY_SESSION);
    setCliente(null);
    setData(null);
  }

  if (!cliente) return <PortalLogin onSuccess={setCliente} />;
  if (carregando || !data) return <Spinner label="Carregando…" />;
  if (erro) return <div className="error-banner">{erro}</div>;
  return <PortalDashboardView data={data} onLogout={handleLogout} />;
}
