import { Upload } from 'lucide-react';
import { useState } from 'react';
import { uploadGameImage, type GameContent, type GamificationGameType } from '@/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import SafeCardsEditor from './SafeCardsEditor';

export const emptyGameContent: GameContent = {
  imageUrl: '', items: [], pairs: [], risks: [], columns: 2,
  cards: [{ text: '', safe: false, explanation: '' }, { text: '', safe: true, explanation: '' }, { text: '', safe: false, explanation: '' }],
};

const riskFields = { x: 'Esquerda', y: 'Topo', width: 'Largura', height: 'Altura' } as const;

/** Conteúdo dos jogos que não são de perguntas (quebra-cabeça, memória, ordenação, caça aos riscos). */
export default function GameContentEditor({ type, content, onChange }: {
  type: GamificationGameType;
  content: GameContent;
  onChange: (content: GameContent) => void;
}) {
  const patch = (change: Partial<GameContent>) => onChange({ ...content, ...change });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  async function sendImage(image: File | undefined) {
    if (!image) return;
    setUploadError('');
    if (image.size > 2 * 1024 * 1024) { setUploadError('Escolha uma imagem de até 2 MB.'); return; }
    setUploading(true);
    try {
      patch({ imageUrl: await uploadGameImage(image) });
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }
  const updateRisk = (index: number, change: Partial<NonNullable<GameContent['risks']>[number]>) =>
    patch({ risks: content.risks?.map((item, current) => (current === index ? { ...item, ...change } : item)) });

  return (
    <fieldset className="m-0 grid gap-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-[0.8125rem] font-semibold">Conteúdo da atividade</legend>

      {(type === 'Puzzle' || type === 'RiskSpotting') && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {content.imageUrl && type === 'Puzzle' && (
              <img alt="Imagem do jogo" className="size-20 rounded-md object-cover" src={content.imageUrl} />
            )}
            <label className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer focus-within:ring-2 focus-within:ring-ring', uploading && 'pointer-events-none opacity-60')}>
              <Upload /> {uploading ? 'Enviando...' : content.imageUrl ? 'Trocar foto' : 'Enviar foto do computador'}
              <input accept="image/png,image/jpeg,image/webp" aria-label="Enviar foto do computador" className="sr-only" disabled={uploading}
                onChange={(event) => { void sendImage(event.target.files?.[0]); event.target.value = ''; }} type="file" />
            </label>
            <span className="text-xs text-muted-foreground">PNG, JPEG ou WebP, até 2 MB.</span>
          </div>
          {uploadError && <p className="m-0 text-sm font-medium text-destructive" role="alert">{uploadError}</p>}
          <Field hint="Preenchido ao enviar a foto. Também aceita um endereço HTTPS de uma imagem autorizada."
            htmlFor="game-image-url" label="Endereço da imagem">
            <Input id="game-image-url" maxLength={2000} required value={content.imageUrl ?? ''}
              onChange={(event) => patch({ imageUrl: event.target.value })} />
          </Field>
        </div>
      )}

      {type === 'Puzzle' && (
        <Field htmlFor="game-puzzle-columns" label="Quantidade de peças">
          <NativeSelect id="game-puzzle-columns" value={content.columns} onChange={(event) => patch({ columns: Number(event.target.value) })}>
            <option value={2}>4 peças (2 × 2)</option>
            <option value={3}>9 peças (3 × 3)</option>
          </NativeSelect>
        </Field>
      )}

      {type === 'Memory' && (
        <Field hint="De 2 a 12 pares, um por linha: Capacete|Protege a cabeça" htmlFor="game-pairs" label="Pares de equipamento e função">
          <Textarea id="game-pairs" required rows={6}
            value={(content.pairs ?? []).map((pair) => `${pair.first}|${pair.second}`).join('\n')}
            onChange={(event) => patch({
              pairs: event.target.value.split('\n').map((line) => {
                const [first, ...rest] = line.split('|');
                return { first, second: rest.join('|') };
              }),
            })} />
        </Field>
      )}

      {type === 'Ordering' && (
        <Field hint="De 2 a 12 etapas diferentes, uma por linha. O jogo vai embaralhá-las." htmlFor="game-ordered-items" label="Etapas na ordem correta">
          <Textarea id="game-ordered-items" required rows={6} value={(content.items ?? []).join('\n')}
            onChange={(event) => patch({ items: event.target.value.split('\n') })} />
        </Field>
      )}

      {type === 'SafeOrRisky' && (
        <SafeCardsEditor cards={content.cards?.length ? content.cards : emptyGameContent.cards!} onChange={(cards) => patch({ cards })} />
      )}

      {type === 'RiskSpotting' && <>
        <p className="m-0 text-xs text-muted-foreground">Adicione de 1 a 12 riscos. A posição e o tamanho são percentuais da imagem, de 0 a 100.</p>
        {content.imageUrl && (
          <img alt="Referência para posicionar as áreas de risco" className="max-h-64 max-w-full rounded-md object-contain" src={content.imageUrl} />
        )}
        {(content.risks ?? []).map((risk, index) => (
          <fieldset className="m-0 grid gap-3 rounded-md border border-border p-3" key={index}>
            <legend className="px-1 text-[0.8125rem] font-semibold">Risco {index + 1}</legend>
            <Field htmlFor={`risk-label-${index}`} label={`Descrição do risco ${index + 1}`}>
              <Input id={`risk-label-${index}`} maxLength={200} required value={risk.label}
                onChange={(event) => updateRisk(index, { label: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(riskFields) as (keyof typeof riskFields)[]).map((key) => (
                <Field htmlFor={`risk-${key}-${index}`} key={key} label={`${riskFields[key]} (%) · risco ${index + 1}`}>
                  <Input id={`risk-${key}-${index}`} max={100} min={key === 'width' || key === 'height' ? 1 : 0} required type="number"
                    value={risk[key]} onChange={(event) => updateRisk(index, { [key]: Number(event.target.value) })} />
                </Field>
              ))}
            </div>
            <Button className="justify-self-start" size="sm" variant="ghost"
              onClick={() => patch({ risks: content.risks?.filter((_, current) => current !== index) })}>
              Remover risco {index + 1}
            </Button>
          </fieldset>
        ))}
        {(content.risks?.length ?? 0) < 12 && (
          <Button className="justify-self-start" variant="outline"
            onClick={() => patch({ risks: [...content.risks ?? [], { label: '', x: 10, y: 10, width: 20, height: 20 }] })}>
            Adicionar risco
          </Button>
        )}
      </>}
    </fieldset>
  );
}
