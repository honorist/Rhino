import type { RouteDef } from '../routes/config';
import PageHeader from '../components/layout/PageHeader';

interface PlaceholderProps {
  route: RouteDef;
}

/**
 * Página temporária para rotas ainda não migradas.
 * Cada uma é substituída pela view real na Fase 3.
 */
export default function Placeholder({ route }: PlaceholderProps) {
  return (
    <>
      <PageHeader title={route.title} subtitle="Tela ainda não migrada para React" />
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <p className="text-muted" style={{ margin: 0 }}>
          A view <strong>{route.title}</strong> (<code>{route.path}</code>) será
          implementada na Fase 3 da migração para React.
        </p>
      </div>
    </>
  );
}
