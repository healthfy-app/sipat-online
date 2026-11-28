// Teste de carga do participante: entra, abre a tela inicial, começa um vídeo e salva o progresso a cada 10 s,
// como o player faz (SAVE_INTERVAL_MS em src/Web/SipatVideoPlayer/src/core/saveSchedule.ts).
//
// Variáveis de ambiente:
//   BASE     endereço da empresa de teste, por exemplo https://carga.sipatonline.com
//   STAGES   degraus "alvo:duração" separados por vírgula, por exemplo "100:1m,100:3m,600:3m,600:10m,0:1m"
//   SAMPLE   quantos usuários baixam o começo do vídeo de verdade (padrão 20); os outros só falam com a API
//   LABEL    nome da rodada, usado no arquivo de resumo
//
// As contas vêm de dados/acessos.csv (login,senha), gerado por gerar-participantes.ps1.
import http from 'k6/http';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.BASE || '').replace(/\/$/, '');
const SAMPLE = parseInt(__ENV.SAMPLE || '20', 10);
const LABEL = __ENV.LABEL || 'rodada';
const SAVE_EVERY_S = 10;
const SAMPLE_BYTES = 4 * 1024 * 1024;

const accounts = new SharedArray('acessos', () =>
  open('./dados/acessos.csv').split(/\r?\n/).slice(1).filter(line => line.trim()).map(line => {
    const comma = line.indexOf(',');
    return { login: line.slice(0, comma), password: line.slice(comma + 1) };
  }));

function stages() {
  const text = __ENV.STAGES || '10:30s,10:2m,0:10s';
  return text.split(',').map(part => {
    const [target, duration] = part.trim().split(':');
    return { target: parseInt(target, 10), duration };
  });
}

export const options = {
  discardResponseBodies: true,
  // o k6 apaga os cookies a cada iteração; aqui a pessoa continua logada de um vídeo para o outro
  noCookiesReset: true,
  scenarios: {
    assistindo: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stages(),
      gracefulRampDown: '15s',
      gracefulStop: '15s',
    },
  },
  // nada aborta a rodada: o objetivo é ver até onde o servidor vai
  thresholds: {
    'http_req_duration{name:salvar}': ['p(95)<500'],
    'http_req_duration{name:login}': ['p(95)<2000'],
    falhas: ['rate<0.01'],
  },
  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const falhas = new Rate('falhas');
const logins = new Counter('logins_ok');
const loginBarrado = new Counter('login_429');
const salvamentos = new Counter('salvamentos_ok');
const salvamentoRecusado = new Counter('salvamento_recusado');
const erros5xx = new Counter('erros_5xx');
const semResposta = new Counter('sem_resposta');
const videoPrimeiroByte = new Trend('video_primeiro_byte', true);
const videoMbps = new Trend('video_mbps');

// estado de cada usuário virtual (cada VU tem o seu)
let signedIn = false;
let csrf = null;
let lessons = null;
let lessonIndex = 0;

const json = { responseType: 'text' };

function count(response) {
  const failed = response.status === 0 || response.status >= 400;
  falhas.add(failed);
  if (response.status === 0) semResposta.add(1);
  if (response.status >= 500) erros5xx.add(1);
  return !failed;
}

function fetchToken() {
  const response = http.get(`${BASE}/api/identity/antiforgery`, { ...json, tags: { name: 'antiforgery' } });
  if (!count(response)) return null;
  try { return JSON.parse(response.body).requestToken; } catch { return null; }
}

function write(method, path, body, name) {
  const send = () => http.request(method, `${BASE}${path}`, JSON.stringify(body), {
    ...json,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf || '' },
    tags: { name },
  });
  let response = send();
  // o token vale para quem está logado: depois do login ele é trocado, como o site faz
  if (response.status === 400 && response.body && response.body.includes('antifalsifica')) {
    csrf = fetchToken();
    response = send();
  }
  return response;
}

function signIn() {
  const account = accounts[(__VU - 1) % accounts.length];
  csrf = fetchToken();
  if (!csrf) return false;
  const response = write('POST', '/api/identity/login', { loginIdentifier: account.login, password: account.password }, 'login');
  if (response.status === 429) {
    loginBarrado.add(1);
    falhas.add(true);
    return false;
  }
  if (!count(response)) return false;
  logins.add(1);
  csrf = fetchToken();
  return csrf !== null;
}

function loadHome() {
  const response = http.get(`${BASE}/api/learning/home`, { ...json, tags: { name: 'home' } });
  if (!count(response)) return null;
  try {
    const home = JSON.parse(response.body);
    const found = [];
    for (const experience of home.experiences || []) {
      for (const lesson of experience.lessons || []) {
        if (!lesson.isBonus && lesson.durationMilliseconds > 0) {
          found.push({ trackId: experience.track.id, lessonId: lesson.id, durationMs: lesson.durationMilliseconds });
        }
      }
    }
    return found;
  } catch {
    return null;
  }
}

