import { saveFile } from '@/lib/saveFile';
import { ArrowLeft, Ban, Clock, Copy, Eye, FileDown, Film, Gamepad2, MoreHorizontal, ImagePlus, Link2, Pencil, Rocket, Save, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  acceptCompanyVideoTerms, cancelSipatEvent, companyEditorLinks, copySipatPlan, saveTrainingAudience, setTrainingCover, createSipatEvent, getCompanyCapabilities, getSipatCatalog, getSipatPlan, getTemplateDays, getTrainingLimit, listCompanyVideos, listCourseCategories, listGameModules, listPlatformCourses, listPlatformLibraryVideos, listSubjects, listVideoSubjects, saveTemplateDays, launchSipat, listSipatEvents, listSipatPlans, openSipatWeek, saveSipatPlan, updateSipatEvent,
  type CompanyCapabilities, type PlatformCourse, type SipatEvent, type SipatPlanSummary,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Page } from '@/components/ui/page';
import { extrasSuffix, getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import LoadingState from '@/LoadingState';
import '@/OpsIdentity.css';
import { partWord } from '@/trainings/partWord';
import { courseLessons as titlesOf } from '@/courseEditor/courseTrack';
import BuilderGrid from './BuilderGrid';
import BuilderSetup from './BuilderSetup';
// the participant's look (its player and styles) comes only when someone opens the preview
const TrainingPreview = lazy(() => import('./preview/TrainingPreview'));
import { planToCsv } from './csv';
import AudienceRow from '@/trainings/AudienceRow';
import { useUnitScope } from '@/trainings/unitScope';
import { copyTrainingLink } from '@/trainings/trainingLink';
import { checkVideoFile, enqueueUploads, isActive, onVideoUploaded, titleFromFileName, useUploadQueue } from '@/videoUploads/uploadQueue';

/** The tag of an upload sent from a day: the day's key follows it. */
const dayTag = 'day:';
import { phaseLabel, sipatPhase } from './sipatPhase';
import {
  addDays, buildCatalog, dayDuration, dayFromTitle, maxDays, dayVideoCounts, formatSpan, fromProgramDay, isValidDate, newDay, toProgramDay, withDayWord,
  type Catalog, type DaySlots,
} from './model';

/** On the phone (up to 760px) the hero buttons are 44px tall: "Mais" and "Salvar" share a row, the main action takes the next one. */
const phoneAction = 'max-[760px]:h-auto max-[760px]:min-h-11 max-[760px]:text-[0.9375rem]';
/**
 * A hero action that stands out from the white ones without being the main one: soft green. The hero paints its
 * buttons white with !important (OpsIdentity.css), so the classes carry the same parent to win over it.
 */
const heroTonal = '[.ops-hero-actions>&]:border-primary/35! [.ops-hero-actions>&]:bg-primary/10! [.ops-hero-actions>&]:text-primary! [.ops-hero-actions>&]:font-bold';
/** The eye of the participant's view, in the yellow of the preview's own mark. */
const previewEye = 'text-[#ffd166]';

function download(name: string, text: string) {
  saveFile(new Blob([text], { type: 'text/csv;charset=utf-8' }), name);
}

/** What still blocks saving, per day (by position) and for the name, in short phrases shown on the day itself. */
export function findIssues(name: string, days: DaySlots[]): { name: string | null; days: Record<number, string[]> } {
  const byDay: Record<number, string[]> = {};
  days.forEach((day, index) => {
    const list: string[] = [];
    if (!day.title.trim()) list.push('Falta o slogan do dia.');
    if (!day.videos.some(Boolean)) list.push('Falta um assunto com vídeos.');
    if (day.date && !isValidDate(day.date)) list.push('A data é inválida.');
    if (list.length > 0) byDay[index] = list;
  });
  return { name: name.trim() ? null : 'Dê um nome ao treinamento.', days: byDay };
}

/**
 * One SIPAT of a company: a week of training. It is built as a draft (start date, days, a theme for each day),
 * can start from another SIPAT, and goes live when published. The company's administrator and the operator use it alike.
 */
export default function SipatBuilderPage({ basePath, canEditThemes = false, template = false }: {
  basePath: string; canEditThemes?: boolean;
  /** A template of the operation (the route's `courseId`): the same board, of no company, so without dates, audience, link or publishing. */
  template?: boolean;
}) {
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const unitScope = useUnitScope();
  // a training made while a unit is chosen at the top is born for that unit (it can be changed in "Para quem")
  const createTraining = async (data: Parameters<typeof createSipatEvent>[0]) => {
    const created = await createSipatEvent(data);
    if (unitScope.unitId) await saveTrainingAudience(created.id, { targets: [{ unitId: unitScope.unitId, sectorId: null }] }).catch(() => undefined);
    return created;
  };
  const isNew = !template && params.sipatId === 'nova';
  const templateId = template ? params.courseId ?? '' : '';
  // what the days can be made of: the company's catalog, or, for a template, everything the operation has
  const fetchContent = useCallback(async (): Promise<Awaited<ReturnType<typeof getSipatCatalog>>> => {
    if (!template) return getSipatCatalog();
    const [courses, videos, games, categories, subjects, videoSubjects] = await Promise.all([
      listPlatformCourses(), listPlatformLibraryVideos(), listGameModules(), listCourseCategories().catch(() => []), listSubjects().catch(() => []), listVideoSubjects().catch(() => [])]);
    // the ready trainings to drag from are the other templates: never a company's own, nor this one
    return { courses: courses.filter(course => !course.tenantId && course.id !== params.courseId), videos, games, categories, subjects, videoSubjects };
  }, [template, params.courseId]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [others, setOthers] = useState<SipatEvent[]>([]);
  const [plans, setPlans] = useState<SipatPlanSummary[]>([]);
  // what the company's plan allows; unknown (null) leaves everything open and the server decides
  const [capabilities, setCapabilities] = useState<CompanyCapabilities | null>(null);
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
  // the draft saves itself a few seconds after each change: 'saving' while it goes, 'saved' once it is on the server
  const [autoSave, setAutoSave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  // the save on its way, so a second one waits for it (and never creates the training twice)
  const saving = useRef<Promise<string | null> | null>(null);
  // what the screen holds right now, read after a save to know whether something changed meanwhile
  const latest = useRef({ name: '', days: [] as DaySlots[], limit: '' });
  // the training once created, read by a save that waited for another
  const sipatRef = useRef<SipatEvent | null>(null);
  // the last day the training can be taken, when it runs past its last day ('': it ends with its last day)
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmingLaunch, setConfirmingLaunch] = useState(false);
  // where the user tried to go while the SIPAT had unsaved changes
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  // the last day removed, kept for a few seconds so it can be put back
  const [removed, setRemoved] = useState<{ day: DaySlots; index: number } | null>(null);
  // videos sent from a day, already with the company, waiting to be prepared: they come onto that day when ready
  const [preparing, setPreparing] = useState<{ videoId: string; dayKey: string; title: string }[]>([]);
  const uploads = useUploadQueue();
  // problems are only shown after a save or publish attempt, then they update live as they get fixed
  const [showIssues, setShowIssues] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  // the training the way the participant sees it, from what is on the board now
  const [previewing, setPreviewing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // the trainings of Conteúdo; starting from one makes a day of each of its Títulos
  const [trainings, setTrainings] = useState<PlatformCourse[]>([]);
  const [training, setTraining] = useState('');

  const applyContent = useCallback((loaded: Awaited<ReturnType<typeof getSipatCatalog>>) => {
    // the catalog's video links are the operation's routes: a company's administrator plays them (with every version)
    // from the company's own, as in its editor; the operation inside a company keeps them, and a template has no company
    const content = template ? loaded : companyEditorLinks(loaded);
    // an <img> cannot send the company header the admin route needs: the operator loads the photo from the platform route
    const courses = canEditThemes
      ? content.courses.map(course => ({ ...course, coverUrl: course.coverUrl?.replace('/api/admin/sipat-catalog/courses/', '/api/platform/catalog/courses/') ?? null }))
      : content.courses;
    setCatalog(buildCatalog(courses, content.videos, content.games, content.categories ?? [], content.subjects ?? [], content.videoSubjects ?? []));
    setTrainings(courses);
  }, [canEditThemes, template]);

  // back from the video editor (opened in another tab): the trainings and videos come again, the days being built stay as they are
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchContent().then(applyContent, () => undefined); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [applyContent, fetchContent]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (template) {
        const [content, all] = await Promise.all([fetchContent(), listPlatformCourses()]);
        const found = all.find(item => item.id === templateId && !item.tenantId);
        applyContent(content);
        if (!found) { setError('Não encontrei este treinamento.'); return; }
        setName(found.title);
        setDays((await getTemplateDays(templateId)).map(fromProgramDay));
        setLimit(await getTrainingLimit(templateId).catch(() => null) ?? '');
        return;
      }
      const [content, events, summaries] = await Promise.all([getSipatCatalog(), listSipatEvents(0, 100), listSipatPlans()]);
      getCompanyCapabilities().then(setCapabilities).catch(() => setCapabilities(null));
      applyContent(content);
      setPlans(summaries);
      setOthers(events.items);
      if (!isNew && params.sipatId) {
        const found = events.items.find(item => item.id === params.sipatId);
        if (!found) { setError('Não encontrei este treinamento.'); return; }
        setSipat(found); setName(found.title);
        // the training ends the day before `endsAt`: its last day, or its limit date when that is further ahead
        setLimit(addDays(found.endsAt.slice(0, 10), -1));
        setDays((await getSipatPlan(found.id)).map(fromProgramDay));
      } else {
        const year = new Date().getFullYear();
        setName(current => current || `SIPAT ${year}`);
      }
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setLoading(false); }
  }, [isNew, params.sipatId, applyContent, template, templateId, fetchContent]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    // links inside the portal (back link, sidebar) change the page without unloading it: ask before leaving
    const guardLinks = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const destination = `${url.pathname}${url.search}${url.hash}`;
      if (destination === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(destination);
    };
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [dirty]);

  // success notices float at the bottom of the screen, where they are seen however the grid is scrolled, and leave on their own
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [removed]);

  // a video that finished sending is the company's now; sent from a day, it waits here to be prepared
  useEffect(() => onVideoUploaded(item => {
    const video = item.video;
    if (video && item.tag?.startsWith(dayTag)) setPreparing(current => [...current, { videoId: video.id, dayKey: item.tag!.slice(dayTag.length), title: item.title }]);
    fetchContent().then(applyContent, () => undefined);
  }), [applyContent, fetchContent]);
  // while one is being prepared, look again quietly
  useEffect(() => {
    if (preparing.length === 0) return;
    const timer = window.setInterval(() => { fetchContent().then(applyContent, () => undefined); }, 8000);
    return () => window.clearInterval(timer);
  }, [preparing.length, applyContent, fetchContent]);
  // ready: it goes onto the day it was sent from
  useEffect(() => {
    if (!catalog) return;
    const ready = preparing.filter(item => catalog.videos.has(item.videoId));
    if (ready.length === 0) return;
    setDays(current => current.map(day => {
      const placed = day.videos.filter((id): id is string => !!id);
      const mine = ready.filter(item => item.dayKey === day.key && !placed.includes(item.videoId)).map(item => item.videoId);
      return mine.length === 0 ? day : { ...day, videos: [...placed, ...mine] };
    }));
    setDirty(true);
    setPreparing(current => current.filter(item => !catalog.videos.has(item.videoId)));
    setNotice(ready.length === 1 ? `"${ready[0].title}" entrou no dia. Salve para guardar.` : `${ready.length} vídeos entraram nos dias. Salve para guardar.`);
  }, [catalog, preparing]);

  const totals = useMemo(() => !catalog ? { videos: 0, extras: 0, games: 0, time: 0 } : {
    videos: days.reduce((sum, day) => sum + dayVideoCounts(day.videos.filter((id): id is string => !!id), catalog).house, 0),
    extras: days.reduce((sum, day) => sum + dayVideoCounts(day.videos.filter((id): id is string => !!id), catalog).extras, 0),
    games: days.reduce((sum, day) => sum + day.games.filter(Boolean).length, 0),
    time: days.reduce((sum, day) => sum + dayDuration(day, catalog), 0),
  }, [days, catalog]);

  const cancelled = sipat?.status === 'Cancelled';
  const published = sipat?.status === 'Published';
  latest.current = { name, days, limit };
  sipatRef.current = sipat;
  const edit = (next: DaySlots[]) => { setDays(next); setDirty(true); setNotice(''); };

  function start() {
    if (!isValidDate(startDate)) { setError('Escolha a data de início do treinamento.'); return; }
    setError('');
    const source = trainings.find(item => item.id === training);
    if (source && catalog) {
      const known = (ids: string[]) => ids.filter(id => catalog.videos.has(id));
      setDays(titlesOf(source).slice(0, maxDays).map((title, index) => dayFromTitle(index, addDays(startDate, index), title.title, known(title.videoIds))));
      setStage('grid'); setDirty(true);
      return;
    }
    setDays(Array.from({ length: dayCount }, (_, index) => newDay(index, addDays(startDate, index))));
    setStage('grid'); setDirty(true);
  }

  const dated = days.map(day => day.date).filter(isValidDate).sort();
  const firstDate = dated[0] ?? '';
  const lastDate = dated[dated.length - 1] ?? '';
  // the limit shown: the one chosen, never behind the last day
  const shownLimit = lastDate && (!isValidDate(limit) || limit < lastDate) ? lastDate : limit;
  /** A new start carries every day with it, keeping the gaps between them (and the limit as far ahead as it was). */
  function moveStart(next: string) {
    if (!isValidDate(next)) return;
    const shift = firstDate ? Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000) : 0;
    edit(days.map((day, index) => ({ ...day, date: firstDate ? (isValidDate(day.date) ? addDays(day.date, shift) : day.date) : addDays(next, index) })));
    if (firstDate && isValidDate(limit)) setLimit(addDays(limit, shift));
  }
  const issues = useMemo(() => findIssues(name, days), [name, days]);
  const issueCount = Object.keys(issues.days).length + (issues.name ? 1 : 0);

  /** Marks what is missing on the day itself and brings the first one into view. Returns true when nothing is missing. */
  function checkIssues(): boolean {
    if (issueCount === 0) return true;
    setShowIssues(true); setNotice('');
    requestAnimationFrame(() => document.querySelector('[data-day-issue], [data-name-issue]')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
    return false;
  }

  function removeDay(index: number) {
    setRemoved({ day: days[index], index });
    edit(days.filter((_, position) => position !== index));
  }

  function undoRemove() {
    if (!removed) return;
    const next = [...days];
    next.splice(Math.min(removed.index, next.length), 0, removed.day);
    edit(next);
    setRemoved(null);
  }

  /** Saves the SIPAT (creating it the first time) and its days; returns its id. A save already on its way goes first. */
  // the video editor fills the days itself, so opening it skips the grid's content checks
  async function save(skipChecks = false): Promise<string | null> {
    if (!skipChecks && !checkIssues()) return null;
    setBusy(true); setError(''); setNotice('');
    if (saving.current) await saving.current.catch(() => null);
    // a limit behind the last day would end the training before its days: it follows the last day then
    const endsOn = lastDate ? (isValidDate(limit) && limit > lastDate ? limit : lastDate) : null;
    try {
      if (template) {
        const saved = await saveTemplateDays(templateId, withDayWord(days, partWord(days.map(day => day.date))).map(toProgramDay), endsOn);
        setDays(saved.map(fromProgramDay)); setDirty(false);
        setNotice('Template salvo.');
        return templateId;
      }
      let current = sipatRef.current;
      if (!current) {
        // only a new training needs a schedule; days without dates (Módulos) keep the one it has
        const first = days.find(day => day.date)?.date ?? startDate;
        if (!isValidDate(first)) { setError('Escolha a data de início do treinamento.'); return null; }
        const last = [...days].reverse().find(day => day.date)?.date ?? first;
        const schedule = { startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(last, 1)}T00:00:00.000Z` };
        current = await createTraining({ title: name.trim(), description: null, ...schedule });
      } else if (current.status === 'Draft' && current.title !== name.trim()) {
        current = await updateSipatEvent(current.id, { title: name.trim(), description: current.description, startsAt: current.startsAt, endsAt: current.endsAt });
      }
      // untyped names go out as the board shows them ("Módulo 2" without dates, "Dia 2" with)
      const saved = await saveSipatPlan(current.id, withDayWord(days, partWord(days.map(day => day.date))).map(toProgramDay), endsOn);
      // the training's period follows what was just saved
      if (firstDate && lastDate) current = { ...current, startsAt: `${firstDate}T00:00:00.000Z`, endsAt: `${addDays(endsOn ?? lastDate, 1)}T00:00:00.000Z` };
      setDays(saved.map(fromProgramDay)); setDirty(false); setSipat(current); setAutoSave('idle');
      setNotice('Rascunho salvo.');
      if (isNew) navigate(`${basePath}/${current.id}`, { replace: true });
      return current.id;
    } catch (failure) {
      setError(getErrorMessage(failure));
      return null;
    } finally { setBusy(false); }
  }

  /**
   * The draft saving itself, quietly: nothing is locked and nothing is checked, the days keep being edited meanwhile.
   * The server takes a half-built draft (days without videos, names filled in). A new training is created on the first one.
   */
  async function saveQuietly(): Promise<string | null> {
    const sent = latest.current;
    const endsOn = lastDate ? (isValidDate(limit) && limit > lastDate ? limit : lastDate) : null;
    setAutoSave('saving');
    try {
      let current = sipatRef.current;
      if (!current) {
        const first = sent.days.find(day => day.date)?.date ?? startDate;
        if (!isValidDate(first)) { setAutoSave('idle'); return null; }
        const last = [...sent.days].reverse().find(day => day.date)?.date ?? first;
        current = await createTraining({ title: sent.name.trim() || `SIPAT ${new Date().getFullYear()}`, description: null, startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(last, 1)}T00:00:00.000Z` });
        sipatRef.current = current;
        // the address becomes the training's, so a reload opens it; without the router, which would load the page again
        if (isNew) window.history.replaceState(window.history.state, '', `${basePath}/${current.id}`);
      } else if (current.status === 'Draft' && sent.name.trim() && current.title !== sent.name.trim()) {
        current = await updateSipatEvent(current.id, { title: sent.name.trim(), description: current.description, startsAt: current.startsAt, endsAt: current.endsAt });
        sipatRef.current = current;
      }
      const saved = await saveSipatPlan(current.id, withDayWord(sent.days, partWord(sent.days.map(day => day.date))).map(toProgramDay), endsOn);
      // the new days get the ids the server gave them, so the next save updates them instead of adding them again
      const idByKey = new Map(sent.days.map((day, index) => [day.key, saved[index]?.id]));
      setDays(known => known.map(day => (day.id ? day : { ...day, id: idByKey.get(day.key) })));
      if (firstDate && lastDate) current = { ...current, startsAt: `${firstDate}T00:00:00.000Z`, endsAt: `${addDays(endsOn ?? lastDate, 1)}T00:00:00.000Z` };
      sipatRef.current = current;
      setSipat(current);
      // edited while it went: still unsaved, and the next round saves it
      const now = latest.current;
      if (now.days === sent.days && now.name === sent.name && now.limit === sent.limit) setDirty(false);
      setAutoSave('saved');
      return current.id;
    } catch {
      setAutoSave('failed');
      return null;
    }
  }

  // a draft saves itself 3 seconds after the last change: one save per pause, never on a timer while nothing changes
  const canAutoSave = !template && stage === 'grid' && !loading && !busy && (sipat === null || sipat.status === 'Draft');
  useEffect(() => {
    if (!dirty || !canAutoSave) return;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      saving.current = saveQuietly().finally(() => { saving.current = null; });
    }, 3000);
    return () => window.clearTimeout(timer);
    // saveQuietly reads the latest state through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canAutoSave, name, days, limit]);

  /** The pencil: saves what is pending and opens this same training in the video editor. */
  async function editWeek() {
    if (template) {
      if (dirty && !(await save(true))) return;
      navigate(`/platform/courses/${templateId}/edit`);
      return;
    }
    const id = dirty || !sipat ? await save(true) : sipat.id;
    if (!id) return;
    // the company's administrator has its own editor page; the operation edits in Conteúdo
    if (!canEditThemes) { navigate(`${basePath}/${id}/editar`); return; }
    setBusy(true); setError('');
    try {
      const { courseId } = await openSipatWeek(id);
      setDirty(false);
      navigate(`/platform/courses/${courseId}/edit`);
    } catch (failure) {
      setError(getErrorMessage(failure));
      setBusy(false);
    }
  }

  /** Sends videos from a day: they become the company's, and come onto that day when they are ready. */
  async function sendToDay(dayKey: string, files: File[]) {
    setError('');
    try {
      if (!(await listCompanyVideos()).termsAccepted) {
        if (!window.confirm('Os vídeos que você enviar são da sua empresa: ela tem o direito de usá-los e a autorização de imagem de quem aparece neles. Concorda?')) return;
        await acceptCompanyVideoTerms();
      }
      const refused = files.map(file => ({ file, problem: checkVideoFile(file) })).find(item => item.problem);
      if (refused) setError(`${refused.file.name}: ${refused.problem}`);
      enqueueUploads(files.filter(file => !checkVideoFile(file)).map(file => ({ file, title: titleFromFileName(file.name) })), undefined, `${dayTag}${dayKey}`);
    } catch (failure) { setError(getErrorMessage(failure)); }
  }

  // what is on its way to each day: still sending, or with the company and being prepared
  const arriving = new Map<string, { id: string; title: string; status: string }[]>();
  const onItsWay = (dayKey: string, row: { id: string; title: string; status: string }) => arriving.set(dayKey, [...(arriving.get(dayKey) ?? []), row]);
  for (const item of uploads.items) {
    if (!item.tag?.startsWith(dayTag) || !(isActive(item.status) || item.status === 'failed')) continue;
    onItsWay(item.tag.slice(dayTag.length), {
      id: item.id, title: item.title,
      status: item.status === 'failed' ? 'não enviado' : `${item.totalBytes > 0 ? Math.round((item.sentBytes / item.totalBytes) * 100) : 0}%`,
    });
  }
  for (const item of preparing) onItsWay(item.dayKey, { id: item.videoId, title: item.title, status: 'preparando…' });

  // the picture of the training's card, changed from here too
  const coverPicker = useRef<HTMLInputElement>(null);
  async function changeCover(image: File) {
    const courseId = plans.find(item => item.sipatEventId === sipat?.id)?.courseId;
    if (!courseId) { setError('Salve o treinamento antes de escolher a capa.'); return; }
    setError('');
    try {
      await setTrainingCover(courseId, image);
      setPlans(await listSipatPlans());
      setNotice('Capa do treinamento trocada. Ela aparece no card da lista.');
    } catch (failure) { setError(getErrorMessage(failure)); }
  }

  /** The link to hand to the people who will take the training: they sign in and land on it. */
  async function share() {
    if (!sipat) return;
    setError('');
    try {
      const { link, copied } = await copyTrainingLink(sipat.id, basePath, canEditThemes);
      setNotice(copied ? 'Link copiado. Quem abrir entra com o seu login e cai neste treinamento.' : `Link do treinamento: ${link}`);
    } catch (failure) { setError(getErrorMessage(failure)); }
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
      setNotice(result.created > 0 ? `Treinamento publicado: ${pluralize(result.created, 'dia entregue', 'dias entregues')} aos participantes.` : 'Treinamento atualizado. Os dias que já tinham progresso ficaram como estavam.');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  async function endThis() {
    if (!sipat) return;
    setConfirmingEnd(false);
    setBusy(true); setError('');
    try {
      const cancelled = await cancelSipatEvent(sipat.id);
      setSipat(cancelled); setDirty(false);
      setNotice('Treinamento encerrado.');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  /** Starts from a template of the operation: each of its Títulos becomes a day, with its videos; the dates follow the start chosen, or stay open. */
  function copyFromTemplate(source: PlatformCourse) {
    if (!catalog) return;
    setCopying(false);
    const base = isValidDate(startDate) ? startDate : firstDate;
    const known = (ids: string[]) => ids.filter(id => catalog.videos.has(id));
    setDays(titlesOf(source).slice(0, maxDays).map((title, index) => dayFromTitle(index, base ? addDays(base, index) : '', title.title, known(title.videoIds))));
    setStage('grid'); setDirty(true);
    setNotice(`Dias copiados de "${source.title}". Confira as datas e os vídeos antes de salvar.`);
  }

  async function copyFrom(sourceId: string) {
    setCopying(false);
    setBusy(true); setError('');
    try {
      let target = sipat?.id;
      if (!target) {
        const first = isValidDate(startDate) ? startDate : new Date().toISOString().slice(0, 10);
        const created = await createTraining({ title: name.trim() || `SIPAT ${new Date().getFullYear()}`, description: null, startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(first, 1)}T00:00:00.000Z` });
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

  if (loading) return <LoadingState>Carregando o treinamento...</LoadingState>;
  if (!catalog) {
    return <Page><div className="grid justify-items-start gap-3">
      <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error || 'Não foi possível carregar o catálogo.'}</p>
      <Button onClick={() => void load()} variant="outline">Tentar novamente</Button>
    </div></Page>;
  }

  // every plan builds its own training (sipatonline.com.br/plans.html); Bronze takes the ready modules as they are, each
  // day one module whole (or a ready SIPAT whole): a grid of its own, video by video, is Prata and above
  const canCustomizeGrid = capabilities?.customizeGrid !== false;
  const readySipats = trainings.filter(item => item.isReadySipat);
  const sources = others.filter(item => item.id !== sipat?.id && (plans.find(plan => plan.sipatEventId === item.id)?.days ?? 0) > 0);
  // the operation's templates to start from, beside the company's own trainings (Bronze: only the ready SIPATs, which come whole)
  const templateSources = (canCustomizeGrid ? trainings : readySipats).filter(item => titlesOf(item).length > 0);
  const canCopy = sources.length > 0 || templateSources.length > 0;
  const label = sipat ? phaseLabel[sipatPhase(sipat, days.filter(day => day.videos.some(Boolean)).length)] : null;
  // the name is edited in the title itself, while the SIPAT is a draft; after publishing it stays as it is
  const canRename = !template && stage === 'grid' && !cancelled && (sipat === null || sipat.status === 'Draft');
  const nameMissing = showIssues && !!issues.name;
  const showNameInput = canRename && (editingName || nameMissing);
  const exportCsv = () => download(`${(name || 'sipat').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`, planToCsv(days, catalog));

  return <Page className="builder-page">
    <header className="ops-hero max-[760px]:gap-4! max-[760px]:px-4! max-[760px]:pt-3! max-[760px]:pb-4!" data-slot="page-header">
      <div className="ops-hero-copy max-[760px]:gap-2!">
        <Link className="ops-hero-back max-[760px]:-mb-1! max-[760px]:min-h-11" to={basePath}><ArrowLeft aria-hidden="true" /> Todos os treinamentos</Link>
        <p className="ops-hero-eyebrow">{template ? 'Template' : 'Treinamento'}</p>
        <div className="flex flex-wrap items-center gap-3 max-[760px]:min-w-0 max-[760px]:basis-full max-[760px]:gap-x-2 max-[760px]:gap-y-1.5">
          {showNameInput
            ? <Input aria-invalid={nameMissing} aria-label="Nome do treinamento" autoFocus className="ops-hero-title h-auto w-[min(100%,28rem)] border-dashed bg-transparent px-2 py-1 max-[760px]:text-[1.5rem]!"
              data-name-issue={nameMissing ? true : undefined} maxLength={200} onBlur={() => setEditingName(false)}
              onChange={event => { setName(event.target.value); setDirty(true); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }}
              placeholder="Ex.: SIPAT 2026" value={name} />
            : <h1 className="ops-hero-title max-[760px]:text-[1.5rem]!">{isNew && stage === 'setup' ? 'Novo treinamento' : name || 'Treinamento'}</h1>}
          {canRename && !showNameInput && <Button aria-label="Renomear o treinamento" className="max-[760px]:-my-1.5 max-[760px]:size-11 max-[760px]:min-h-11" onClick={() => setEditingName(true)} size="icon-sm" variant="ghost"><Pencil /></Button>}
          {label && <Badge variant={label.variant}>{label.text}</Badge>}
          {template && <Badge variant="outline">Sem empresa</Badge>}
          {canAutoSave && autoSave === 'saving'
            ? <Badge variant="outline">Salvando...</Badge>
            : dirty
              ? <Badge variant="outline">{canAutoSave ? (autoSave === 'failed' ? 'Não foi possível salvar sozinho: use Salvar rascunho' : 'Salvando em instantes...') : 'Alterações não salvas'}</Badge>
              : canAutoSave && autoSave === 'saved' && <Badge variant="outline">Rascunho salvo automaticamente</Badge>}
          {stage === 'grid' && sipat && sipat.status === 'Published' && <span className="text-xs text-muted-foreground">O nome fica fixo depois de publicado.</span>}
        </div>
        <p className="ops-hero-lead is-keep max-[760px]:text-[0.875rem]! max-[760px]:leading-[1.45]">{stage === 'setup' ? 'Defina quando começa, quantos dias tem e o assunto de cada dia.' : <>
          <span className="max-[760px]:hidden">{canCustomizeGrid
            ? 'Cada coluna é um dia. Arraste um título ou vídeos da lista para cada dia e confira o tempo.'
            : 'Cada coluna é um dia. Arraste um módulo pronto da lista para cada dia e confira o tempo.'}</span>
          <span className="hidden max-[760px]:inline">{canCustomizeGrid ? 'Escolha um assunto para cada dia e confira os vídeos e os jogos.' : 'Escolha um módulo pronto para cada dia e confira o tempo.'}</span>
        </>}</p>
        {stage === 'grid' && <ul aria-label="Resumo do treinamento" className="ops-hero-stats max-[760px]:mt-1! max-[760px]:grid! max-[760px]:basis-full max-[760px]:grid-cols-2 max-[760px]:gap-2! max-[760px]:*:min-w-0 max-[760px]:*:flex-wrap max-[760px]:*:rounded-xl max-[760px]:*:bg-muted max-[760px]:*:px-3 max-[760px]:*:py-2 max-[760px]:*:text-sm">
          <li><strong>{days.length}</strong> {days.length === 1 ? 'dia' : 'dias'}</li>
          <li><Film aria-hidden="true" /><strong>{totals.videos}</strong> {totals.videos === 1 ? 'vídeo' : 'vídeos'}{extrasSuffix(totals.extras)}</li>
          <li><Gamepad2 aria-hidden="true" /><strong>{totals.games}</strong> {totals.games === 1 ? 'jogo' : 'jogos'}</li>
          <li><Clock aria-hidden="true" />{totals.time > 0 ? formatSpan(totals.time) : 'sem vídeos'}</li>
        </ul>}
        {/* when it runs: from its first day to its limit date, which can go past the last day */}
        {stage === 'grid' && <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Início
            <Input aria-label="Início do treinamento" className="h-9 w-auto text-sm" disabled={busy} onChange={event => moveStart(event.target.value)} type="date" value={firstDate} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Data limite
            <Input aria-label="Data limite do treinamento" className="h-9 w-auto text-sm" disabled={busy || !lastDate} min={lastDate || undefined}
              onChange={event => { setLimit(event.target.value); setDirty(true); }} type="date" value={shownLimit} />
          </label>
          <p className="m-0 max-w-sm pb-1.5 text-xs text-muted-foreground">O treinamento pode ser feito até a data limite, mesmo depois do último dia.</p>
        </div>}
        {/* who it is for: the whole company, or the units and sectors marked */}
        {stage === 'grid' && sipat && !cancelled && <AudienceRow canEdit openAtStart={search.get('para-quem') === '1'} sipatId={sipat.id} />}
      </div>
      {stage === 'grid' && <div className="ops-hero-actions max-[760px]:grid! max-[760px]:w-full max-[760px]:grid-cols-[auto_minmax(0,1fr)] max-[760px]:gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button className={phoneAction} disabled={busy} variant="ghost"><MoreHorizontal /> Mais</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {canCopy && <DropdownMenuItem onSelect={() => setCopying(true)}><Copy /> Duplicar de outro treinamento</DropdownMenuItem>}
            <DropdownMenuItem disabled={days.length === 0} onSelect={exportCsv}><FileDown /> Exportar CSV</DropdownMenuItem>
            {sipat && <DropdownMenuItem onSelect={() => coverPicker.current?.click()}><ImagePlus /> Capa do treinamento</DropdownMenuItem>}
            {sipat && !cancelled && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmingEnd(true)} variant="destructive"><Ban /> Encerrar este treinamento</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* a published training: saving also delivers the days to the participants (the days someone started stay as they are) */}
        <Button className={phoneAction} disabled={busy || !dirty} onClick={() => void (published ? publish() : save())} variant="outline"><Save /> {template ? 'Salvar' : published ? 'Salvar alterações' : 'Salvar rascunho'}</Button>
        {/* the pencil: this same training in the video editor (títulos, player, questions, cover) */}
        {published && <Button className={phoneAction} disabled={busy} onClick={() => void share()} variant="outline"><Link2 /> Copiar link</Button>}
        <Button className={cn(phoneAction, heroTonal, 'max-[760px]:hidden')} disabled={busy || days.length === 0} onClick={() => void editWeek()} variant="outline"><Pencil /> Editar treinamento</Button>
        {/* published: the main action is to see it as the participant does; a draft still has to be published */}
        {(!template && !cancelled && !published)
          ? <>
            <Button className={cn(phoneAction, heroTonal)} disabled={days.length === 0} onClick={() => setPreviewing(true)} variant="outline"><Eye /> Visão do participante</Button>
            <Button className={cn('ops-primary', phoneAction, 'max-[760px]:col-span-full max-[760px]:min-h-12 max-[760px]:text-base')} disabled={busy || days.length === 0} onClick={() => { if (checkIssues()) setConfirmingLaunch(true); }}><Rocket /> Publicar</Button>
          </>
          : <Button className={cn('ops-primary', phoneAction, 'max-[760px]:col-span-full max-[760px]:min-h-12 max-[760px]:text-base')} disabled={days.length === 0} onClick={() => setPreviewing(true)}><Eye className={previewEye} /> Visão do participante</Button>}
      </div>}
    </header>

    <input accept="image/png,image/jpeg,image/webp" aria-label="Capa do treinamento" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void changeCover(file); }} ref={coverPicker} tabIndex={-1} type="file" />
    {cancelled && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">Este treinamento está encerrado: os participantes não o veem. Você pode editá-lo; para publicar de novo, reative-o na lista de treinamentos.</p>}
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {showIssues && issueCount > 0 && stage === 'grid' && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">
      {issues.name ? 'Dê um nome ao treinamento. ' : ''}
      {Object.keys(issues.days).length > 0 && `${pluralize(Object.keys(issues.days).length, 'dia precisa', 'dias precisam')} de ajuste antes de salvar. Eles estão marcados em vermelho na grade.`}
    </p>}
    {!canCustomizeGrid && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
      Plano {capabilities?.plan ?? 'Bronze'}: cada dia é um módulo pronto, com todos os seus vídeos. Escolha o assunto de cada dia; montar a grade vídeo a vídeo começa no plano Prata.
    </p>}
    {catalog.subjects.length === 0 && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">O acervo ainda não tem assuntos publicados. Peça à operação para publicar os assuntos.</p>}

    {stage === 'setup'
      ? <BuilderSetup dayCount={dayCount} name={name} onDayCount={setDayCount} limit={limit} onLimit={setLimit} onName={setName} onStart={start}
        onStartDate={setStartDate} startDate={startDate}
        onCopy={canCopy ? () => setCopying(true) : undefined}
        onTraining={setTraining} training={training} wholeModules={!canCustomizeGrid}
        trainings={(canCustomizeGrid ? trainings : readySipats).map(item => ({ id: item.id, title: item.title, titles: titlesOf(item).length }))} />
      : <BuilderGrid canCustomizeGrid={canCustomizeGrid} canEditThemes={canEditThemes} catalog={catalog} days={days} issues={showIssues ? issues.days : undefined}
        onChange={edit} onRemoveDay={removeDay}
        onEdit={() => { if (!busy) void editWeek(); }}
        // every day has its own "Enviar vídeo", for a company that has its own videos (Diamante)
        arriving={arriving} onSendToDay={capabilities?.internalVideos ? (dayKey, files) => void sendToDay(dayKey, files) : undefined}
        // a game edited or duplicated from the board: its name and texts come again with the catalog
        onGamesChanged={async message => { applyContent(await fetchContent()); setNotice(message); }}
        template={template} />}

    {copying && <Dialog description="Escolha o treinamento de onde vêm os assuntos. Os dias são copiados para este rascunho e as datas ficam em aberto." onClose={() => setCopying(false)} title="Duplicar de outro treinamento">
      <div className="grid max-h-[60vh] gap-4 overflow-auto">
      {sources.length > 0 && <section className="grid gap-2">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{template ? 'Treinamentos' : 'Da empresa'}</h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {sources.map(item => {
          const plan = plans.find(entry => entry.sipatEventId === item.id);
          return <li key={item.id}>
            <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary" onClick={() => void copyFrom(item.id)} type="button">
              <span className="grid"><strong className="text-sm">{item.title}</strong>
                <span className="text-xs text-muted-foreground">{new Date(item.startsAt).getUTCFullYear()} · {plan ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}` : ''}</span></span>
              <Badge variant={phaseLabel[sipatPhase(item, plan?.days ?? 0)].variant}>{phaseLabel[sipatPhase(item, plan?.days ?? 0)].text}</Badge>
            </button>
          </li>;
        })}
      </ul>
      </section>}
      {templateSources.length > 0 && <section className="grid gap-2">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Templates da operação</h3>
        <ul className="m-0 grid list-none gap-2 p-0">
          {templateSources.map(item => <li key={item.id}>
            <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary" onClick={() => copyFromTemplate(item)} type="button">
              <span className="grid"><strong className="text-sm">{item.title}</strong>
                <span className="text-xs text-muted-foreground">{pluralize(titlesOf(item).length, 'dia', 'dias')} · {pluralize(item.videos.length, 'vídeo', 'vídeos')}</span></span>
              <Badge variant="outline">Template</Badge>
            </button>
          </li>)}
        </ul>
      </section>}
      </div>
      <DialogActions><Button onClick={() => setCopying(false)} variant="outline">Cancelar</Button></DialogActions>
    </Dialog>}

    {(notice || removed) && <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 grid -translate-x-1/2 justify-items-center gap-2 max-[760px]:right-4 max-[760px]:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] max-[760px]:left-4 max-[760px]:translate-x-0 max-[760px]:*:w-full max-[760px]:*:justify-between">
      {notice && <div className="builder-undo pointer-events-auto flex items-center gap-3 rounded-xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-overlay" role="status">
        <span>{notice}</span>
        <Button aria-label="Fechar aviso" className="text-background/80 hover:bg-background/15 hover:text-background" onClick={() => setNotice('')} size="icon-sm" variant="ghost"><X /></Button>
      </div>}
      {removed && <div className="builder-undo pointer-events-auto flex items-center gap-3 rounded-xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-overlay" role="status">
        <span>{removed.day.title.trim() ? `"${removed.day.title.trim()}" removido.` : `${partWord(days.map(day => day.date))} ${removed.index + 1} removido.`}</span>
        <Button className="bg-background/15 text-background hover:bg-background/25 hover:text-background" onClick={undoRemove} size="sm" variant="ghost"><Undo2 /> Desfazer</Button>
        <Button aria-label="Fechar aviso" className="text-background/80 hover:bg-background/15 hover:text-background" onClick={() => setRemoved(null)} size="icon-sm" variant="ghost"><X /></Button>
      </div>}
    </div>}

    {previewing && <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-[rgb(11_36_31/0.55)] animate-overlay-in"><LoadingState>Abrindo a prévia...</LoadingState></div>}>
      <TrainingPreview catalog={catalog} days={days} games={capabilities?.quizzes !== false} name={name} onClose={() => setPreviewing(false)} word={partWord(days.map(day => day.date))} />
    </Suspense>}

    {confirmingEnd && sipat && <Dialog description="Ele deixa de aparecer para os participantes e fica bloqueado para edição. Dá para reativá-lo depois na lista de treinamentos."
      onClose={() => setConfirmingEnd(false)} title={`Encerrar "${sipat.title}"?`}>
      <DialogActions>
        <Button onClick={() => setConfirmingEnd(false)} variant="outline">Voltar</Button>
        <Button onClick={() => void endThis()} variant="destructive"><Ban /> Encerrar treinamento</Button>
      </DialogActions>
    </Dialog>}

    {leavingTo && <Dialog description="As alterações deste treinamento ainda não foram salvas. Se sair agora, elas se perdem." onClose={() => setLeavingTo(null)} title="Sair sem salvar?">
      <DialogActions>
        <Button onClick={() => setLeavingTo(null)} variant="outline">Continuar editando</Button>
        <Button onClick={() => { const to = leavingTo; setDirty(false); setLeavingTo(null); navigate(to); }} variant="destructive">Sair sem salvar</Button>
        <Button disabled={busy} onClick={() => { const to = leavingTo; setLeavingTo(null); void save().then(id => { if (id) navigate(to); }); }}><Save /> Salvar e sair</Button>
      </DialogActions>
    </Dialog>}

    {confirmingLaunch && <Dialog description={published
      ? 'Os dias que ninguém começou são atualizados com os assuntos atuais. Os que já têm progresso ficam como estão.'
      : 'Ao publicar, cada dia é entregue aos participantes ativos da empresa.'}
      onClose={() => setConfirmingLaunch(false)} title={published ? 'Atualizar os dias do treinamento?' : 'Publicar o treinamento?'}>
      <DialogActions>
        <Button onClick={() => setConfirmingLaunch(false)} variant="outline">Voltar</Button>
        <Button onClick={() => void publish()}><Rocket /> {published ? 'Atualizar' : 'Publicar agora'}</Button>
      </DialogActions>
    </Dialog>}
  </Page>;
}
