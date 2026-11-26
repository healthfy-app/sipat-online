import { Building2, CalendarDays, CircleSlash, Copy, Ellipsis, Film, ImagePlus, Link2, Pencil, RotateCcw, Send, Trash2, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const iconAction = 'grid size-9 min-h-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 data-[state=open]:bg-muted [&_svg]:size-4';

export interface TrainingCardProps {
  title: string;
  /** Where it stands, over the cover. */
  phase: { text: string; variant: 'default' | 'success' | 'warning' | 'neutral' | 'outline' };
  cover: string | null;
  /** Whose it is, in the operation's list: a company's name, or "Template". */
  owner?: string;
  /** "24/11 a 27/11"; absent when it has no dates (a template). */
  period?: string | null;
  /** "5 dias · 10 vídeos · 51 min". */
  stats: string;
  /** Who it is for, when it is not the whole company. */
  audience?: string | null;
  /** Ended: the card goes quiet, and keeps its actions. */
  ended?: boolean;
  /** Out for the participants right now. */
  live?: boolean;
  busy?: boolean;
  /** The days of the training: where the card and "Abrir" lead. */
  openTo: string;
  onEdit?: () => void;
  editLabel?: string;
  onShare?: () => void;
  onDuplicate?: () => void;
  onCover?: (image: File) => void;
  onPublish?: () => void;
  onEnd?: () => void;
  onReactivate?: () => void;
  onDelete?: () => void;
  /** More to say under the stats (a category, a mark). */
  children?: ReactNode;
}

/**
 * A training in a list, the same in the operation's Conteúdos and in a company's: the cover with where it stands, its
 * period and how much it has. The card opens its days; the pencil opens it in the video editor; the menu holds what
 * changes where it stands (publish, end, bring back) and deleting.
 */
export default function TrainingCard({
  title, phase, cover, owner, period, stats, audience, ended = false, live = false, busy = false, openTo,
  onEdit, editLabel = 'Editar treinamento', onShare, onDuplicate, onCover, onPublish, onEnd, onReactivate, onDelete, children,
}: TrainingCardProps) {
  const hasMenu = !!(onPublish || onEnd || onReactivate || onDelete);
  return <div className={cn('group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] border bg-card shadow-[0_1px_2px_rgb(18_51_44/0.05)] transition-[box-shadow,transform,border-color] duration-200 ease-out-soft hover:-translate-y-1 hover:border-[#12332c] hover:shadow-[0_18px_34px_-18px_rgb(18_51_44/0.5)] motion-reduce:hover:translate-y-0',
    ended ? 'border-dashed border-border bg-muted/40' : live ? 'border-primary/40' : 'border-[#dfe6e3]')}>
    <Link aria-label={`Abrir ${title}`} className={cn('flex flex-1 flex-col text-foreground no-underline', ended && 'opacity-70 grayscale')} to={openTo}>
      <div className="relative aspect-video overflow-hidden bg-[#12332c] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-1/3 after:bg-gradient-to-t after:from-[rgb(11_36_31/0.45)] after:to-transparent after:content-['']">
        {cover
          ? <img alt="" className="block size-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03] motion-reduce:group-hover:scale-100" decoding="async" loading="lazy" src={cover} />
          // no photo yet: the name on the training's own color, instead of a stock picture that is the same on every card
          : <span aria-hidden="true" className="grid size-full place-items-center px-6 text-center text-xl leading-tight font-extrabold tracking-[-0.01em] text-white/90"><span className="line-clamp-3">{title}</span></span>}
        <Badge className="absolute left-3 top-3 z-10" variant={phase.variant}>{phase.text}</Badge>
      </div>
      <div className="grid flex-1 content-start gap-1.5 px-5 pb-3 pt-4">
        {owner && <span className="inline-flex w-fit items-center gap-1 rounded-[0.3125rem] bg-accent px-1.5 text-[0.6875rem] font-bold text-primary"><Building2 aria-hidden="true" className="size-3" />{owner}</span>}
        <h3 className="m-0 line-clamp-2 min-h-[2.7em] text-[1.0625rem] font-extrabold leading-[1.3] tracking-[-0.01em] text-[#12332c]">{title}</h3>
        {period && <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] tabular-nums text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-4" />{period}
        </p>}
        <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] tabular-nums text-muted-foreground">
          <Film aria-hidden="true" className="size-4" />{stats}
        </p>
        {audience && <p className="m-0 flex items-start gap-1.5 text-[0.8125rem] font-medium text-primary">
          <Users aria-hidden="true" className="mt-px size-4 shrink-0" /><span className="line-clamp-2">{audience}</span>
        </p>}
        {children}
      </div>
    </Link>
    {/* the cover is changed right on the card: a quiet button over the picture, in view on the card under the pointer */}
    {onCover && <label className={cn('absolute top-3 right-3 z-10 m-0 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-sm transition-opacity hover:bg-black/75 focus-within:opacity-100 group-hover:opacity-100 max-[760px]:opacity-100',
      cover ? 'opacity-0' : 'opacity-100', busy && 'pointer-events-none opacity-50')}>
      <ImagePlus aria-hidden="true" className="size-3.5" /> {cover ? 'Trocar capa' : 'Adicionar capa'}
      <input accept="image/png,image/jpeg,image/webp" aria-label={`Capa de ${title}`} className="sr-only"
        onChange={input => { const file = input.target.files?.[0]; input.target.value = ''; if (file) onCover(file); }} type="file" />
    </label>}
    <footer className="mt-1 flex items-center gap-1 border-t border-[#dfe6e3] px-4 py-3">
      <Link aria-hidden="true" className="mr-auto inline-block whitespace-nowrap rounded-full bg-[#12332c] px-3.5 py-1.5 text-[0.8125rem] font-bold text-white no-underline transition-colors hover:bg-[#0f7a3d]" tabIndex={-1} to={openTo}>Abrir →</Link>
      {onEdit && <button aria-label={`${editLabel}: ${title}`} className={cn(iconAction, 'max-[760px]:hidden')} disabled={busy} onClick={onEdit} title={editLabel} type="button"><Pencil aria-hidden="true" /></button>}
      {onShare && <button aria-label={`Copiar o link de ${title}`} className={iconAction} disabled={busy} onClick={onShare} title="Copiar link para os participantes" type="button"><Link2 aria-hidden="true" /></button>}
      {onDuplicate && <button aria-label={`Duplicar ${title}`} className={iconAction} disabled={busy} onClick={onDuplicate} title="Duplicar" type="button"><Copy aria-hidden="true" /></button>}
      {hasMenu && <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button aria-label={`Mais ações de ${title}`} className={iconAction} disabled={busy} title="Mais ações" type="button"><Ellipsis aria-hidden="true" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {onPublish && <DropdownMenuItem onSelect={onPublish}><Send aria-hidden="true" /> Publicar</DropdownMenuItem>}
          {onReactivate && <DropdownMenuItem onSelect={onReactivate}><RotateCcw aria-hidden="true" /> Reativar</DropdownMenuItem>}
          {onEnd && <DropdownMenuItem onSelect={onEnd}><CircleSlash aria-hidden="true" /> Encerrar</DropdownMenuItem>}
          {onDelete && (onPublish || onReactivate || onEnd) && <DropdownMenuSeparator />}
          {onDelete && <DropdownMenuItem onSelect={onDelete} variant="destructive"><Trash2 aria-hidden="true" /> Excluir</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>}
    </footer>
  </div>;
}