function sampleVideo(url) {
  const address = url.startsWith('/') ? `${BASE}${url}` : url;
  const response = http.get(address, {
    headers: { Range: `bytes=0-${SAMPLE_BYTES - 1}` },
    responseType: 'none',
    tags: { name: 'video' },
  });
  if (response.status === 200 || response.status === 206) {
    videoPrimeiroByte.add(response.timings.waiting);
    const seconds = response.timings.receiving / 1000;
    const bytes = parseInt(response.headers['Content-Length'] || '0', 10);
    if (seconds > 0 && bytes > 0) videoMbps.add(bytes * 8 / 1e6 / seconds);
  }
}

export default function () {
  if (!signedIn) {
    signedIn = signIn();
    if (!signedIn) {
      // barrado ou sem resposta: espera e tenta de novo, como uma pessoa faria
      sleep(20 + Math.random() * 40);
      return;
    }
    lessons = null;
  }

  if (!lessons) {
    lessons = loadHome();
    if (!lessons || lessons.length === 0) {
      lessons = null;
      sleep(5 + Math.random() * 10);
      return;
    }
    lessonIndex = (__VU - 1) % lessons.length;
  }

  const lesson = lessons[lessonIndex % lessons.length];
  lessonIndex += 1;

  const start = write('POST', `/api/learning/tracks/${lesson.trackId}/lessons/${lesson.lessonId}/playback`, {}, 'playback');
  if (start.status === 401) { signedIn = false; return; }
  if (!count(start)) { sleep(5 + Math.random() * 5); return; }
  let session;
  try { session = JSON.parse(start.body); } catch { return; }

  if (__VU <= SAMPLE && session.url) sampleVideo(session.url);

  // assiste em tempo real: um trecho de 10 s a cada 10 s, do começo ao fim
  let position = 0;
  sleep(Math.random() * SAVE_EVERY_S);
  while (position < lesson.durationMs) {
    sleep(SAVE_EVERY_S);
    const end = Math.min(lesson.durationMs, position + SAVE_EVERY_S * 1000);
    const saved = write('POST', `/api/learning/tracks/${lesson.trackId}/lessons/${lesson.lessonId}/ranges`,
      { sessionId: session.sessionId, startMilliseconds: position, endMilliseconds: end, positionMilliseconds: end }, 'salvar');
    if (saved.status === 401) { signedIn = false; return; }
    if (count(saved)) salvamentos.add(1);
    else if (saved.status >= 400 && saved.status < 500) salvamentoRecusado.add(1);
    position = end;
  }
}

export function handleSummary(data) {
  const metric = (name, stat) => {
    const found = data.metrics[name];
    return found && found.values[stat] !== undefined ? found.values[stat] : null;
  };
  const ms = value => (value === null ? '-' : `${value.toFixed(0)} ms`);
  const lines = [
    `Rodada: ${LABEL}`,
    `Usuários no pico: ${metric('vus_max', 'max')}`,
    `Requisições: ${metric('http_reqs', 'count')} (${(metric('http_reqs', 'rate') || 0).toFixed(1)}/s na média)`,
    `Falhas: ${((metric('falhas', 'rate') || 0) * 100).toFixed(2)}%`,
    `Logins: ${metric('logins_ok', 'count') || 0} ok, ${metric('login_429', 'count') || 0} barrados (429)`,
    `Salvamentos: ${metric('salvamentos_ok', 'count') || 0} ok, ${metric('salvamento_recusado', 'count') || 0} recusados`,
    `Erros 5xx: ${metric('erros_5xx', 'count') || 0}; sem resposta: ${metric('sem_resposta', 'count') || 0}`,
    `Salvar  p50 ${ms(metric('http_req_duration{name:salvar}', 'med'))}  p95 ${ms(metric('http_req_duration{name:salvar}', 'p(95)'))}  p99 ${ms(metric('http_req_duration{name:salvar}', 'p(99)'))}  max ${ms(metric('http_req_duration{name:salvar}', 'max'))}`,
    `Login   p50 ${ms(metric('http_req_duration{name:login}', 'med'))}  p95 ${ms(metric('http_req_duration{name:login}', 'p(95)'))}  max ${ms(metric('http_req_duration{name:login}', 'max'))}`,
    `Vídeo (amostra) primeiro byte p50 ${ms(metric('video_primeiro_byte', 'med'))}  p95 ${ms(metric('video_primeiro_byte', 'p(95)'))}`,
    '',
  ];
  return {
    stdout: lines.join('\n'),
    [`resultados/resumo-${LABEL}.json`]: JSON.stringify(data, null, 2),
  };
}
