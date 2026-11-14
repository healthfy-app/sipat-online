import { FileSpreadsheet, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import FilePicker from '@/components/ui/file-picker';
import { Textarea } from '@/components/ui/input';
import { csvToPlan } from './csv';
import { type Catalog, type DaySlots } from './model';

/** Reads a plan from a CSV (the sheet saved as CSV works), shows what matched and what did not, then hands the days over. */
export default function ImportDialog({ catalog, hasPlan, onImport, onTemplate, onClose }: {
  catalog: Catalog; hasPlan: boolean; onImport: (days: DaySlots[]) => void; onTemplate: () => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const result = useMemo(() => (text.trim() ? csvToPlan(text, catalog) : null), [text, catalog]);

  async function read(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  return <Dialog description="Salve a planilha como CSV (separado por ponto e vírgula) e envie aqui. Os vídeos são encontrados pelo código, como A1V4, ou pelo nome."
    onClose={onClose} size="lg" title="Importar SIPAT de um CSV">
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilePicker accept=".csv,.txt,text/csv" buttonLabel="Escolher arquivo CSV" file={fileName ? new File([], fileName) : null} id="sipat-csv" onChange={file => void read(file)} />
        <Button onClick={onTemplate} size="sm" variant="ghost"><FileSpreadsheet /> Baixar modelo</Button>
      </div>
      <details className="rounded-lg border border-border p-3" open={!text}>
        <summary className="cursor-pointer text-sm font-medium">Ou cole o conteúdo do CSV</summary>
        <Textarea aria-label="Conteúdo do CSV" className="mt-2 font-mono text-xs" onChange={event => { setText(event.target.value); setFileName(''); }} rows={6}
          spellCheck={false} value={text} />
      </details>

      {result && result.days.length > 0 && <section aria-label="Prévia da importação" className="grid gap-2">
        <p className="m-0 flex items-center gap-2 text-sm font-medium text-success">
          <Info aria-hidden="true" className="size-4" />
          {result.days.length} {result.days.length === 1 ? 'dia lido' : 'dias lidos'} · {result.matched} {result.matched === 1 ? 'item encontrado' : 'itens encontrados'} no catálogo
        </p>
        <ul className="m-0 grid max-h-44 list-none gap-1 overflow-auto p-0">
          {result.days.map((day, index) => <li className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-1.5 text-sm" key={day.key}>
            <span className="min-w-0 truncate font-medium">Dia {index + 1} · {day.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{day.videos.filter(Boolean).length} vídeos · {day.games.filter(Boolean).length} jogos</span>
          </li>)}
        </ul>
      </section>}

      {result && result.issues.length > 0 && <section aria-label="Pontos de atenção" className="grid gap-1.5 rounded-lg bg-warning-soft p-3">
        <p className="m-0 text-sm font-semibold text-warning">{result.issues.length} {result.issues.length === 1 ? 'ponto precisa' : 'pontos precisam'} de atenção</p>
        <p className="m-0 text-xs text-warning">O que não foi encontrado fica vazio na grade, e você escolhe o conteúdo certo depois.</p>
        <ul className="m-0 grid max-h-36 list-none gap-0.5 overflow-auto p-0 text-xs text-warning">
          {result.issues.map((issue, index) => <li key={index}>
            {issue.row > 0 ? `Linha ${issue.row}` : ''}{issue.column ? `, ${issue.column}` : ''}{issue.value ? ` ("${issue.value.slice(0, 60)}")` : ''}: {issue.reason}
          </li>)}
        </ul>
      </section>}
      {result && result.days.length === 0 && <p className="m-0 rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">
        {result.issues[0]?.reason ?? 'Não consegui ler nenhum dia desse arquivo.'}
      </p>}
    </div>
    <DialogActions>
      <Button onClick={onClose} variant="outline">Cancelar</Button>
      <Button disabled={!result || result.days.length === 0}
        onClick={() => {
          if (hasPlan && !window.confirm('A grade atual será substituída pelo conteúdo do arquivo. Continuar?')) return;
          onImport(result!.days);
        }}>Usar esta grade</Button>
    </DialogActions>
  </Dialog>;
}
