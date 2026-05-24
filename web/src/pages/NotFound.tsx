import { Link } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';

/** Rota coringa (404). */
export default function NotFound() {
  return (
    <>
      <PageHeader title="Página não encontrada" subtitle="Erro 404" />
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <p className="text-muted">A rota acessada não existe.</p>
        <Link to="/dashboard" className="btn btn-primary">
          Ir para o Dashboard
        </Link>
      </div>
    </>
  );
}
