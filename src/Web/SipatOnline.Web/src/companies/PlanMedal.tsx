import { Check, Lock } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { type CompanyPlan } from '@/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { planFeatures, planIncludes, planInfo, planOptions } from './PlanSelect';

const narrowShell = '(max-width: 860px)';

/** The side menu turns into a top bar on narrow screens: there the card opens below the medal instead of beside it. */
function useNarrowShell() {
  const query = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(narrowShell).matches;
  const [narrow, setNarrow] = useState(query);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(narrowShell);
    const update = () => setNarrow(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return narrow;
}

/**
 * The medal of the company's plan, beside its logo in the menu. Hovering it, focusing it or tapping it opens a card with
 * everything the plans offer: what the company has and what a higher plan would add.
 */
export default function PlanMedal({ plan, className }: { plan: CompanyPlan; className?: string }) {
  const info = planInfo(plan);
  const Icon = info.icon;
  const narrow = useNarrowShell();
  const [open, setOpen] = useState(false);
  const included = planFeatures.filter(feature => planIncludes(info.id, feature)).length;
  const isTop = info.id === planOptions[planOptions.length - 1].id;

  // a tap (touch has no hover) opens it too; a click keeps it open instead of the default of closing it
  const keepOpen = (event: MouseEvent) => { event.preventDefault(); setOpen(true); };

  return <TooltipProvider>
    <Tooltip onOpenChange={setOpen} open={open}>
      <TooltipTrigger asChild>
        <button aria-label={`Plano ${info.label}`} className={cn('plan-medal', className)} onClick={keepOpen}
          style={{ backgroundColor: info.tint, color: info.ink }} type="button">
          <Icon aria-hidden="true" className="size-[1.125rem]" />
        </button>
      </TooltipTrigger>
      <TooltipContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0" collisionPadding={12} side={narrow ? 'bottom' : 'right'}>
        <div className="flex items-center gap-3 border-b border-border px-3.5 py-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: info.tint, color: info.ink }}>
            <Icon className="size-5" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <strong className="text-sm leading-tight font-semibold">Plano {info.label}</strong>
            <span className="text-xs leading-tight text-muted-foreground">
              {isTop ? 'Todos os recursos da plataforma' : `${included} de ${planFeatures.length} recursos incluídos`}
            </span>
          </span>
        </div>
        <ul className="m-0 grid list-none gap-2 px-3.5 py-3">
          {planFeatures.map(feature => {
            const has = planIncludes(info.id, feature);
            return <li className={cn('flex items-start gap-2 text-[0.8125rem] leading-snug', !has && 'text-muted-foreground')} key={feature.label}>
              {has
                ? <Check aria-hidden="true" className="mt-px size-4 shrink-0 text-success" strokeWidth={2.5} />
                : <Lock aria-hidden="true" className="mt-px size-3.5 shrink-0 translate-x-px opacity-60" />}
              <span className="min-w-0 flex-1">
                {feature.label}
                <span className="sr-only">{has ? ' (incluído)' : ` (a partir do plano ${planInfo(feature.from).label})`}</span>
              </span>
              {!has && <span aria-hidden="true" className="shrink-0 rounded-full px-1.5 text-[0.6875rem] leading-[1.125rem] font-semibold"
                style={{ backgroundColor: planInfo(feature.from).tint, color: planInfo(feature.from).ink }}>{planInfo(feature.from).label}</span>}
            </li>;
          })}
        </ul>
        {!isTop && <p className="m-0 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">Quer mais recursos? Fale com a SIPAT Online.</p>}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>;
}
