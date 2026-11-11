import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameModule } from './api';
import './InteractiveGame.css';
import AchievementMark from './AchievementMark';

export type GameOutcome = 'completed' | 'skipped';

function shuffled(size: number) {
  const values = Array.from({ length: size }, (_, index) => index);
  for (let index = values.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  if (size > 1 && values.every((value, index) => value === index)) values.push(values.shift()!);
  return values;
}

export default function InteractiveGame({ module, onClose }: {
  module: GameModule;
  onClose: (outcome?: GameOutcome) => void;
}) {
  const content = module.content;
  const columns = content?.columns ?? 2;
  const size = module.gameType === 'Puzzle' ? columns ** 2 : content?.items?.length ?? 0;
  const [order, setOrder] = useState(() => shuffled(size));
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const [cards] = useState(() => shuffled((content?.pairs?.length ?? 0) * 2));
  const revealedRef = useRef<number[]>([]);
  const matchedRef = useRef(new Set<number>());
  const board = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    const animations: Animation[] = [];
    board.current?.querySelectorAll<HTMLElement>('[data-game-piece]').forEach(element => {
      const key = element.dataset.gamePiece;
      if (key === undefined) return;
      const rect = element.getBoundingClientRect();
      const previous = positions.current.get(key);
      next.set(key, rect);
      if (!previous || !element.animate || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const x = previous.left - rect.left;
      const y = previous.top - rect.top;
      if (x || y) animations.push(element.animate(
        [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      ));
    });
    positions.current = next;
    return () => animations.forEach(animation => animation.cancel());
  }, [order]);
  useEffect(() => {
    if (revealed.length !== 2) return;
    const timer = window.setTimeout(() => {
      if (Math.floor(revealed[0] / 2) === Math.floor(revealed[1] / 2)) {
        revealed.forEach(card => matchedRef.current.add(card));
        const next = [...matchedRef.current];
        setMatched(next);
        const done = next.length === cards.length;
        setComplete(done);
        const pair = content?.pairs?.[Math.floor(revealed[0] / 2)];
        setMessage(done ? 'Todos os pares encontrados!' : `Par encontrado: ${pair?.first} + ${pair?.second}.`);
      } else {
        setMessage('Essas cartas não formam um par. Tente novamente.');
      }
      revealedRef.current = []; setRevealed([]);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [revealed, cards.length, content?.pairs]);

  if (!content) return <section className="game-player" role="alert">
    <h3>{module.title}</h3>
    <p>Este jogo precisa de conteúdo. Peça à operação para revisar a configuração.</p>
    <button className="button button-secondary" onClick={() => onClose('skipped')} type="button">Pular atividade</button>
  </section>;

  function swap(first: number, second: number) {
    const next = [...order];
    [next[first], next[second]] = [next[second], next[first]];
    setOrder(next);
    setMessage('');
  }
  function verify() {
    const done = order.every((value, index) => value === index);
    setComplete(done);
    setMessage(done ? 'Muito bem! A sequência está correta.' : 'Ainda não está correto. Ajuste a sequência e tente novamente.');
  }
  return <section aria-label={module.title} className="game-player interactive-game">
    <p className="muted-copy">Atividade opcional · Sem pontuação</p>
    <h3>{module.title}</h3>
    <div className="game-board" ref={board}>
    {module.gameType === 'RiskSpotting' && <>
      <p>Encontre os riscos na imagem. Você também pode usar Tab e Enter para identificá-los.</p>
      <div className="risk-game-image" onClick={() => setMessage('Observe os detalhes e tente outra área.')}>
        <img alt="Ambiente de trabalho para identificar situações de risco" src={content.imageUrl ?? undefined} />
        {content.risks?.map((risk, index) => <button
          aria-label={`Identificar risco: ${risk.label}`}
          aria-pressed={found.includes(index)}
          className={found.includes(index) ? 'risk-game-region is-found' : 'risk-game-region'}
          key={index}
          onClick={event => {
            event.stopPropagation();
            if (found.includes(index)) return;
            const next = [...found, index];
            setFound(next); setMessage(`Risco identificado: ${risk.label}`);
            if (next.length === content.risks?.length) setComplete(true);
          }}
          style={{ left: `${risk.x}%`, top: `${risk.y}%`, width: `${risk.width}%`, height: `${risk.height}%` }}
          type="button">{found.includes(index) ? '✓' : ''}</button>)}
      </div>
      <p>{found.length} de {content.risks?.length ?? 0} riscos identificados</p>
      <progress aria-label="Riscos identificados" max={content.risks?.length || 1} value={found.length} />
      {found.length > 0 && <ul>{found.map(index => <li key={index}>{content.risks?.[index].label}</li>)}</ul>}
    </>}
    {module.gameType === 'Memory' && <>
      <p>Associe cada equipamento à sua proteção. As duas cartas de um par se complementam; não têm o mesmo texto.</p>
      <p className="memory-game-progress">{matched.length / 2} de {content.pairs?.length ?? 0} pares encontrados</p>
      <progress aria-label="Pares encontrados" max={content.pairs?.length || 1} value={matched.length / 2} />
      <div className="memory-game-grid">
        {cards.map((card, position) => {
          const visible = revealed.includes(card) || matched.includes(card);
          const pair = content.pairs?.[Math.floor(card / 2)];
          return <button aria-label={visible ? undefined : `Revelar carta ${position + 1}`}
            aria-pressed={visible} className={`memory-game-card${visible ? ' is-revealed' : ''}${matched.includes(card) ? ' is-matched' : ''}`}
            disabled={visible || revealed.length === 2} key={card}
            onClick={() => {
              if (revealedRef.current.length >= 2 || revealedRef.current.includes(card) || matchedRef.current.has(card)) return;
              revealedRef.current = [...revealedRef.current, card];
              setRevealed(revealedRef.current);
            }} type="button">
            {visible ? <span className="memory-card-face">{matched.includes(card) && <span aria-hidden="true" className="memory-game-match">✓</span>}
              <span>{card % 2 === 0 ? pair?.first : pair?.second}</span></span> : <span aria-hidden="true" className="memory-card-back">?</span>}</button>;
        })}
      </div>
    </>}
    {module.gameType === 'Puzzle' && <>
      <p>Selecione duas peças para trocar de lugar e reconstruir a imagem.</p>
      <div className="puzzle-game-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {order.map((piece, index) => <button aria-label={`Peça ${piece + 1}, posição ${index + 1}`}
          aria-pressed={selected === index} disabled={complete} data-game-piece={piece} key={piece} onClick={() => {
            if (selected === null) setSelected(index);
            else { swap(selected, index); setSelected(null); }
          }} style={{
            backgroundImage: `url(${JSON.stringify(content.imageUrl)})`,
            backgroundSize: `${columns * 100}% ${columns * 100}%`,
            backgroundPosition: `${(piece % columns) / (columns - 1) * 100}% ${Math.floor(piece / columns) / (columns - 1) * 100}%`,
          }} type="button"><span>{piece + 1}</span></button>)}
      </div>
    </>}
    {module.gameType === 'Ordering' && <>
      <p>Organize as etapas na ordem correta.</p>
      <ol className="ordering-game-list">{order.map((item, index) => <li data-game-piece={item} key={item}>
        <span>{content.items?.[item]}</span><div>
          <button aria-label={`Subir ${content.items?.[item]}`} disabled={index === 0 || complete}
            onClick={() => swap(index, index - 1)} type="button">↑</button>
          <button aria-label={`Descer ${content.items?.[item]}`} disabled={index === order.length - 1 || complete}
            onClick={() => swap(index, index + 1)} type="button">↓</button>
        </div></li>)}</ol>
    </>}
    </div>
    <div className={`game-feedback${complete ? ' is-complete' : ''}`}>
      {complete && <AchievementMark animate />}
      <p aria-live="polite" role="status">{complete ? 'Atividade concluída. ' : ''}{message}</p>
    </div>
    <div className="game-actions">
      {!complete && (module.gameType === 'Puzzle' || module.gameType === 'Ordering') &&
        <button className="button button-primary" onClick={verify} type="button">Verificar resposta</button>}
      {complete && <button className="button button-primary" onClick={() => onClose('completed')} type="button">Continuar</button>}
      <button className="button button-quiet" onClick={() => onClose('skipped')} type="button">Pular</button>
    </div>
  </section>;
}
