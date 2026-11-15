import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { SipatVideoPlayer, type Checkpoint, type PlayerEvent, type PlayerQualitySummary } from '../src';
import { fileSampleId, fileSampleTitle, samples } from './samples';

interface LogItem { key: number; time: string; event: PlayerEvent }

const maxLog = 200;
const number = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };

export default function PlaygroundApp() {
  const [sampleId, setSampleId] = useState(samples[0].id);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [watchInOrder, setWatchInOrder] = useState(false);
  const [fixedSpeed, setFixedSpeed] = useState(false);
  const [resumeAt, setResumeAt] = useState('0');
  const [furthest, setFurthest] = useState('0');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [newSeconds, setNewSeconds] = useState('10');
  const [newTitle, setNewTitle] = useState('Atividade');
  const [openId, setOpenId] = useState<string | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [quality, setQuality] = useState<PlayerQualitySummary | null>(null);
  const counter = useRef(0);

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const src = sampleId === fileSampleId ? fileUrl : samples.find(item => item.id === sampleId)?.src ?? null;
  const title = sampleId === fileSampleId ? fileSampleTitle : samples.find(item => item.id === sampleId)?.title ?? 'Vídeo';

  function onEvent(event: PlayerEvent) {
    counter.current += 1;
    const item: LogItem = { key: counter.current, time: new Date().toLocaleTimeString('pt-BR'), event };
    setLog(current => [item, ...current].slice(0, maxLog));
    if (event.type === 'checkpoint') setOpenId(event.id);
    if (event.type === 'quality') setQuality(event.summary);
    if (event.type === 'save') return Promise.resolve(true);
  }

  function chooseFile(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    if (!file) return;
    setFileUrl(URL.createObjectURL(file));
    setSampleId(fileSampleId);
  }

  function addCheckpoint() {
    const id = `ponto-${Date.now()}-${checkpoints.length}`;
    setCheckpoints(current => [...current, { id, seconds: number(newSeconds), title: newTitle || 'Atividade', done: false }]);
  }

  function finishActivity() {
    setCheckpoints(current => current.map(item => item.id === openId ? { ...item, done: true } : item));
    setOpenId(null);
  }

  const activity = openId
    ? <div style={{ background: '#fff', borderRadius: 8, color: '#111', padding: 16, textAlign: 'center' }}>
        <p>Atividade de exemplo</p>
        <button onClick={finishActivity} type="button">Concluir</button>
      </div>
    : null;

  return <main style={{ fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 960, padding: 16 }}>
    <h1>Player SIPAT - playground</h1>
    <p>Para provocar travamentos, use DevTools → Network → Slow 4G.</p>

    <fieldset>
      <legend>Vídeo</legend>
      <label>Vídeo de teste{' '}
        <select onChange={event => setSampleId(event.target.value)} value={sampleId}>
          {samples.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          {fileUrl && <option value={fileSampleId}>{fileSampleTitle}</option>}
        </select>
      </label>{' '}
      <label>{fileSampleTitle}{' '}
        <input accept="video/*" onChange={chooseFile} type="file" />
      </label>
    </fieldset>

    <fieldset>
      <legend>Regras e posição</legend>
      <label><input checked={watchInOrder} onChange={event => setWatchInOrder(event.target.checked)} type="checkbox" /> Assistir em ordem</label>{' '}
      <label><input checked={fixedSpeed} onChange={event => setFixedSpeed(event.target.checked)} type="checkbox" /> Velocidade fixa</label>{' '}
      <label>Retomar em (s){' '}
        <input min={0} onChange={event => setResumeAt(event.target.value)} type="number" value={resumeAt} />
      </label>{' '}
      <label>Liberado até (s){' '}
        <input min={0} onChange={event => setFurthest(event.target.value)} type="number" value={furthest} />
      </label>
      <p><small>Retomar e liberado valem quando o vídeo é carregado ou a regra muda; troque o vídeo para aplicar de novo.</small></p>
    </fieldset>

    <fieldset>
      <legend>Atividades</legend>
      <label>Ponto em (s){' '}
        <input min={0} onChange={event => setNewSeconds(event.target.value)} type="number" value={newSeconds} />
      </label>{' '}
      <label>Título do ponto{' '}
        <input onChange={event => setNewTitle(event.target.value)} type="text" value={newTitle} />
      </label>{' '}
      <button onClick={addCheckpoint} type="button">Adicionar ponto de atividade</button>
      <ul aria-label="Pontos de atividade">
        {checkpoints.map(item => <li key={item.id}>{item.seconds}s - {item.title}{item.done ? ' (concluído)' : ''}</li>)}
      </ul>
    </fieldset>

    {src
      ? <SipatVideoPlayer
          activity={activity} checkpoints={checkpoints} furthest={number(furthest)} key={src} onEvent={onEvent}
          resumeAt={number(resumeAt)} rules={{ watchInOrder, fixedSpeed }} sources={[{ src }]} title={title} />
      : <p>Escolha um vídeo.</p>}

    {quality && <section aria-label="Último resumo de qualidade" style={{ background: '#fff7d6', border: '1px solid #e0c34a', borderRadius: 8, margin: '16px 0', padding: 12 }}>
      <strong>Último resumo de qualidade</strong>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(quality, null, 2)}</pre>
    </section>}

    <h2>Eventos</h2>
    <ol aria-label="Registro de eventos" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, listStyle: 'none', margin: 0, padding: 0 }}>
      {log.map(item => <li key={item.key}>
        {item.time} <strong>{item.event.type}</strong> {JSON.stringify(item.event, (key, value) => key === 'type' ? undefined : value)}
      </li>)}
    </ol>
  </main>;
}
