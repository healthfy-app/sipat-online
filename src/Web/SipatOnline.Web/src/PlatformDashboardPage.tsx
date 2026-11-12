import { ArrowRight, Building2, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from '@/api';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Stat } from '@/components/ui/page';

export default function PlatformDashboardPage() {
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setCompanies(await getPlatformDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unavailable = isLoading || Boolean(error);
  const show = (value: number) => (unavailable ? '—' : value.toLocaleString('pt-BR'));
  const activeCompanies = companies.filter((company) => company.isActive).length;
  const totalEmployees = companies.reduce((sum, company) => sum + company.employeeCount, 0);

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          actions={<Button onClick={() => void load()} variant="outline">Atualizar</Button>}
          description="Acompanhe os números da plataforma e vá direto para o que precisa fazer."
          title="Visão geral"
        />

        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

        <section aria-label="Indicadores da plataforma" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
          <Stat hint={unavailable ? undefined : `${show(activeCompanies)} ativas`} label="Empresas cadastradas" value={show(companies.length)} />
          <Stat label="Participantes" value={show(totalEmployees)} />
        </section>

        {error && <p className="m-0 text-sm text-muted-foreground">Não foi possível verificar os dados. Atualize o painel para tentar novamente.</p>}
        {!unavailable && companies.length === 0 && (
          <section className="grid justify-items-start gap-3 rounded-lg bg-card p-6 shadow-card">
            <h2 className="m-0 text-lg font-semibold">Nenhuma empresa cadastrada</h2>
            <p className="m-0 text-sm text-muted-foreground">Cadastre o primeiro cliente para começar a operação da plataforma.</p>
            <Button asChild><Link to="/platform?nova-empresa=1"><Plus /> Cadastrar empresa</Link></Button>
          </section>
        )}

        <section aria-labelledby="platform-dashboard-shortcuts" className="grid gap-3">
          <h2 className="m-0 text-base font-semibold" id="platform-dashboard-shortcuts">Acessos rápidos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Shortcut description="Buscar, filtrar e administrar clientes" icon={<Building2 />} title="Gerenciar empresas" to="/platform" />
            <Shortcut description="Criar um novo espaço de cliente" icon={<Plus />} title="Cadastrar empresa" to="/platform?nova-empresa=1" />
          </div>
        </section>
      </Page>
    </div>
  );
}

function Shortcut({ title, description, icon, to }: { title: string; description: string; icon: React.ReactNode; to: string }) {
  return (
    <Link
      aria-label={`${title} ${description}`}
      className="group flex items-center gap-4 rounded-lg bg-card p-4 text-foreground no-underline shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:hover:translate-y-0"
      to={to}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">{icon}</span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <strong className="text-sm font-semibold">{title}</strong>
        <small className="text-[0.8125rem] text-muted-foreground">{description}</small>
      </span>
      <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
