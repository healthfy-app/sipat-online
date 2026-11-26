import { CalendarDays, Copy, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { maxDays } from './model';

/** First step of "Novo treinamento": name it and say how many days it has. The grid comes next. */
export interface TrainingChoice { id: string; title: string; titles: number }

export default function BuilderSetup({ name, dayCount, startDate, onName, onDayCount, onStartDate, onStart, onCopy, limit = '', onLimit, trainings, training, onTraining, readyOnly = false }: {
  /** The plan takes a ready SIPAT whole (Bronze): one has to be picked, and nothing is built from scratch. */
  readyOnly?: boolean;
  name: string; dayCount: number; startDate: string;
  onName: (value: string) => void; onDayCount: (value: number) => void; onStartDate: (value: string) => void;
  onStart: () => void; onCopy?: () => void;
  /** The last day the training can be taken, when it runs past its last day ('': it ends with its last day). */
  limit?: string; onLimit?: (value: string) => void;
  /** The trainings of Conteúdo the company can start from; each Título becomes a day. */
  trainings?: TrainingChoice[]; training?: string; onTraining?: (id: string) => void;
}) {
  const clamp = (value: number) => onDayCount(Math.min(maxDays, Math.max(1, value)));
  const picked = trainings?.find(item => item.id === training);
  return <section aria-labelledby="builder-setup-title" className="mx-auto grid w-full max-w-2xl gap-6 rounded-3xl border border-border bg-card p-6 shadow-card sm:p-9">
    <header className="grid gap-1.5">
      <p className="m-0 text-[0.6875rem] font-bold tracking-[0.08em] text-primary uppercase">Novo treinamento</p>
      <h2 className="m-0 text-2xl font-semibold tracking-tight" id="builder-setup-title">Vamos montar o treinamento</h2>
      <p className="m-0 text-sm text-muted-foreground">
        {readyOnly
          ? 'Escolha uma SIPAT pronta e diga quando ela começa. Ela vem com todos os dias e vídeos; você ajusta as datas e os nomes dos dias.'
          : 'Um treinamento é um conjunto de dias ou módulos. Diga quando começa e quantos dias tem; depois você escolhe o assunto de cada dia.'}
      </p>
    </header>

    <Field htmlFor="builder-name" label="Nome deste treinamento">
      <Input data-autofocus id="builder-name" maxLength={200} onChange={event => onName(event.target.value)} placeholder="Ex.: SIPAT 2026" value={name} />
    </Field>

    {readyOnly && (!trainings || trainings.length === 0) && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
      Ainda não há SIPAT pronta disponível para o seu plano. Fale com a operação.
    </p>}

    {trainings && trainings.length > 0 && onTraining && <Field
      hint={picked
        ? readyOnly ? `${picked.titles} ${picked.titles === 1 ? 'dia' : 'dias'}, com todos os vídeos.` : `Os ${picked.titles} títulos dele viram ${picked.titles} dias, com os seus vídeos. Depois você ajusta na grade.`
        : readyOnly ? 'Cada SIPAT pronta vem com os seus dias e vídeos.' : 'Opcional: cada Título do treinamento vira um dia, já com os vídeos.'}
      htmlFor="builder-training" label={readyOnly ? 'SIPAT pronta' : 'Começar de um treinamento do Conteúdo'}>
      <NativeSelect id="builder-training" onChange={event => onTraining(event.target.value)} value={training ?? ''}>
        <option value="">{readyOnly ? 'Escolha uma SIPAT pronta' : 'Montar do zero'}</option>
        {trainings.map(item => <option key={item.id} value={item.id}>{item.title} ({item.titles} {item.titles === 1 ? 'título' : 'títulos'})</option>)}
      </NativeSelect>
    </Field>}

    {!picked && !readyOnly && <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="p-0 text-lg font-semibold">Quantos dias terá o seu treinamento?</legend>
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
    </fieldset>}

    <div className="grid gap-4 sm:grid-cols-2">
      <Field hint="Os dias seguintes recebem as datas em sequência, e você pode ajustar cada uma na grade." htmlFor="builder-start" label="Data do primeiro dia">
        <div className="relative max-w-56">
          <CalendarDays aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="builder-start" onChange={event => onStartDate(event.target.value)} type="date" value={startDate} />
        </div>
      </Field>
      {onLimit && <Field hint="Até quando o treinamento pode ser feito. Em branco, termina no último dia." htmlFor="builder-limit" label="Data limite">
        <div className="relative max-w-56">
          <CalendarDays aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="builder-limit" min={startDate || undefined} onChange={event => onLimit(event.target.value)} type="date" value={limit} />
        </div>
      </Field>}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap gap-2">
        {onCopy && <Button onClick={onCopy} variant="outline"><Copy /> Duplicar de outro treinamento</Button>}
      </div>
      <Button disabled={!name.trim() || !startDate || (readyOnly && !picked)} onClick={onStart} size="lg">{readyOnly ? 'Ver os dias' : 'Montar a grade'}</Button>
    </div>
  </section>;
}
