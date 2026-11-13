import { CalendarDays, Copy, FileSpreadsheet, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { maxDays } from './model';

/** First step of "Construção SIPAT": name it and say how many days it has. The grid comes next. */
export default function BuilderSetup({ name, dayCount, startDate, onName, onDayCount, onStartDate, onStart, onImport, onTemplate, onCopy }: {
  name: string; dayCount: number; startDate: string;
  onName: (value: string) => void; onDayCount: (value: number) => void; onStartDate: (value: string) => void;
  onStart: () => void; onImport: () => void; onTemplate: () => void; onCopy?: () => void;
}) {
  const clamp = (value: number) => onDayCount(Math.min(maxDays, Math.max(1, value)));
  return <section aria-labelledby="builder-setup-title" className="mx-auto grid w-full max-w-2xl gap-6 rounded-3xl border border-border bg-card p-6 shadow-card sm:p-9">
    <header className="grid gap-1.5">
      <p className="m-0 text-[0.6875rem] font-bold tracking-[0.08em] text-primary uppercase">Nova SIPAT</p>
      <h2 className="m-0 text-2xl font-semibold tracking-tight" id="builder-setup-title">Vamos montar a SIPAT</h2>
      <p className="m-0 text-sm text-muted-foreground">
        Uma SIPAT é uma semana de treinamento. Diga quando começa e quantos dias tem; depois você escolhe o assunto de cada dia.
      </p>
    </header>

    <Field htmlFor="builder-name" label="Nome desta SIPAT">
      <Input data-autofocus id="builder-name" maxLength={200} onChange={event => onName(event.target.value)} placeholder="Ex.: SIPAT 2026" value={name} />
    </Field>

    <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="p-0 text-lg font-semibold">Quantos dias terá a sua SIPAT?</legend>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button aria-label="Menos um dia" disabled={dayCount <= 1} onClick={() => clamp(dayCount - 1)} size="icon" variant="outline"><Minus /></Button>
          <output aria-live="polite" className="grid h-16 min-w-20 place-items-center rounded-2xl bg-primary px-4 text-4xl font-semibold text-primary-foreground tabular-nums">{dayCount}</output>
          <Button aria-label="Mais um dia" disabled={dayCount >= maxDays} onClick={() => clamp(dayCount + 1)} size="icon" variant="outline"><Plus /></Button>
        </div>
        <div aria-label="Atalhos" className="flex flex-wrap gap-1.5" role="group">
          {[1, 3, 4, 5, 6, 7].map(count => <button aria-pressed={dayCount === count}
            className={cn('h-9 min-w-9 rounded-lg border px-2.5 text-sm font-semibold transition-colors',
              dayCount === count ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:bg-muted')}
            key={count} onClick={() => clamp(count)} type="button">{count}</button>)}
        </div>
      </div>
      <p className="m-0 text-xs text-muted-foreground">De 1 a {maxDays} dias. Dá para acrescentar ou tirar dias depois, na grade.</p>
    </fieldset>

    <Field hint="Os dias seguintes recebem as datas em sequência, e você pode ajustar cada uma na grade." htmlFor="builder-start" label="Data do primeiro dia">
      <div className="relative max-w-56">
        <CalendarDays aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="builder-start" onChange={event => onStartDate(event.target.value)} type="date" value={startDate} />
      </div>
    </Field>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap gap-2">
        {onCopy && <Button onClick={onCopy} variant="outline"><Copy /> Duplicar de outra SIPAT</Button>}
        <Button onClick={onImport} variant="outline"><FileSpreadsheet /> Importar de um CSV</Button>
        <Button onClick={onTemplate} variant="ghost">Baixar modelo</Button>
      </div>
      <Button disabled={!name.trim() || !startDate} onClick={onStart} size="lg">Montar a grade</Button>
    </div>
  </section>;
}
