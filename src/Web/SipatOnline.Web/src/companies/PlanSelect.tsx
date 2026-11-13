import { Award, Check, ChevronDown, Crown, Gem, Medal } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { type CompanyPlan } from '@/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface PlanInfo {
  id: CompanyPlan;
  label: string;
  /** What the plan adds over the one before, as sold on the site. */
  summary: string;
  icon: ComponentType<{ className?: string }>;
  /** Medal colors: the tile behind the icon and the icon itself. */
  tint: string;
  ink: string;
}

/** The plans of sipatonline.com.br. The company is never told its plan; the operator picks it. */
export const planOptions: PlanInfo[] = [
  { id: 'Bronze', label: 'Bronze', summary: 'Grades prontas, relatórios diários e certificado padrão', icon: Medal, tint: '#f3e3d3', ink: '#a15d2b' },
  { id: 'Prata', label: 'Prata', summary: 'Tudo do Bronze + personalização da grade de vídeos', icon: Award, tint: '#e6eaf0', ink: '#667085' },
  { id: 'Ouro', label: 'Ouro', summary: 'Tudo da Prata + logo, cores e certificado personalizados', icon: Crown, tint: '#fbf0c8', ink: '#b07d00' },
  { id: 'Diamante', label: 'Diamante', summary: 'Tudo do Ouro + quiz ao final de cada assunto e vídeos da empresa', icon: Gem, tint: '#d9f0fb', ink: '#0b86b8' },
];

export const planInfo = (plan: string | null | undefined): PlanInfo => planOptions.find(item => item.id === plan) ?? planOptions[0];

export function PlanBadge({ plan, className }: { plan: string; className?: string }) {
  const info = planInfo(plan);
  const Icon = info.icon;
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', className)} style={{ backgroundColor: info.tint, color: info.ink }}>
    <Icon aria-hidden="true" className="size-3.5" />{info.label}
  </span>;
}

/** The plan as a pick list: each option shows its medal, its name and what it adds. */
export default function PlanSelect({ value, onChange, disabled, id, label = 'Plano' }: {
  value: CompanyPlan; onChange: (plan: CompanyPlan) => void; disabled?: boolean; id?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = planInfo(value);
  const CurrentIcon = current.icon;
  return <DropdownMenu onOpenChange={setOpen} open={open}>
    <DropdownMenuTrigger asChild>
      <button aria-expanded={open} aria-haspopup="listbox" aria-label={`${label}: ${current.label}`} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-input bg-background px-3 py-2 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        disabled={disabled} id={id} role="combobox" type="button">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: current.tint, color: current.ink }}><CurrentIcon className="size-5" /></span>
        <span className="grid min-w-0 flex-1">
          <strong className="text-sm">{current.label}</strong>
          <span className="truncate text-xs text-muted-foreground">{current.summary}</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-1.5" role="listbox">
      {planOptions.map(option => {
        const Icon = option.icon;
        const selected = option.id === value;
        return <DropdownMenuItem aria-selected={selected} className="flex items-center gap-3 rounded-lg px-2.5 py-2" key={option.id} onSelect={() => onChange(option.id)} role="option">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: option.tint, color: option.ink }}><Icon className="size-5" /></span>
          <span className="grid min-w-0 flex-1">
            <strong className="text-sm">{option.label}</strong>
            <span className="text-xs whitespace-normal text-muted-foreground">{option.summary}</span>
          </span>
          {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
