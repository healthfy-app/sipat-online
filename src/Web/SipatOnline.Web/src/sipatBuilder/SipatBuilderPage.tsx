import { Clock, FileDown, FileSpreadsheet, Film, Gamepad2, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createSipatProgram, listGameModules, listPlatformCompanies, listPlatformCourses, listPlatformLibraryVideos, listSipatPrograms,
  updateSipatProgram, type PlatformCompany,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import ApplyDialog from './ApplyDialog';
import BuilderGrid from './BuilderGrid';
import BuilderSetup from './BuilderSetup';
import { planToCsv, sampleCsv } from './csv';
import ImportDialog from './ImportDialog';
import {
  addDays, buildCatalog, dayDuration, formatSpan, fromProgramDay, isValidDate, newDay, toProgramDay,
  type Catalog, type DaySlots,
} from './model';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

/**
 * "Construção SIPAT": the operator builds the week of a company. First it asks how many days, then it opens
 * a board where each day gets its slogan, date, videos and games. The plan can come from a CSV and go back to one.
 */
export default function SipatBuilderPage() {
  const navigate = useNavigate();
  const { programId, companyId: companyParam } = useParams();
  const [search] = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [savedId, setSavedId] = useState<string | undefined>(programId);
  const [stage, setStage] = useState<'setup' | 'grid'>(programId ? 'grid' : 'setup');
  const [name, setName] = useState('');
  const [dayCount, setDayCount] = useState(5);
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState<DaySlots[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [courses, library, games, programs, companyList] = await Promise.all([
        listPlatformCourses(), listPlatformLibraryVideos(), listGameModules(), programId ? listSipatPrograms() : Promise.resolve([]), listPlatformCompanies(),
      ]);
      setCatalog(buildCatalog(courses, library, games));
      setCompanies(companyList);
      if (programId) {
        const program = programs.find(item => item.id === programId);
        if (program) { setName(program.title); setDays(program.days.map(fromProgramDay)); setSavedId(program.id); }
        else setError('Não encontrei esta programação.');
      }
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setLoading(false); }
  }, [programId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const totals = useMemo(() => {
    if (!catalog) return { videos: 0, games: 0, time: 0 };
    return {
      videos: days.reduce((sum, day) => sum + day.videos.filter(Boolean).length, 0),
      games: days.reduce((sum, day) => sum + day.games.filter(Boolean).length, 0),
      time: days.reduce((sum, day) => sum + dayDuration(day, catalog), 0),
    };
  }, [days, catalog]);

  const edit = (next: DaySlots[]) => { setDays(next); setDirty(true); setNotice(''); };

  function start() {
    const first = isValidDate(startDate) ? startDate : '';
    setDays(Array.from({ length: dayCount }, (_, index) => newDay(index, first ? addDays(first, index) : '')));
    setStage('grid'); setDirty(true);
  }

  /** Why the plan cannot be saved yet, in words the operator can act on. */
  function problems(): string[] {
    const list: string[] = [];
    if (!name.trim()) list.push('Dê um nome à SIPAT.');
    days.forEach((day, index) => {
      if (!day.title.trim()) list.push(`O dia ${index + 1} precisa de um tema ou slogan.`);
      if (!day.videos.some(Boolean)) list.push(`O dia ${index + 1} precisa de pelo menos um vídeo.`);
      if (day.date && !isValidDate(day.date)) list.push(`A data do dia ${index + 1} é inválida.`);
    });
    return list;
  }

  async function save(): Promise<string | null> {
    const list = problems();
    if (list.length > 0) { setError(list.join(' ')); return null; }
    setSaving(true); setError(''); setNotice('');
    try {
      const data = { title: name.trim(), days: days.map(toProgramDay) };
      const saved = savedId ? await updateSipatProgram(savedId, data) : await createSipatProgram(data);
      setDays(saved.days.map(fromProgramDay)); setDirty(false); setSavedId(saved.id);
      setNotice(`“${saved.title}” foi salva.`);
      if (!savedId) navigate(companyParam ? `/platform/companies/${companyParam}/sipat/${saved.id}` : `/platform/sipat-builder/${saved.id}`, { replace: true });
      return saved.id;
    } catch (failure) {
      setError(getErrorMessage(failure));
      return null;
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingState>Carregando a construção da SIPAT...</LoadingState>;
  if (!catalog) {
    return <Page><div className="grid justify-items-start gap-3">
      <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error || 'Não foi possível carregar o catálogo.'}</p>
      <Button onClick={() => void load()} variant="outline">Tentar novamente</Button>
    </div></Page>;
  }

  const template = () => download('modelo-sipat.csv', sampleCsv(catalog));
  const emptyCatalog = catalog.videos.size === 0;

  return <Page className="builder-page">
    <PageHeader
      actions={stage === 'grid' && <>
        <Button onClick={() => setImporting(true)} variant="outline"><FileSpreadsheet /> Importar CSV</Button>
        <Button onClick={() => download(`${(name || 'sipat').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`, planToCsv(days, catalog))} variant="outline"><FileDown /> Exportar CSV</Button>
        <Button disabled={saving || !dirty} onClick={() => void save()} variant="outline"><Save /> {saving ? 'Salvando...' : 'Salvar'}</Button>
        <Button disabled={saving} onClick={async () => { const id = dirty || !savedId ? await save() : savedId; if (id) setApplying(true); }}><Send /> Aplicar a uma empresa</Button>
      </>}
      badge={dirty ? <Badge variant="outline">Alterações não salvas</Badge> : undefined}
      description={stage === 'setup' ? 'Monte a programação de dias da SIPAT de uma empresa.' : 'Cada coluna é um dia. Arraste um tema para cada dia e confira os vídeos e os jogos.'}
      eyebrow="Operação"
      title="Construção SIPAT"
    />

    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {emptyCatalog && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
      O catálogo ainda não tem vídeos. Envie os vídeos na aba "Vídeos" de Cursos para poder montar os dias.
    </p>}

    {stage === 'setup'
      ? <BuilderSetup dayCount={dayCount} name={name} onDayCount={setDayCount} onImport={() => setImporting(true)} onName={setName} onStart={start}
        onStartDate={setStartDate} onTemplate={template} startDate={startDate} />
      : <>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium">
            Nome da SIPAT
            <Input className="h-11 text-base font-semibold" maxLength={200} onChange={event => { setName(event.target.value); setDirty(true); }} placeholder="Ex.: SIPAT 2026 · Empresa Exemplo" value={name} />
          </label>
          <dl className="m-0 flex flex-wrap gap-2">
            {[
              { icon: <span aria-hidden="true" className="font-semibold">{days.length}</span>, label: days.length === 1 ? 'dia' : 'dias' },
              { icon: <Film aria-hidden="true" className="size-4" />, label: `${totals.videos} ${totals.videos === 1 ? 'vídeo' : 'vídeos'}` },
              { icon: <Gamepad2 aria-hidden="true" className="size-4" />, label: `${totals.games} ${totals.games === 1 ? 'jogo' : 'jogos'}` },
              { icon: <Clock aria-hidden="true" className="size-4" />, label: totals.time > 0 ? formatSpan(totals.time) : 'sem vídeos' },
            ].map(item => <div className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground" key={item.label}>{item.icon}{item.label}</div>)}
          </dl>
        </div>
        <BuilderGrid catalog={catalog} days={days} onChange={edit} />
        <p className="m-0 text-xs text-muted-foreground">
          Cada dia é uma caixa: arraste um tema para ela. Os vídeos e os jogos vêm do tema e aparecem aqui só para conferência. Para mudar o conteúdo, use "Editar vídeos e jogos".
        </p>
      </>}

    {importing && <ImportDialog catalog={catalog} hasPlan={stage === 'grid' && days.some(day => day.videos.some(Boolean))} onClose={() => setImporting(false)}
      onImport={imported => { setDays(imported); setDirty(true); setStage('grid'); setImporting(false); setNotice(`${imported.length} ${imported.length === 1 ? 'dia importado' : 'dias importados'}. Revise e salve.`); if (!name.trim()) setName('SIPAT importada'); }}
      onTemplate={template} />}
    {applying && savedId && <ApplyDialog companies={companies} initialCompanyId={companyParam ?? search.get('empresa') ?? ''} onApplied={message => { setApplying(false); setNotice(message); }}
      onClose={() => setApplying(false)} programId={savedId} />}
  </Page>;
}
