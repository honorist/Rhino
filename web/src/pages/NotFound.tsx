import { Link } from 'react-router-dom';
import Button from '../components/ui/button';
import Card from '../components/ui/card';
import PageHeader from '../components/layout/PageHeader';

/** Rota coringa (404). */
export default function NotFound() {
  return (
    <>
      <PageHeader title="Página não encontrada" subtitle="Erro 404" />
      <Card style={{ padding: 32, textAlign: 'center' }}>
        <p className="text-muted">A rota acessada não existe.</p>
        <Button asChild>
          <Link to="/dashboard">Ir para o Dashboard</Link>
        </Button>
      </Card>
    </>
  );
}
