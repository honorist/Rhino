import { useRef, useState } from 'react';
import { Input } from '../../components/ui/controls';

/** Item devolvido pelo Nominatim. */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/** Endereço escolhido — texto + coordenadas. */
export interface EnderecoSelecionado {
  endereco: string;
  lat: string;
  lng: string;
}

interface AddressAutocompleteProps {
  value: string;
  /** Edição manual do texto (sem coordenadas). */
  onChange: (endereco: string) => void;
  /** Seleção de um resultado da busca (com coordenadas). */
  onSelect: (sel: EnderecoSelecionado) => void;
}

const MIN_CHARS = 4;
const DEBOUNCE_MS = 350;

/**
 * Campo de endereço com autocomplete via Nominatim (OpenStreetMap).
 * Porte do `_initEnderecoSearch` de Frota.js.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
}: AddressAutocompleteProps) {
  const [resultados, setResultados] = useState<NominatimResult[]>([]);
  const [aberto, setAberto] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buscar(termo: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (termo.trim().length < MIN_CHARS) {
      setResultados([]);
      setAberto(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          termo,
        )}&limit=5&accept-language=pt-BR`;
        const res = await fetch(url);
        const arr = (await res.json()) as NominatimResult[];
        setResultados(arr);
        setAberto(arr.length > 0);
      } catch {
        setResultados([]);
        setAberto(false);
      }
    }, DEBOUNCE_MS);
  }

  function escolher(r: NominatimResult) {
    onSelect({ endereco: r.display_name, lat: r.lat, lng: r.lon });
    setAberto(false);
    setResultados([]);
  }

  return (
    <div style={{ position: 'relative' }}>
      <Input
        value={value}
        autoComplete="off"
        placeholder="Buscar endereço..."
        onChange={(e) => {
          onChange(e.target.value);
          buscar(e.target.value);
        }}
        onBlur={() => {
          // Atraso para o onMouseDown do item registrar antes do fechamento.
          setTimeout(() => setAberto(false), 150);
        }}
        style={{ paddingRight: 36 }}
      />
      <span
        style={{
          position: 'absolute',
          right: 10,
          top: 19,
          transform: 'translateY(-50%)',
          fontSize: 16,
          pointerEvents: 'none',
        }}
      >
        📍
      </span>
      {aberto && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {resultados.map((r) => (
            <div
              key={`${r.lat},${r.lon}`}
              onMouseDown={() => escolher(r)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 13,
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              {r.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
