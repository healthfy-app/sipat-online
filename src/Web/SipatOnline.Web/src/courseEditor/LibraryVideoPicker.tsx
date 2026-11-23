import { Film, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isExtra, listSubjects, listVideoSubjects, type PlatformLibraryVideo } from '@/api';
import { Input, NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDuration } from './courseFormat';

/** The first frame of a house video, loaded only when the tile scrolls into view; YouTube has its own picture. */
function Thumb({ item }: { item: PlatformLibraryVideo }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { video } = item;
  const youtube = video.provider === 'YouTube' && video.externalId;
  return <div className="relative grid aspect-video place-items-center overflow-hidden bg-[#0b1f19] text-white/60" ref={ref}>
    {visible && (youtube
      ? <img alt="" className="size-full object-cover" loading="lazy" src={`https://i.ytimg.com/vi/${video.externalId}/mqdefault.jpg`} />
      : !isExtra(video) && video.fileUrl
        ? <video className="pointer-events-none size-full object-cover" muted playsInline preload="metadata" src={`${video.fileUrl}#t=1`} />
        : <Film aria-hidden="true" className="size-6" />)}
    {video.durationMilliseconds > 0 && <span aria-hidden="true" className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[0.625rem] font-semibold tabular-nums text-white">{formatDuration(video.durationMilliseconds)}</span>}
  </div>;
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

/**
 * Every library video as small tiles with its picture and name, to see and pick one; a search and the assunto filter
 * narrow the list.
 */
export default function LibraryVideoPicker({ videos, value, onChange }: {
  videos: PlatformLibraryVideo[]; value: string; onChange: (videoId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>([]);
  const [videoSubjects, setVideoSubjects] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    Promise.all([listSubjects(), listVideoSubjects()]).then(([list, links]) => {
      setSubjects(list.map(item => ({ id: item.id, title: item.name })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
      setVideoSubjects(new Map(links.map(item => [item.videoId, item.subjectIds])));
    }, () => undefined);
  }, []);

  const shown = useMemo(() => videos.filter(item => {
    if (query.trim() && !normalize(item.video.title).includes(normalize(query.trim()))) return false;
    if (!subject) return true;
    const ids = videoSubjects.get(item.video.id) ?? [];
    return subject === 'none' ? ids.length === 0 : ids.includes(subject);
  }), [videos, query, subject, videoSubjects]);

  return <div className="grid gap-3">
    <div className="flex flex-wrap gap-2">
      <label className="relative flex min-w-0 flex-[1_1_12rem] items-center text-muted-foreground">
        <Search className="pointer-events-none absolute left-3 size-4" />
        <Input aria-label="Buscar na biblioteca" className="pl-9" onChange={event => setQuery(event.target.value)} placeholder="Buscar vídeo" type="search" value={query} />
      </label>
      {subjects.length > 0 && <NativeSelect aria-label="Filtrar por assunto" className="w-auto min-w-0 flex-[1_1_10rem]" onChange={event => setSubject(event.target.value)} value={subject}>
        <option value="">Todos os assuntos</option>
        <option value="none">Sem assunto</option>
        {subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </NativeSelect>}
    </div>
    <div aria-label="Vincular da biblioteca" className="grid max-h-[46vh] grid-cols-3 content-start gap-2 overflow-y-auto pr-0.5 max-[640px]:grid-cols-2" role="listbox">
      {shown.length === 0 && <p className="col-span-full m-0 py-4 text-center text-sm text-muted-foreground">Nenhum vídeo encontrado.</p>}
      {shown.map(item => {
        const picked = item.video.id === value;
        return <button aria-label={item.video.title} aria-selected={picked} className={cn('grid min-h-0 content-start gap-1 overflow-hidden rounded-md border bg-card p-0 text-left transition-colors hover:border-primary',
          picked ? 'border-primary ring-2 ring-primary' : 'border-border')} key={item.video.id} onClick={() => onChange(picked ? '' : item.video.id)} role="option" type="button">
          <Thumb item={item} />
          <span className="line-clamp-2 px-1.5 pb-1.5 text-[0.6875rem] font-semibold leading-tight" title={item.video.title}>{item.video.title}</span>
        </button>;
      })}
    </div>
  </div>;
}
