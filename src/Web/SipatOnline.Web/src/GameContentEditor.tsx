import type { GameContent, GamificationGameType } from './api';

export const emptyGameContent: GameContent = { imageUrl: '', items: [], pairs: [], risks: [], columns: 2 };

export default function GameContentEditor({ type, content, onChange }: {
  type: GamificationGameType;
  content: GameContent;
  onChange: (content: GameContent) => void;
}) {
  const patch = (change: Partial<GameContent>) => onChange({ ...content, ...change });
  return <fieldset className="game-question-editor">
    <legend>Conteúdo da atividade</legend>
    {(type === 'Puzzle' || type === 'RiskSpotting') && <div className="field">
      <label htmlFor="game-image-url">Endereço da imagem</label>
      <input id="game-image-url" maxLength={2000} onChange={event => patch({ imageUrl: event.target.value })} required value={content.imageUrl ?? ''} />
      <span className="field-hint">Use uma imagem autorizada com endereço HTTPS ou uma imagem local, como /course-covers/safety.jpg.</span>
    </div>}
    {type === 'Puzzle' && <div className="field">
      <label htmlFor="game-puzzle-columns">Quantidade de peças</label>
      <select id="game-puzzle-columns" onChange={event => patch({ columns: Number(event.target.value) })} value={content.columns}>
        <option value={2}>4 peças (2 × 2)</option><option value={3}>9 peças (3 × 3)</option>
      </select>
    </div>}
    {type === 'Memory' && <div className="field">
      <label htmlFor="game-pairs">Pares de equipamento e função</label>
      <textarea id="game-pairs" onChange={event => patch({
        pairs: event.target.value.split('\n').map(line => {
          const [first, ...rest] = line.split('|');
          return { first, second: rest.join('|') };
        }),
      })} required rows={6} value={(content.pairs ?? []).map(pair => `${pair.first}|${pair.second}`).join('\n')} />
      <span className="field-hint">De 2 a 12 pares, um por linha: Capacete|Protege a cabeça</span>
    </div>}
    {type === 'Ordering' && <div className="field">
      <label htmlFor="game-ordered-items">Etapas na ordem correta</label>
      <textarea id="game-ordered-items" onChange={event => patch({ items: event.target.value.split('\n') })}
        required rows={6} value={(content.items ?? []).join('\n')} />
      <span className="field-hint">De 2 a 12 etapas diferentes, uma por linha. O jogo vai embaralhá-las.</span>
    </div>}
    {type === 'RiskSpotting' && <>
      <p className="field-hint">Adicione de 1 a 12 riscos. A posição e o tamanho são percentuais da imagem, de 0 a 100.</p>
      {content.imageUrl && <img alt="Referência para posicionar as áreas de risco" src={content.imageUrl} style={{ maxWidth: '100%', maxHeight: '16rem', objectFit: 'contain' }} />}
      {(content.risks ?? []).map((risk, index) => <fieldset key={index}>
        <legend>Risco {index + 1}</legend>
        <div className="field">
          <label htmlFor={`risk-label-${index}`}>Descrição do risco {index + 1}</label>
          <input id={`risk-label-${index}`} maxLength={200} required value={risk.label} onChange={event => patch({
            risks: content.risks?.map((item, current) => current === index ? { ...item, label: event.target.value } : item),
          })} />
        </div>
        {(['x', 'y', 'width', 'height'] as const).map(key => <div className="field" key={key}>
          <label htmlFor={`risk-${key}-${index}`}>{({ x: 'Esquerda', y: 'Topo', width: 'Largura', height: 'Altura' })[key]} (%) · risco {index + 1}</label>
          <input id={`risk-${key}-${index}`} max={100} min={key === 'width' || key === 'height' ? 1 : 0}
            onChange={event => patch({ risks: content.risks?.map((item, current) => current === index ? { ...item, [key]: Number(event.target.value) } : item) })}
            required type="number" value={risk[key]} />
        </div>)}
        <button className="button button-quiet" onClick={() => patch({ risks: content.risks?.filter((_, current) => current !== index) })} type="button">Remover risco {index + 1}</button>
      </fieldset>)}
      {(content.risks?.length ?? 0) < 12 && <button className="button button-secondary" onClick={() => patch({
        risks: [...content.risks ?? [], { label: '', x: 10, y: 10, width: 20, height: 20 }],
      })} type="button">Adicionar risco</button>}
    </>}
  </fieldset>;
}
