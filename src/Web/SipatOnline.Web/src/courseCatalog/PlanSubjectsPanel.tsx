import { Check, ChevronDown, Minus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPlanSubjects, listPlatformCompanies, setPlanSubjects, setSubjectCompany, type CompanyPlan, type PlanSubjects, type PlatformCompany } from '@/api';
import { planOptions } from '@/companies/PlanSelect';
import { Input } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { useCourseCategories } from './useCourseCategories';
import { cn } from '@/lib/utils';

/** Plan columns on a wide screen: the assunto takes what is left, and the whole grid stays narrow enough to read across. */
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1fr)_repeat(4,6rem)] md:items-center';

type Course = PlanSubjects['courses'][number];

/**
 * Which assuntos each plan can use. Every assunto starts available to every plan; the operator takes one out of a plan
 * here, and the companies of that plan stop seeing it when they build a SIPAT.
 */
export default function PlanSubjectsPanel() {
  const { categories } = useCourseCategories();
  const [data, setData] = useState<PlanSubjects | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  /** Categories the operator folded away; a search opens every one so no match stays hidden. */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let current = true;
    getPlanSubjects().then(result => { if (current) setData(result); }).catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    // the companies are only needed to give an assunto to one of them; without them the panel still works
    listPlatformCompanies().then(result => { if (current) setCompanies(result ?? []); }).catch(() => undefined);
    return () => { current = false; };
  }, []);

  /** The assuntos that match the search, grouped by category (the ones without a category last). */
  const groups = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    const courses = (data?.courses ?? []).filter(course => !term || course.title.toLocaleLowerCase('pt-BR').includes(term));
    const byName = new Map<string, Course[]>();
    for (const course of courses) {
      const name = (course.categoryId && categories.find(item => item.id === course.categoryId)?.name) || '';
      byName.set(name, [...(byName.get(name) ?? []), course]);
    }
    return [...byName.entries()]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')))
      .map(([name, items]) => ({ name: name || (byName.size > 1 ? 'Sem categoria' : ''), items }));
  }, [data, query, categories]);

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

  /** An assunto with the internal videos of one company: only it sees the assunto, and only while on Diamante. */
  async function giveTo(courseId: string, companyId: string | null) {
    if (!data) return;
    const before = data;
    setData({ ...data, courses: data.courses.map(course => (course.id === courseId ? { ...course, companyId } : course)) });
    setBusy(courseId); setError('');
    try {
      await setSubjectCompany(courseId, companyId);
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
  // an assunto of one company is not part of any plan's list
  const shared = data.courses.filter(course => !course.companyId);
  const offered = (target: CompanyPlan) => shared.filter(course => !excludedOf(target).has(course.id)).length;

  const searching = query.trim() !== '';
  const isOpen = (name: string) => searching || !name || !collapsed.has(name);
  const toggleGroup = (name: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(name)) next.add(name);
    return next;
  });
  const named = groups.filter(group => group.name).map(group => group.name);
  const allCollapsed = named.length > 0 && named.every(name => collapsed.has(name));

  return <section aria-label="Assuntos por plano" className="grid w-full max-w-5xl min-w-0 gap-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <p className="m-0 max-w-xl text-sm text-muted-foreground">
        Escolha os assuntos que cada plano pode usar. Todos começam liberados; ao tirar um assunto de um plano, as empresas daquele plano deixam de vê-lo.
      </p>
      <div className="flex items-center gap-2">
        {named.length > 1 && !searching && <button className="h-9 shrink-0 cursor-pointer rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(named))} type="button">
          {allCollapsed ? 'Expandir todos' : 'Recolher todos'}
        </button>}
        <label className="relative block w-full md:w-72">
          <span className="sr-only">Buscar assunto</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" onChange={event => setQuery(event.target.value)} placeholder="Buscar assunto" type="search" value={query} />
        </label>
      </div>
    </div>

    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    <div className="rounded-2xl border border-border bg-card shadow-card">
      {/* the plans: column heads on a wide screen, a strip of counts on a phone */}
      <div className={cn('sticky top-0 z-10 grid grid-cols-4 gap-1.5 rounded-t-2xl border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:gap-0', rowGrid)}>
        <span className="hidden text-xs font-bold tracking-wider text-muted-foreground uppercase md:block">Assunto</span>
        {planOptions.map(option => {
          const Icon = option.icon;
          const count = offered(option.id);
          return <div className="flex flex-col items-center gap-1 text-center" key={option.id}>
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg" style={{ backgroundColor: option.tint, color: option.ink }}><Icon className="size-4" /></span>
            <strong className="text-xs leading-none">{option.label}</strong>
            <span className={cn('text-[0.6875rem] leading-none tabular-nums', count === shared.length ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
              {count === shared.length ? 'Todos' : `${count} de ${shared.length}`}
            </span>
          </div>;
        })}
      </div>

      {groups.length === 0
        ? <p className="m-0 px-4 py-10 text-center text-sm text-muted-foreground">Nenhum assunto com “{query.trim()}”.</p>
        : groups.map(group => <div key={group.name || 'todos'} role="group" aria-label={group.name || 'Assuntos'}>
          {group.name && <h3 className="m-0">
            <button aria-expanded={isOpen(group.name)} className={cn('flex w-full cursor-pointer items-center gap-2 px-4 text-left text-sm font-bold text-foreground hover:bg-muted/25',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              isOpen(group.name) ? 'pt-5 pb-1.5' : 'border-b border-border py-3.5')}
              disabled={searching} onClick={() => toggleGroup(group.name)} type="button">
              <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', !isOpen(group.name) && '-rotate-90')} />
              {group.name}
              <span className="text-xs font-normal text-muted-foreground">{pluralize(group.items.length, 'assunto', 'assuntos')}</span>
            </button>
          </h3>}
          {isOpen(group.name) && <ul className="m-0 list-none p-0">
            {group.items.map(course => {
              const owner = course.companyId ? companies.find(item => item.id === course.companyId) : undefined;
              return <li className={cn('grid gap-2.5 border-b border-border px-4 py-3.5 hover:bg-muted/25 md:gap-0 md:py-3', rowGrid)} key={course.id}>
                <div className="grid min-w-0 gap-0.5 md:pr-4">
                  <strong className="text-sm leading-snug font-semibold">{course.title}</strong>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{pluralize(course.videoCount, 'vídeo', 'vídeos')}</span>
                    {companies.length > 0 && <>
                      <span aria-hidden="true">·</span>
                      <select aria-label={`Quem vê o assunto ${course.title}`}
                        // the admin stylesheet sizes every select as a form field; this one is a quiet inline choice
                        className="-ml-1 [field-sizing:content] h-6! min-h-0! max-w-full min-w-0 cursor-pointer truncate rounded-md! border! border-transparent! bg-transparent! px-1! text-xs! text-muted-foreground shadow-none! hover:border-border! hover:bg-background! disabled:opacity-60"
                        disabled={busy === course.id} onChange={event => void giveTo(course.id, event.target.value || null)} value={course.companyId ?? ''}>
                        <option value="">Para todas as empresas</option>
                        {companies.map(company => <option key={company.id} value={company.id}>Vídeos internos de {company.name}</option>)}
                      </select>
                    </>}
                  </div>
                </div>

                {course.companyId
                  ? <p className="m-0 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground md:col-span-4 md:text-center">
                    Só {owner ? owner.name : 'a empresa escolhida'}, no plano <strong className="text-foreground">Diamante</strong>
                  </p>
                  : <div className="grid grid-cols-4 gap-1.5 md:contents">
                    {planOptions.map(option => {
                      const on = !excludedOf(option.id).has(course.id);
                      return <label className="flex justify-center" key={option.id}>
                        <input checked={on} className="peer sr-only" disabled={busy === option.id} onChange={() => toggle(option.id, course.id)} type="checkbox" />
                        {/* "liberado" is the normal state, so it stays quiet; an assunto taken out of a plan is what the eye should find */}
                        <span className={cn(
                          'flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border select-none',
                          'transition-[transform,background-color,border-color] duration-150 ease-out active:scale-[0.94]',
                          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-wait peer-disabled:opacity-60',
                          'md:size-8',
                          on ? 'border-transparent bg-primary/10 text-primary hover:bg-primary/15' : 'border-dashed border-muted-foreground/40 bg-background text-muted-foreground/70 hover:border-primary/60',
                        )}>
                          {on ? <Check aria-hidden="true" className="size-4" strokeWidth={2.75} /> : <Minus aria-hidden="true" className="size-3.5" />}
                          <span className="sr-only">{option.label}</span>
                          <span className="sr-only">{` — ${course.title}`}</span>
                        </span>
                      </label>;
                    })}
                  </div>}
              </li>;
            })}
          </ul>}
        </div>)}
    </div>

    <p className="m-0 text-xs text-muted-foreground">
      Um assunto com os vídeos internos de uma empresa fica só para ela, e só no plano Diamante: escolha a empresa no lugar de “Para todas as empresas”.
    </p>
  </section>;
}
