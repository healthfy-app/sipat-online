// Temporary: renders every game on the stage over a fake lesson (deleted after review).
import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './Motion.css';
import './ui/tailwind.css';
import GamePlayer from './games/LazyGamePlayer';
import GameStage from './games/GameStage';
import type { GameModule } from './api';

const empty = { imageUrl: null, items: null, pairs: null, risks: null, columns: 3 };
const base = { createdAt: '', usageCount: 0, questions: [] };
const modules: GameModule[] = [
  { ...base, id: 'c', title: 'Rotina na fábrica', gameType: 'SafeOrRisky', content: { ...empty, cards: [
    { text: 'Subir na escada com um degrau quebrado só para pegar uma caixa leve', safe: false, explanation: 'Escada danificada deve ser retirada de uso, mesmo para tarefas rápidas.' },
    { text: 'Isolar e sinalizar o piso molhado antes de limpar', safe: true, explanation: 'Sinalizar evita escorregões de quem passa pelo local.' },
    { text: 'Deixar o extintor atrás das caixas porque ele atrapalha a passagem', safe: false, explanation: 'O extintor precisa estar visível e com acesso livre.' }] } },
  { ...base, id: 'q', title: 'Quiz de EPI', gameType: 'Quiz', questions: [
    { text: 'Quando o capacete de segurança é obrigatório?', options: ['Só quando chove', 'Em toda área com risco de queda de objetos', 'Apenas para visitantes', 'Nunca'], correctIndex: 1 },
    { text: 'O que fazer ao ver um fio desencapado?', options: ['Isolar a área e avisar a manutenção', 'Tentar consertar'], correctIndex: 0 }] },
  { ...base, id: 's', title: 'Decisões no chão de fábrica', gameType: 'Scenario', questions: [
    { text: 'Você vê um colega operando a prensa sem luvas, com pressa para bater a meta do turno.', options: ['Deixa pra lá, ele é experiente', 'Para a máquina e conversa com ele sobre o risco', 'Avisa só no fim do turno'], correctIndex: 1 }] },
  { ...base, id: 'r', title: 'Encontre os perigos', gameType: 'RiskSpotting', content: { ...empty, imageUrl: '/risk-scene.svg',
    risks: [{ label: 'Cabo solto no chão', x: 8, y: 70, width: 22, height: 16 }, { label: 'Caixa empilhada alta', x: 62, y: 18, width: 20, height: 34 }, { label: 'Saída bloqueada', x: 40, y: 40, width: 16, height: 30 }] } },
  { ...base, id: 'm', title: 'EPI certo para cada parte', gameType: 'Memory', content: { ...empty,
    pairs: [{ first: 'Capacete', second: 'Cabeça' }, { first: 'Óculos de proteção', second: 'Olhos' }, { first: 'Protetor auricular', second: 'Audição' }, { first: 'Luvas', second: 'Mãos' }] } },
  { ...base, id: 'p', title: 'Monte o cartaz', gameType: 'Puzzle', content: { ...empty, imageUrl: '/course-covers/safety.jpg', columns: 3 } },
  { ...base, id: 'o', title: 'Bloqueio e etiquetagem', gameType: 'Ordering', content: { ...empty,
    items: ['Avisar os envolvidos', 'Desligar o equipamento', 'Bloquear e etiquetar a fonte de energia', 'Testar se está sem energia', 'Fazer a manutenção'] } },
];

function Lab() {
  const [active, setActive] = useState<GameModule | null>(null);
  return <div className="portal-layout portal-layout-learner" style={{ minHeight: '100vh', padding: 24 }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {modules.map(module => <button className="button button-secondary" key={module.id} onClick={() => setActive(module)} type="button">{module.gameType}</button>)}
    </div>
    <div style={{ aspectRatio: '16/9', maxWidth: 960, background: 'linear-gradient(135deg,#1d3b31,#3a5a4c)', borderRadius: 12, display: 'grid', placeItems: 'center', color: '#fff' }}>vídeo da aula (pausado)</div>
    {active && <GameStage label={active.title} onClose={() => setActive(null)}>
      <GamePlayer key={active.id} module={active} onClose={() => setActive(null)} />
    </GameStage>}
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Lab />);
