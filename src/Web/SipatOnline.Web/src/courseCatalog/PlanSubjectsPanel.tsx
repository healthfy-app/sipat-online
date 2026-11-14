import { useEffect, useState } from 'react';
import { getPlanSubjects, setPlanSubjects, type CompanyPlan, type PlanSubjects } from '@/api';
import PlanSelect, { planInfo, planOptions } from '@/companies/PlanSelect';
import { Badge } from '@/components/ui/badge';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { useCourseCategories } from './useCourseCategories';
import { cn } from '@/lib/utils';

/**
 * Which assuntos each plan can use. Every assunto starts available to every plan; the operator takes one out of a plan
 * here, and the companies of that plan stop seeing it when they build a SIPAT.
 */
export default function PlanSubjectsPanel() {
  const { categories } = useCourseCategories();
  const [data, setData] = useState<PlanSubjects | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [plan, setPlan] = useState<CompanyPlan>('Bronze');

  useEffect(() => {
    let current = true;
    getPlanSubjects().then(result => { if (current) setData(result); }).catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, []);

  async function save(target: CompanyPlan, excluded: string[]) {
    if (!data) return;
    const before = data;
    setData({ ...data, excluded: { ...data.excluded, [target]: excluded } });
    setBusy(target); setError('');
    try {
      await setPlanSubjects(target, excluded);
    } catch (failure) {
      setData(before);
      setError(getErrorMessage(failure));
    } finally { setBusy(''); }
  }

  if (!data) return error
    ? <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>
    : <p className="m-0 text-sm text-muted-foreground" role="status">Carregando os planos...</p>;

  const excludedOf = (target: CompanyPlan) => new Set(data.excluded[target] ?? []);
  const toggle = (target: CompanyPlan, courseId: string) => {
    const set = excludedOf(target);
    if (!set.delete(courseId)) set.add(courseId);
    void save(target, [...set]);
  };
  const offered = (target: CompanyPlan) => data.courses.length - excludedOf(target).size;

  return <section aria-label="Assuntos por plano" className="grid min-w-0 gap-4">
    <p className="m-0 text-sm text-muted-foreground">
      Marque os assuntos que cada plano pode usar na grade da SIPAT. Todos começam liberados; ao desmarcar, as empresas daquele plano deixam de ver o assunto.
    </p>
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {/* on a narrow screen one plan at a time */}
    <div className="md:hidden"><PlanSelect label="Plano" onChange={setPlan} value={plan} /></div>

    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
      <table aria-label="Assuntos liberados em cada plano" className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="px-4 py-3 text-xs font-bold tracking-wider text-muted-foreground uppercase" scope="col">Assunto</th>
            {planOptions.map(option => {
              const Icon = option.icon;
              return <th className={cn('px-3 py-3 text-center', option.id !== plan && 'max-md:hidden')} key={option.id} scope="col">
                <span className="inline-flex flex-col items-center gap-1">
                  <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg" style={{ backgroundColor: option.tint, color: option.ink }}><Icon className="size-4" /></span>
                  <strong className="text-xs">{option.label}</strong>
                  <span className="text-[0.6875rem] font-normal text-muted-foreground">{offered(option.id)} de {data.courses.length}</span>
                </span>
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {data.courses.map(course => {
            const categoryName = course.categoryId ? categories.find((item) => item.id === course.categoryId)?.name : undefined;
            return <tr className="border-b border-border last:border-0" key={course.id}>
              <th className="px-4 py-2.5 text-left font-medium" scope="row">
                <span className="grid gap-0.5">
                  <span>{course.title}</span>
                  <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    {categoryName && <Badge variant="neutral">{categoryName}</Badge>}{pluralize(course.videoCount, 'vídeo', 'vídeos')}
                  </span>
                </span>
              </th>
              {planOptions.map(entry => <td className={cn('px-3 py-2.5 text-center', entry.id !== plan && 'max-md:hidden')} key={entry.id}>
                <input aria-label={`${course.title} no plano ${planInfo(entry.id).label}`} checked={!excludedOf(entry.id).has(course.id)} className="size-5 cursor-pointer accent-[var(--brand-primary)]"
                  disabled={busy === entry.id} onChange={() => toggle(entry.id, course.id)} type="checkbox" />
              </td>)}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}
