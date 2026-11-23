import { CloudUpload, Link2, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  deletePlatformVideo, listPlatformCompanies, listSubjects, listPlatformLibraryVideos, listVideoCompanies, listVideoSubjects, setVideoSubjects,
  type PlatformLibraryVideo,
} from '@/api';
import type { SubjectOption } from '@/courseCatalog/VideoLibraryPanel';
import AssociateVideosDialog, { type Choice } from './AssociateVideosDialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Page } from '@/components/ui/page';
import { filterVideos } from '@/courseCatalog/catalogFilters';
import VideoLibraryPanel from '@/courseCatalog/VideoLibraryPanel';
import { VideoUploadForm } from '@/courseEditor/CourseMediaForms';
import { formatBytes, getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import { onVideoUploaded } from '@/videoUploads/uploadQueue';
import '@/OpsIdentity.css';
import '@/PlatformCourses.css';

/**
 * The platform's video library, apart from the content (subjects, games, plans) that uses the videos.
 * Videos can be dropped anywhere on the page: they open the upload with the files already picked.
 */
export default function VideoLibraryPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [library, setLibrary] = useState<PlatformLibraryVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [upload, setUpload] = useState<{ files: File[] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [videoSubjects, setVideoSubjectMap] = useState<Map<string, string[]>>(new Map());
  // '' every video, 'none' those without an assunto, or one assunto
  const subjectFilter = params.get('assunto') ?? '';
  const [companies, setCompanies] = useState<Choice[]>([]);
  const [videoCompanies, setVideoCompanyMap] = useState<Map<string, string[]>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [associating, setAssociating] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      // the assuntos come apart: the videos still show if they fail
      Promise.all([listSubjects(), listVideoSubjects()]).then(([list, links]) => {
        setSubjects(list.map(item => ({ id: item.id, title: item.name })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
        setVideoSubjectMap(new Map(links.map(item => [item.videoId, item.subjectIds])));
      }, () => undefined);
      Promise.all([listPlatformCompanies(), listVideoCompanies()]).then(([list, rows]) => {
        setCompanies(list.map(company => ({ id: company.id, title: company.name })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
        setVideoCompanyMap(new Map(rows.map(item => [item.videoId, item.companyIds])));
      }, () => undefined);
      setLibrary(await listPlatformLibraryVideos());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // each video the background upload finishes shows up here; many close together cause one reload
  useEffect(() => {
    let timer: number | undefined;
    const stop = onVideoUploaded(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        listPlatformLibraryVideos().then(setLibrary, () => undefined);
      }, 1500);
    });
    return () => { stop(); window.clearTimeout(timer); };
  }, []);

  // while a video is converting, reload quietly until it is ready (or failed)
  const hasProcessing = library.some((item) => item.video.status === 'Processing');
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => {
      listPlatformLibraryVideos().then(setLibrary, () => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [hasProcessing]);

  const shown = useMemo(() => filterVideos(library, query).filter(item => {
    if (!subjectFilter) return true;
    const ids = videoSubjects.get(item.video.id) ?? [];
    return subjectFilter === 'none' ? ids.length === 0 : ids.includes(subjectFilter);
  }), [library, query, subjectFilter, videoSubjects]);

  const allShownSelected = shown.length > 0 && shown.every((item) => selected.has(item.video.id));
  const privateTo = useMemo(() => {
    const names = new Map(companies.map((company) => [company.id, company.title]));
    return new Map([...videoCompanies].map(([videoId, ids]) => [videoId, ids.map((id) => names.get(id) ?? 'empresa removida')]));
  }, [companies, videoCompanies]);

  async function changeSubjects(videoId: string, subjectIds: string[]) {
    const before = videoSubjects.get(videoId) ?? [];
    setVideoSubjectMap(current => new Map(current).set(videoId, subjectIds));
    try {
      await setVideoSubjects(videoId, subjectIds);
    } catch (saveError) {
      setVideoSubjectMap(current => new Map(current).set(videoId, before));
      setError(getErrorMessage(saveError));
    }
  }

  function setSubjectFilter(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set('assunto', value); else next.delete('assunto');
      return next;
    }, { replace: true });
  }
  const totalBytes = library.reduce((sum, item) => sum + (item.video.sizeBytes ?? 0), 0);
  const processing = library.filter((item) => item.video.status === 'Processing').length;
  const unused = library.filter((item) => item.video.status === 'Ready' && item.courseCount === 0).length;

  function setQuery(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set('q', value); else next.delete('q');
      return next;
    }, { replace: true });
  }

  async function removeVideo(item: PlatformLibraryVideo) {
    const usage = item.courseCount > 0 ? ` Ele está em ${pluralize(item.courseCount, 'treinamento', 'treinamentos')}.` : '';
    if (!window.confirm(`Excluir o vídeo "${item.video.title}"?${usage} O arquivo é apagado e isso não pode ser desfeito.`)) return;
    setError('');
    setNotice('');
    setIsDeleting(true);
    try {
      await deletePlatformVideo(item.video.id);
      await refresh();
      setNotice(`O vídeo "${item.video.title}" foi excluído.`);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  /** Deletes the checked videos one by one; one that cannot go (in use, for instance) stays checked and is reported. */
  async function removeSelected() {
    const items = library.filter((item) => selected.has(item.video.id));
    const inUse = items.filter((item) => item.courseCount > 0).length;
    const usage = inUse > 0 ? ` ${pluralize(inUse, 'deles está', 'deles estão')} em treinamentos.` : '';
    if (!window.confirm(`Excluir ${pluralize(items.length, 'vídeo', 'vídeos')}?${usage} Os arquivos são apagados e isso não pode ser desfeito.`)) return;
    setError(''); setNotice(''); setIsDeleting(true);
    const failed: string[] = [];
    let firstError = '';
    for (const item of items) {
      try {
        await deletePlatformVideo(item.video.id);
      } catch (deleteError) {
        failed.push(item.video.id);
        firstError ||= `"${item.video.title}": ${getErrorMessage(deleteError)}`;
      }
    }
    setSelected(new Set(failed));
    await refresh();
    setIsDeleting(false);
    const done = items.length - failed.length;
    if (done > 0) setNotice(`${pluralize(done, 'vídeo excluído', 'vídeos excluídos')}.`);
    if (failed.length > 0) setError(`${failed.length === 1 ? '1 vídeo não pôde ser excluído e continua selecionado' : `${failed.length} vídeos não puderam ser excluídos e continuam selecionados`}. ${firstError}`);
  }

  function hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  return (
    <Page
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event) || upload) return;
        event.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setIsDragging(false);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event) || upload) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!hasFiles(event) || upload) return;
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        setUpload({ files: Array.from(event.dataTransfer.files) });
      }}
    >
      <header className="ops-hero" data-slot="page-header">
        <div className="ops-hero-copy">
          <p className="ops-hero-eyebrow">Acervo da plataforma</p>
          <h1 className="ops-hero-title">Biblioteca de vídeos</h1>
          <p className="ops-hero-lead">
            {[
              pluralize(library.length, 'vídeo', 'vídeos'),
              totalBytes > 0 ? formatBytes(totalBytes) : '',
              processing > 0 ? `${processing} em conversão` : '',
              unused > 0 ? `${unused} sem treinamento` : '',
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="ops-hero-actions">
          <Button className="ops-primary" onClick={() => setUpload({ files: [] })}><Plus /> Enviar vídeos</Button>
        </div>
      </header>

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>
          <Button disabled={isLoading} onClick={() => void refresh()} variant="outline">Tentar novamente</Button>
        </div>
      )}
      {notice && <p className="m-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground" role="status">{notice}</p>}

      {library.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5" role="search">
          <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 size-4" />
            <Input aria-label="Buscar vídeo" className="pl-9" onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar vídeo por nome" type="search" value={query} />
          </label>
          <NativeSelect aria-label="Filtrar por assunto" className="w-auto max-w-xs" onChange={(event) => setSubjectFilter(event.target.value)} value={subjectFilter}>
            <option value="">Todos os assuntos</option>
            <option value="none">Sem assunto</option>
            {subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </NativeSelect>
          <span className="text-sm text-muted-foreground tabular-nums">
            <span>{query.trim() ? `${shown.length} de ${library.length}` : pluralize(library.length, 'vídeo', 'vídeos')}</span>
            {totalBytes > 0 && <> · <span title="Soma do tamanho de todos os vídeos da biblioteca">{formatBytes(totalBytes)} no total</span></>}
          </span>
          <span className="ml-auto text-xs text-muted-foreground max-[640px]:hidden">Dica: arraste vídeos para esta página para enviar.</span>
        </div>
      )}

      {shown.length > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-card max-[640px]:-mx-1">
          <label className="m-0 flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input aria-label="Selecionar todos os vídeos" checked={allShownSelected} className="size-5 accent-[var(--brand-primary)]"
              onChange={(event) => setSelected(event.target.checked ? new Set(shown.map((item) => item.video.id)) : new Set())} type="checkbox" />
            {selected.size > 0 ? pluralize(selected.size, 'selecionado', 'selecionados') : 'Selecionar todos'}
          </label>
          {selected.size > 0 && <Button aria-label="Limpar seleção" onClick={() => setSelected(new Set())} size="icon-sm" title="Limpar seleção" variant="ghost"><X /></Button>}
          <Button className="ml-auto max-[640px]:ml-0 max-[640px]:flex-1" disabled={selected.size === 0 || isDeleting} onClick={() => void removeSelected()} variant="outline">
            <Trash2 /> Excluir
          </Button>
          <Button className="max-[640px]:flex-[2]" disabled={selected.size === 0 || isDeleting} onClick={() => setAssociating(true)}>
            <Link2 /> Associar a assunto ou empresa
          </Button>
        </div>
      )}

      {isLoading
        ? <LoadingState className="list-state">Carregando vídeos...</LoadingState>
        : <VideoLibraryPanel busy={isDeleting} hasVideos={library.length > 0} library={shown}
            onClearFilters={() => { setQuery(''); setSubjectFilter(''); }} onDelete={(item) => void removeVideo(item)} onUpload={() => setUpload({ files: [] })}
            onSubjects={(videoId, ids) => void changeSubjects(videoId, ids)} subjects={subjects} videoSubjects={videoSubjects}
            onSelect={(videoId, checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(videoId); else next.delete(videoId); return next; })}
            privateTo={privateTo} selected={selected} />}

      {associating && (
        <AssociateVideosDialog companies={companies} onClose={() => setAssociating(false)} subjects={subjects}
          videoCompanies={videoCompanies} videoIds={[...selected]} videoSubjects={videoSubjects}
          onSaved={async (message) => {
            setAssociating(false);
            setSelected(new Set());
            await refresh();
            setNotice(message);
          }} />
      )}

      {isDragging && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-primary/10 p-6 backdrop-blur-[2px]">
          <div className="grid justify-items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-overlay">
            <span className="grid size-14 place-items-center rounded-full bg-accent text-primary"><CloudUpload className="size-7" /></span>
            <strong className="text-lg">Solte para enviar os vídeos</strong>
            <span className="text-sm text-muted-foreground">MP4 ou WebM, até 2 GB cada</span>
          </div>
        </div>
      )}

      {upload && (
        <Dialog onClose={() => setUpload(null)} title="Enviar vídeos">
          <VideoUploadForm initialFiles={upload.files} onQueued={(count) => {
            setUpload(null);
            setError('');
            setNotice(count === 1
              ? 'O vídeo entrou na fila de envio. Acompanhe o progresso no canto da tela.'
              : `${count} vídeos entraram na fila de envio. Acompanhe o progresso no canto da tela.`);
          }} />
        </Dialog>
      )}
    </Page>
  );
}
