import { useEffect, useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/controls';
import { api } from '../../lib/api';

interface Mensagem {
  role: 'user' | 'assistant';
  content: string;
}

const SUGESTOES = ['Qual meu saldo?', 'Contratos ativos', 'Contas vencidas'];

/** Assistente IA — chat sobre os dados (porte de js/views/AiChat.js). */
export default function AiChat() {
  const [history, setHistory] = useState<Mensagem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [history, loading]);

  async function enviar(msg: string) {
    const texto = msg.trim();
    if (!texto || loading) return;
    setInput('');
    setHistory((h) => [...h, { role: 'user', content: texto }]);
    setLoading(true);
    try {
      const data = await api.post<{ reply?: string }>('/api/ai/chat', {
        message: texto,
      });
      setHistory((h) => [
        ...h,
        { role: 'assistant', content: data.reply || '…' },
      ]);
    } catch (e) {
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content:
            e instanceof Error ? e.message : 'Erro de conexão. Tente novamente.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">🤖 Assistente IA</h1>
          <p className="page-subtitle">
            Faça perguntas sobre contratos, caixa e contas em linguagem natural
          </p>
        </div>
      </div>

      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-md)',
        }}
      >
        <div
          ref={msgsRef}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 'var(--sp-md)',
            minHeight: 320,
            maxHeight: 520,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-sm)',
          }}
        >
          {history.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
                <div>
                  Olá! Posso responder perguntas sobre seus dados financeiros e
                  contratos.
                </div>
              </div>
            </div>
          ) : (
            history.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: isUser
                        ? '16px 16px 4px 16px'
                        : '16px 16px 16px 4px',
                      background: isUser
                        ? 'var(--color-primary)'
                        : 'var(--color-bg)',
                      color: isUser ? '#fff' : 'var(--color-text)',
                      fontSize: 15,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
          {loading && (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
              ⏳ Pensando…
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void enviar(input);
            }}
            placeholder="Ex: Qual é o saldo atual do caixa?"
            disabled={loading}
            style={{ flex: 1 }}
          />
          <Button onClick={() => void enviar(input)} disabled={loading}>
            {loading ? '⏳' : 'Enviar'}
          </Button>
        </div>

        <div
          style={{
            fontSize: 14,
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}
        >
          Sugestões:{' '}
          {SUGESTOES.map((s, i) => (
            <span key={s}>
              {i > 0 && ' · '}
              <a
                style={{ cursor: 'pointer', color: 'var(--color-primary)' }}
                onClick={() => void enviar(s)}
              >
                {s}
              </a>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
