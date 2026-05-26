import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '@/components/ui/input';

import { toast } from 'sonner';
import { queryKeys } from '../../lib/queryKeys';
import type { Rdo, RdoFoto } from './types';

interface RdoFotosModalProps {
  contractId: string;
  rdo: Rdo;
  onClose: () => void;
}

/** Modal de gestão de fotos de um RDO — upload e exclusão. */
export default function RdoFotosModal({
  contractId,
  rdo,
  onClose,
}: RdoFotosModalProps) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<RdoFoto[]>(rdo.fotos ?? []);
  const [legenda, setLegenda] = useState('');
  const [enviando, setEnviando] = useState(false);

  const base = `/api/contracts/${contractId}/rdos/${rdo.id}/fotos`;

  async function enviar(arquivos: FileList) {
    setEnviando(true);
    try {
      const fd = new FormData();
      for (const arq of Array.from(arquivos)) fd.append('foto', arq);
      fd.append('legenda', legenda);
      const res = await fetch(base, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { fotos?: RdoFoto[] };
      setFotos((prev) => [...prev, ...(data.fotos ?? [])]);
      setLegenda('');
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      toast.success('Fotos enviadas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no upload');
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function excluir(fotoId: string) {
    if (!window.confirm('Remover esta foto?')) return;
    try {
      const res = await fetch(`${base}/${fotoId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setFotos((prev) => prev.filter((f) => f.id !== fotoId));
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      toast.success('Foto removida');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover');
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Fotos — RDO #${rdo.numero ?? ''}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-sm)',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 'var(--sp-md)',
            }}
          >
            <Input
              placeholder="Legenda (opcional)"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void enviar(e.target.files);
                }
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={enviando}
            >
              {enviando ? 'Enviando…' : '📷 Adicionar Fotos'}
            </Button>
          </div>

          {fotos.length === 0 ? (
            <p
              className="text-muted"
              style={{ textAlign: 'center', padding: 'var(--sp-lg)' }}
            >
              Nenhuma foto ainda.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 'var(--sp-md)',
              }}
            >
              {fotos.map((f, i) => (
                <div
                  key={f.id ?? i}
                  style={{
                    position: 'relative',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  {f.url && (
                    <img
                      src={f.url}
                      alt={f.legenda || ''}
                      loading="lazy"
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  )}
                  {f.legenda && (
                    <div
                      style={{
                        padding: '4px 8px',
                        fontSize: 12,
                        background: 'var(--color-surface-2)',
                      }}
                    >
                      {f.legenda}
                    </div>
                  )}
                  {f.id && (
                    <button
                      type="button"
                      onClick={() => excluir(f.id as string)}
                      title="Remover foto"
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,.6)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
