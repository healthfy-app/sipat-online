import { ArrowLeft, Clock, Copy, FileDown, FileSpreadsheet, Film, Gamepad2, Rocket, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  copySipatPlan, createSipatEvent, getSipatCatalog, getSipatPlan, launchSipat, listSipatEvents, listSipatPlans, saveSipatPlan, updateSipatEvent,
  type SipatEvent, type SipatPlanSummary,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
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

const statusBadge: Record<SipatEvent['status'], { text: string; variant: 'success' | 'warning' | 'neutral' }> = {
  Draft: { text: 'Rascunho', variant: 'warning' },
  Published: { text: 'Publicada', variant: 'success' },
  Cancelled: { text: 'Cancelada', variant: 'neutral' },
};

/**
 * One SIPAT of a company: a week of training. It is built as a draft (start date, days, a theme for each day),
 * can start from another SIPAT, and goes live when published. The company's administrator and the operator use it alike.
 */
export default function SipatBuilderPage({ basePath, canEditThemes = false }: { basePath: string; canEditThemes?: boolean }) {
  const navigate = useNavigate();
  const params = useParams();
  const isNew = params.sipatId === 'nova';
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [others, setOthers] = useState<SipatEvent[]>([]);
  const [plans, setPlans] = useState<SipatPlanSummary[]>([]);
  const [sipat, setSipat] = useState<SipatEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [stage, setStage] = useState<'setup' | 'grid'>(isNew ? 'setup' : 'grid');
  const [name, setName] = useState('');
  const [dayCount, setDayCount] = useState(5);
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState<DaySlots[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmingLaunch, setConfirmingLaunch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [content, events, summaries] = await Promise.all([getSipatCatalog(), listSipatEvents(0, 100), listSipatPlans()]);
      setCatalog(buildCatalog(content.courses, content.videos, content.games));
      setPlans(summaries);
      setOthers(events.items);
      if (!isNew && params.sipatId) {
        const found = events.items.find(item => item.id === params.sipatId);
        if (!found) { setError('Não encontrei esta SIPAT.'); return; }
        setSipat(found); setName(found.title);
        setDays((await getSipatPlan(found.id)).map(fromProgramDay));
      } else {
        const year = new Date().getFullYear();
        setName(current => current || `SIPAT ${year}`);
      }
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setLoading(false); }
  }, [isNew, params.sipatId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const totals = useMemo(() => !catalog ? { videos: 0, games: 0, time: 0 } : {
    videos: days.reduce((sum, day) => sum + day.videos.filter(Boolean).length, 0),
    games: days.reduce((sum, day) => sum + day.games.filter(Boolean).length, 0),
    time: days.reduce((sum, day) => sum + dayDuration(day, catalog), 0),
  }, [days, catalog]);

  const cancelled = sipat?.status === 'Cancelled';
  const published = sipat?.status === 'Published';
  const edit = (next: DaySlots[]) => { setDays(next); setDirty(true); setNotice(''); };

  function start() {
    if (!isValidDate(startDate)) { setError('Escolha a data de início da SIPAT.'); return; }
    setError('');
    setDays(Array.from({ length: dayCount }, (_, index) => newDay(index, addDays(startDate, index))));
    setStage('grid'); setDirty(true);
  }

  function problems(): string[] {
    const list: string[] = [];
    if (!name.trim()) list.push('Dê um nome à SIPAT.');
    days.forEach((day, index) => {
      if (!day.title.trim()) list.push(`O dia ${index + 1} precisa de um título.`);
      if (!day.videos.some(Boolean)) list.push(`O dia ${index + 1} precisa de um assunto com vídeos.`);
      if (day.date && !isValidDate(day.date)) list.push(`A data do dia ${index + 1} é inválida.`);
    });
    return list;
  }

  /** Saves the SIPAT (creating it the first time) and its days; returns its id. */
  async function save(): Promise<string | null> {
    const list = problems();
    if (list.length > 0) { setError(list.join(' ')); return null; }
    setBusy(true); setError(''); setNotice('');
    try {
      const first = days.find(day => day.date)?.date ?? startDate;
      const last = [...days].reverse().find(day => day.date)?.date ?? first;
      const schedule = { startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(last, 1)}T00:00:00.000Z` };
      let current = sipat;
      if (!current) {
        current = await createSipatEvent({ title: name.trim(), description: null, ...schedule });
      } else if (current.status === 'Draft' && current.title !== name.trim()) {
        current = await updateSipatEvent(current.id, { title: name.trim(), description: current.description, startsAt: current.startsAt, endsAt: current.endsAt });
      }
      const saved = await saveSipatPlan(current.id, days.map(toProgramDay));
      setDays(saved.map(fromProgramDay)); setDirty(false); setSipat(current);
      setNotice('Rascunho salvo.');
      if (isNew) navigate(`${basePath}/${current.id}`, { replace: true });
      return current.id;
    } catch (failure) {
      setError(getErrorMessage(failure));
      return null;
    } finally { setBusy(false); }
  }

  async function publish() {
    setConfirmingLaunch(false);
    const id = await save();
    if (!id) return;
    setBusy(true); setError('');
    try {
      const result = await launchSipat(id);
      const events = await listSipatEvents(0, 100);
      setOthers(events.items);
      setSipat(events.items.find(item => item.id === id) ?? null);
      setNotice(result.created > 0 ? `SIPAT publicada: ${pluralize(result.created, 'dia entregue', 'dias entregues')} aos participantes.` : 'SIPAT atualizada. Os dias que já tinham progresso ficaram como estavam.');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  async function copyFrom(sourceId: string) {
    setCopying(false);
    setBusy(true); setError('');
    try {
      let target = sipat?.id;
      if (!target) {
        const first = isValidDate(startDate) ? startDate : new Date().toISOString().slice(0, 10);
        const created = await createSipatEvent({ title: name.trim() || `SIPAT ${new Date().getFullYear()}`, description: null, startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(first, 1)}T00:00:00.000Z` });
        setSipat(created); target = created.id;
      }
      const copied = (await copySipatPlan(target, sourceId)).map(fromProgramDay);
      const base = isValidDate(startDate) ? startDate : null;
      setDays(copied.map((day, index) => ({ ...day, date: base ? addDays(base, index) : '' })));
      setStage('grid'); setDirty(true);
      setNotice('Dias copiados. Defina as datas e confira os assuntos antes de publicar.');
      if (isNew) navigate(`${basePath}/${target}`, { replace: true });
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  if (loading) return <LoadingState>Carregando a SIPAT...</LoadingState>;
  if (!catalog) {
    return <Page><div className="grid justify-items-start gap-3">
      <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error || 'Não foi possível carregar o catálogo.'}</p>
      <Button onClick={() => void load()} variant="outline">Tentar novamente</Button>
    </div></Page>;
  }

  const template = () => download('modelo-sipat.csv', sampleCsv(catalog));
  const sources = others.filter(item => item.id !== sipat?.id && (plans.find(plan => plan.sipatEventId === item.id)?.days ?? 0) > 0);
  const label = sipat ? statusBadge[sipat.status] : null;

  return <Page className="builder-page">
    <Link className="inline-flex items-center gap-1.5 justify-self-start text-sm font-medium text-muted-foreground no-underline hover:text-foreground" to={basePath}>
      <ArrowLeft aria-hidden="true" className="size-4" /> Todas as SIPATs
    </Link>
    <PageHeader
      actions={stage === 'grid' && !cancelled && <>
        {sources.length > 0 && <Button disabled={busy} onClick={() => setCopying(true)} variant="outline"><Copy /> Duplicar de outra SIPAT</Button>}
        <Button onClick={() => setImporting(true)} variant="outline"><FileSpreadsheet /> Importar CSV</Button>
        <Button disabled={days.length === 0} onClick={() => download(`${(name || 'sipat').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`, planToCsv(days, catalog))} variant="outline"><FileDown /> Exportar CSV</Button>
        <Button disabled={busy || !dirty} onClick={() => void save()} variant="outline"><Save /> {published ? 'Salvar alterações' : 'Salvar rascunho'}</Button>
        <Button disabled={busy || days.length === 0} onClick={() => (problems().length > 0 ? setError(problems().join(' ')) : setConfirmingLaunch(true))}><Rocket /> {published ? 'Atualizar os dias' : 'Publicar'}</Button>
      </>}
      badge={<>{label && <Badge variant={label.variant}>{label.text}</Badge>}{dirty && <Badge variant="outline">Alterações não salvas</Badge>}</>}
      description={stage === 'setup' ? 'Defina quando começa, quantos dias tem e o assunto de cada dia.' : 'Cada coluna é um dia. Arraste um assunto para cada dia e confira os vídeos e os jogos.'}
      eyebrow="SIPAT"
      title={isNew && stage === 'setup' ? 'Nova SIPAT' : name || 'SIPAT'}
    />

    {cancelled && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">Esta SIPAT foi cancelada e não pode mais ser alterada. Use "Duplicar" em uma nova SIPAT para reaproveitar os dias.</p>}
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {catalog.subjects.length === 0 && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">O acervo ainda não tem assuntos publicados. Peça à operação para publicar os assuntos.</p>}

    {stage === 'setup'
      ? <BuilderSetup dayCount={dayCount} name={name} onDayCount={setDayCount} onImport={() => setImporting(true)} onName={setName} onStart={start}
        onStartDate={setStartDate} onTemplate={template} startDate={startDate}
        onCopy={sources.length > 0 ? () => setCopying(true) : undefined} />
      : <>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium">
            Nome da SIPAT
            <Input className="h-11 text-base font-semibold" disabled={cancelled || (sipat !== null && sipat.status !== 'Draft')} maxLength={200}
              onChange={event => { setName(event.target.value); setDirty(true); }} placeholder="Ex.: SIPAT 2026" value={name} />
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
        <BuilderGrid canEditThemes={canEditThemes} catalog={catalog} days={days} onChange={cancelled ? () => undefined : edit} />
      </>}

    {importing && <ImportDialog catalog={catalog} hasPlan={stage === 'grid' && days.some(day => day.videos.some(Boolean))} onClose={() => setImporting(false)}
      onImport={imported => { setDays(imported); setDirty(true); setStage('grid'); setImporting(false); setNotice(`${pluralize(imported.length, 'dia importado', 'dias importados')}. Revise e salve.`); }}
      onTemplate={template} />}

    {copying && <Dialog description="Escolha a SIPAT de onde vêm os assuntos. Os dias são copiados para este rascunho e as datas ficam em aberto." onClose={() => setCopying(false)} title="Duplicar de outra SIPAT">
      <ul className="m-0 grid max-h-72 list-none gap-2 overflow-auto p-0">
        {sources.map(item => {
          const plan = plans.find(entry => entry.sipatEventId === item.id);
          return <li key={item.id}>
            <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary" onClick={() => void copyFrom(item.id)} type="button">
              <span className="grid"><strong className="text-sm">{item.title}</strong>
                <span className="text-xs text-muted-foreground">{new Date(item.startsAt).getUTCFullYear()} · {plan ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}` : ''}</span></span>
              <Badge variant={statusBadge[item.status].variant}>{statusBadge[item.status].text}</Badge>
            </button>
          </li>;
        })}
      </ul>
      <DialogActions><Button onClick={() => setCopying(false)} variant="outline">Cancelar</Button></DialogActions>
    </Dialog>}

    {confirmingLaunch && <Dialog description={published
      ? 'Os dias que ninguém começou são atualizados com os assuntos atuais. Os que já têm progresso ficam como estão.'
      : 'Ao publicar, cada dia é entregue aos participantes ativos da empresa. Só uma SIPAT fica publicada por vez.'}
      onClose={() => setConfirmingLaunch(false)} title={published ? 'Atualizar os dias da SIPAT?' : 'Publicar a SIPAT?'}>
      <DialogActions>
        <Button onClick={() => setConfirmingLaunch(false)} variant="outline">Voltar</Button>
        <Button onClick={() => void publish()}><Rocket /> {published ? 'Atualizar' : 'Publicar agora'}</Button>
      </DialogActions>
    </Dialog>}
  </Page>;
}
