# SIPAT Video Player, entrega de vídeo e qualidade por empresa: desenho

**Data:** 2026-11-14
**Dono:** HealthEz (dono do produto)
**Decisões de origem:** ADR-001 (player e entrega, parte de entrega substituída aqui), ADR-003 (player como componente próprio) e a conversa de 14/11/2026.

## 1. Intenção

A SIPAT (Semana Interna de Prevenção de Acidentes de Trabalho) já está sendo vendida para várias empresas, para substituir a plataforma que os clientes usam hoje. O vídeo é o centro da experiência do participante, muitas vezes um operário assistindo pelo celular. O dono do produto quer:

1. **Um player nosso, que evolua muito**, separado das telas e com regras testadas.
2. **Entrega de vídeo barata e sem custo por usuário.** "A SIPAT tem que ser barata."
3. **Saber, por empresa, onde o vídeo trava.** Assim a conversa com o cliente ("é a sua rede") se baseia em números.

O padrão de uso molda o desenho. Cada empresa usa a plataforma praticamente **uma semana por ano**, com **no máximo ~600 pessoas assistindo ao mesmo tempo**, muitas vezes na mesma fábrica.

## 2. Metas, não metas e anti-metas

**Metas**
- Pacote `@sipat/video-player` em `src/Web/SipatVideoPlayer/`, com as regras da SIPAT em TypeScript puro e testado, usado pela tela do Dia e pela prévia do criador.
- Medir a qualidade de cada sessão de vídeo (início, travamentos, erros, qualidade, conexão, aparelho) e guardar no nosso banco.
- Dashboard **"Qualidade do vídeo"**, só para o operador: por empresa e uma comparação entre empresas.
- Vídeos no Cloudflare R2, convertidos no envio para 720p e 480p e entregues por link temporário.
- Custo fixo e baixo: uma VM pequena + R2, nada por participante.

**Não metas (agora)**
- Legendas, janela de Libras, toque duplo, aviso de retomada, marca d'água.
- Dashboard para o administrador da empresa cliente.
- Publicar o player no npm ou como Web Component.
- Cache local na fábrica.
- Mux, Cloudflare Stream ou qualquer serviço de vídeo pago por minuto.
- App Service e Postgres gerenciado (só quando um contrato exigir SLA).

**Anti-metas** (o que seria fracasso mesmo funcionando)
- **A medição atrapalhar o vídeo.** Se o envio das métricas falhar, nada aparece para o participante e o vídeo segue.
- **O navegador virar a prova de que alguém assistiu.** A conclusão continua sendo validada no servidor (`LearningProgress`, `IPlaybackEvidenceVerifier`); o player só melhora a experiência.
- **Dados dos colaboradores saírem para terceiros.** Nenhuma ferramenta de analytics externa.
- **Custo crescer com o número de participantes.**
- **Regressão no que já funciona:** bloqueio de avanço, velocidade 1x, 90%, jogos, salvar ao sair e tela cheia no iPhone.

## 3. Restrições

- Frontend: React 19, Vite, Vitest, Tailwind v4 no app; o player usa CSS próprio. Media Chrome 4.x já instalado.
- Backend: .NET 10, monólito modular (`Modules/*/Domain|Application`, `Infrastructure`, `Api`), PostgreSQL 16, EF Core com migrations, testes de arquitetura.
- Produção: VM com Docker (`deploy/compose.production.yaml`), Cloudflare só no DNS para a VM.
- Builds do frontend: `deploy/nginx/Dockerfile`, `src/Web/SipatOnline.Web/Dockerfile`, `Dockerfile.local` e o CI (`.github/workflows/ci.yml`) instalam a partir de `src/Web/SipatOnline.Web`.
- Sem biblioteca de gráficos no frontend. Os gráficos do dashboard são feitos com HTML/SVG próprios, seguindo a skill de visualização de dados do projeto.

## 4. Abordagens consideradas

| Tema | Opções | Escolhida | Por quê |
|---|---|---|---|
| Entrega de vídeo | VM servindo o MP4 · Azure Blob · Mux/Cloudflare Stream · **R2 + conversão própria** | **R2 + ffmpeg** | saída de dados grátis, sem custo por participante; o que a Mux traria a mais (HLS adaptativo) dá para fazer depois no próprio R2. Azure Blob no Brasil cobra ~US$ 0,18/GB, ~R$ 1.000 por SIPAT de 600 pessoas |
| Hospedagem do app | **VM pequena** · App Service + Postgres gerenciado | **VM** | 600 simultâneos geram ~100 req/s, folgado para 2 núcleos/4 GB quando o vídeo não sai da VM; a diferença real é operação, coberta por backup diário no R2 |
| Onde mora o player | `src/SipatVideoPlayer` · **`src/Web/SipatVideoPlayer`** | **`src/Web/SipatVideoPlayer`** (decisão do dono) | todo o JavaScript fica sob `src/Web`, com um só `npm ci` |
| Forma do pacote | **workspace npm com código-fonte** · npm publicado · alias do Vite | **workspace** | evoluir rápido, sem build nem versão |
| Camadas | **core em TS puro + React** · Web Component · tudo em React | **core + React** | regras testáveis e reutilizáveis; Web Component vira um passo pequeno depois |
| Controles | **Media Chrome por baixo** · do zero | **Media Chrome** | acessibilidade e tela cheia resolvidas; a linha do tempo já é nossa; a API pública é só nossa, então dá para trocar depois |
| Métricas | junto do progresso · **resumo por sessão, tabela própria** · serviço externo | **resumo por sessão** | pega até a falha antes do primeiro progresso; dados nossos e cruzáveis; custo zero |

## 5. Desenho

### 5.1 Pacote `@sipat/video-player`

```
src/Web/
  package.json                 workspaces: ["SipatOnline.Web", "SipatVideoPlayer"]; um lockfile
  SipatOnline.Web/             o app (depende de "@sipat/video-player": "*")
  SipatVideoPlayer/
    package.json               name @sipat/video-player; exports apontando para src (sem build)
    src/
      core/                    TypeScript puro, sem React e sem DOM além de HTMLVideoElement
        coverage.ts            faixas assistidas, junção, ponto mais distante
        rules.ts               bloqueio de avanço, velocidade fixa
        checkpoints.ts         pontos de atividade: quando pausar, rebobinar reabre
        saveSchedule.ts        quando emitir "salvar" (10 s, pausa, aba escondida, saída)
        quality.ts             medição de qualidade da sessão (ver 5.3)
        sources.ts             escolha de fonte 720p/480p (ver 5.4)
        attach.ts              liga tudo a um <video> e emite eventos tipados
        events.ts              tipos dos eventos
      react/
        SipatVideoPlayer.tsx   o componente (o SipatPlayer atual, ligado ao core)
        Scrubber.tsx
        loadMediaChrome.ts
        SipatVideoPlayer.css   com variáveis CSS (--sipat-player-*)
        texts.ts               todos os textos em português, num só lugar
      index.ts
    playground/                página própria: `npm run player` em src/Web
      index.html, main.tsx     vídeos de exemplo, regras ligáveis, registro de eventos e métricas
    test/                      Vitest
```

**Interface do componente (o que as telas veem):**

```ts
<SipatVideoPlayer
  sources={[{ src, quality: '720p' }, { src, quality: '480p' }]}   // ou uma só
  title="Uso do EPI"
  rules={{ watchInOrder: true, fixedSpeed: true }}                  // ausente = livre (prévia)
  resumeAt={151.2}                                                  // segundos, informado pela tela
  furthest={151.2}                                                  // já liberado no servidor
  checkpoints={[{ id, seconds, title, done }]}
  activity={<GameStage …/>}                                         // a tela coloca o jogo; o player pausa e mostra
  onEvent={(event) => …}                                            // ver abaixo
/>
```

**Eventos** (`core/events.ts`):
- `range` { startMs, endMs }: trecho assistido de verdade, para a tela salvar.
- `save` { reason: 'interval' | 'pause' | 'hidden' | 'leave' | 'seeked' | 'ended' }: hora de salvar.
- `seekBlocked`: tentou passar do liberado (a tela mostra o aviso).
- `checkpoint` { id }: chegou num ponto de atividade (o player já pausou).
- `ended`, `error` { kind: 'network' | 'decode' | 'source' }.
- `quality` { summary } (ver 5.3).

**Regras de responsabilidade:**
- O player **nunca importa o app** (`api.ts`, rotas, sessão). Um teste de arquitetura no frontend garante isso.
- O player não sabe salvar. Ele diz **o quê** e **quando**; a tela chama a API.
- A tela do Dia (`LearningTrackPage`) fica com: buscar a sessão de vídeo, salvar o progresso, mensagens de "salvo"/erro, navegação, expiração da sessão e "salvar antes de sair por um link".
- A prévia (`VideoPreview`) passa a usar `checkpoints` e `activity` do player, apagando a segunda cópia da lógica de pausa.

**Comportamento que precisa continuar idêntico** (testes de regressão antes de mover):
- Não avança além do liberado: arrastar, clicar, teclado (setas, End) e `seeking` nativo voltam ao ponto liberado e disparam `seekBlocked`.
- Velocidade fixa em 1x.
- Salva a cada 10 s (só faixas ≥ 8 s nesse caso), ao pausar, ao terminar, ao esconder a aba e após `seeked`. Uma faixa só é aceita se for contínua (salto > 5 s ou voltar no tempo começa uma faixa nova).
- Tela cheia mantém nossos controles; no iPhone, ocupa a página.
- Rebobinar antes de um ponto de atividade faz o jogo abrir de novo (prévia).

### 5.2 Entrega de vídeo (ADR-002, a registrar)

```
Cloudflare: DNS + HTTPS
 ├─► VM (2 núcleos / 4 GB, Brasil): nginx + API + Postgres (compose atual)
 │      └─ backup diário do Postgres → R2 (bucket separado, retenção de 30 dias)
 └─► R2 (bucket de vídeos): {videoId}/720p.mp4, {videoId}/480p.mp4
```

- **Envio:** o operador envia o vídeo (até 250 MB, como hoje). A API grava o original numa pasta temporária e marca o vídeo como **"processando"**. Um trabalho em segundo plano (`BackgroundService` com fila em tabela) roda o **ffmpeg** (instalado na imagem da API) e gera:
  - 720p: H.264 High, ~2 Mbps, AAC 128 kbps, `+faststart`;
  - 480p: H.264 Main, ~1 Mbps, AAC 96 kbps, `+faststart`;
  - envia os dois ao R2 (API S3), grava a duração e marca **"pronto"** ou **"falhou"** (com o erro). O original é apagado depois do sucesso.
  - **Uma conversão por vez**, com prioridade baixa de CPU (`nice`), para não disputar a VM com quem está assistindo. Um vídeo de 5 minutos leva poucos minutos numa VM de 2 núcleos. Na Biblioteca, o vídeo aparece como "processando" até ficar pronto e não pode ser usado num Dia antes disso.
- **Armazenamento:** `R2PlatformCourseVideoStorage` implementa `IPlatformCourseVideoStorage`. O `FilePlatformCourseVideoStorage` continua para desenvolvimento.
- **Reprodução:** a verificação de acesso (empresa, atribuição ativa, revisão atual), que hoje está dentro do endpoint `/api/learning/lessons/{id}/media`, **sai para um serviço da Application**, com teste. Quem usa esse serviço é a criação da sessão de vídeo (`POST .../lessons/{id}/playback`):
  - com o provedor **R2**, a sessão devolve as fontes (`720p`, `480p`) como **links assinados do R2**, com validade igual à da sessão de vídeo (mínimo de 2 horas), e o navegador baixa direto do R2;
  - com o provedor **File** (desenvolvimento), a sessão continua apontando para a rota `/media`, que passa a chamar o mesmo serviço.
- **Vídeos já enviados:** um comando único (`--convert-catalog-videos`) converte e envia ao R2 o que está no volume.
- **Configuração:** `SipatOnline__VideoStorage__Provider=R2|File`, conta, chave, segredo e bucket do R2 em `deploy/.env.production`.
- **Termos da Cloudflare:** confirmar, antes de ativar em produção, que servir vídeo a partir do R2 é permitido. Se não for possível confirmar até o go-live, a SIPAT de 1º/12 roda com o provedor File na VM (vídeos já em 720p) e o R2 entra logo depois.

### 5.3 Medição de qualidade (core/quality.ts)

Uma **sessão de qualidade** começa quando o vídeo é carregado no player e termina ao sair, trocar de vídeo ou terminar.

| Campo | Como medir |
|---|---|
| `startupMs` | do primeiro `play` pedido (clique ou automático) até o primeiro `playing`; nulo se nunca começou |
| `neverStarted` | pediu play e não chegou a `playing` em 30 s, ou deu erro antes |
| `stallCount` | eventos `waiting` **depois** de já ter tocado, fora de um `seeking`, com duração ≥ 500 ms |
| `stallMs` | soma do tempo entre `waiting` e o próximo `playing` (mesmo filtro) |
| `watchedMs` | tempo realmente tocando (relógio de parede entre `playing` e `pause`/`waiting`/`ended`) |
| `errorKind` | `MediaError.code` traduzido (rede, decodificação, fonte), se houver |
| `quality` | `720p` ou `480p` (fonte em uso; a última, se trocou) |
| `qualitySwitches` | quantas trocas de qualidade |
| `connection` | `navigator.connection.effectiveType` e `downlink`, quando existirem (Chrome/Android); senão "desconhecida" |
| `device` | `phone`, `tablet` ou `desktop` (pela largura da tela e por toque, não pelo user-agent) |
| `startedAt` | instante em que começou, em UTC, mais o **deslocamento do fuso do aparelho** em minutos, para "por hora do dia" na hora local de quem assistiu |

**Envio:** o player emite o evento `quality` com o resumo ao terminar, pausar por mais de 30 s, esconder a aba ou sair, e a cada 60 s em vídeos longos (mesmo `qualitySessionId`; o servidor substitui o resumo anterior). A tela envia para `POST /api/learning/tracks/{trackId}/playback-quality` com `fetch(..., { keepalive: true })`. O `keepalive` faz a requisição sobreviver ao fechamento da página e, ao contrário do `sendBeacon`, permite mandar o cabeçalho `X-CSRF-TOKEN` que a API exige nos POSTs (`api.ts` já busca esse token). O corpo fica bem abaixo do limite de 64 KB do `keepalive`. Se falhar, ignora.

**Backend:**
- **Domínio/Application** (módulo Learning): `PlaybackQualityReport` com validação dos limites (tempos não negativos, `stallMs ≤ 24 h` etc.) e o caso de uso `RecordPlaybackQuality`.
- **Tabela** `learning.PlaybackQualitySessions`: `Id` (= `qualitySessionId`, vindo do navegador), `TenantId`, `ParticipantId`, `LessonId`, `VideoId`, `SipatEventId`, `DayPosition`, `PlaybackSessionId`, os campos acima, `ReceivedAt`. O servidor preenche `SipatEventId` e `DayPosition` a partir da trilha da aula (`LearningTracks` já tem os dois); o navegador só manda `lessonId` e `playbackSessionId`. Gravação idempotente por `Id`. Índices por (`TenantId`, `SipatEventId`) e (`StartedAt`).
- **Segurança:** só o próprio participante, autenticado, grava, e só para uma aula atribuída a ele. Um `Id` já usado por outra pessoa é recusado. Empresa e participante vêm do servidor, nunca do corpo da requisição.
- **Volume:** ~18 mil linhas por SIPAT de 600 pessoas. Sem retenção especial por enquanto.

### 5.4 Escolha de qualidade (core/sources.ts)

1. Se o participante escolheu uma qualidade antes (guardada no navegador), usa essa.
2. Senão, com `navigator.connection`: `effectiveType` `2g`/`3g` ou `downlink < 2` → 480p; senão 720p.
3. Sem essa informação (iPhone), começa em 720p.
4. **Troca automática para baixo:** 2 travamentos em 60 s em 720p → muda para 480p mantendo a posição e as regras, uma vez por sessão.
5. Botão de qualidade nos controles: "Automática · 720p · 480p".

Com uma fonte só, o player funciona igual, sem botão.

### 5.5 Dashboard "Qualidade do vídeo" (só operador)

**Onde:**
- No menu da empresa (`CompanyNav`), uma entrada nova **"Qualidade do vídeo"**, em `/platform/companies/:companyId/qualidade`.
- No menu da operação, **"Qualidade do vídeo"**, em `/platform/qualidade`: comparação entre empresas.
- Ambos exigem a política `ManagePlatform`. O administrador da empresa não vê.

**Tela da empresa** (visual da operação: cabeçalho claro e compacto, cartões brancos arredondados, amarelo só na ação principal):

```
Qualidade do vídeo · Empresa Alfa      SIPAT 2026 ▾   Todos os dias ▾   [Baixar resumo]

[ vídeos assistidos ] [ % sessões com travamento ] [ tempo médio p/ começar ] [ % do tempo travado ]
   cada cartão com semáforo: bom · atenção · ruim

Travamentos por hora do dia (barras)
Por conexão · Por aparelho · Por qualidade · Por Dia (barras horizontais)
Vídeos que mais travam (tabela) · Pessoas com problema (lista)
```

**Indicadores e limites** (configuráveis no código, num só lugar):

| Indicador | Bom | Atenção | Ruim |
|---|---|---|---|
| % do tempo travado | < 1% | 1 a 3% | > 3% |
| % de sessões com travamento | < 10% | 10 a 25% | > 25% |
| Tempo médio para começar | < 2 s | 2 a 5 s | > 5 s |
| % de sessões que não começaram | < 1% | 1 a 3% | > 3% |

- **Pessoas com problema:** participantes com sessões que não começaram ou com tempo travado acima de 10%, ordenados por gravidade, com link para o progresso da pessoa.
- **Sem dados ainda:** um estado vazio que explica o que vai aparecer quando a SIPAT começar.
- **Baixar resumo:** PDF de uma página (mesmo gerador dos certificados) com os 4 indicadores, o gráfico por hora e uma frase de conclusão. É material interno do operador para levar ao cliente.
- **API:** `GET /api/platform/companies/{companyId}/playback-quality?sipatId=&day=` devolve tudo já agregado (o Postgres agrega; nenhuma lista bruta vai ao navegador, exceto "pessoas com problema", limitada a 50). Para a comparação, `GET /api/platform/playback-quality?from=&to=`.

**Tela de comparação:** tabela com uma linha por empresa que teve SIPAT no período: os 4 indicadores com semáforo, ordenável, e clique para abrir a empresa.

### 5.6 Testes

- **core:** Vitest puro para cobertura, bloqueio, velocidade, pontos de atividade, agenda de salvamento, medição de qualidade (sequências simuladas de eventos `play/playing/waiting/seeking/pause/ended/error`) e escolha de fonte. **Os casos de 5.1 "continuar idêntico" viram testes antes da extração.**
- **React:** Testing Library para controles, teclado, eventos, botão de qualidade e espaço de atividade.
- **Backend:** testes de domínio para `PlaybackQualityReport`; integração para gravar (dono certo, idempotência, recusa de outra empresa), agregação do dashboard, conversão (com um vídeo pequeno de teste, se houver ffmpeg no CI; senão marcado para rodar só onde houver) e links assinados do R2 (com um fake do armazenamento).
- **Arquitetura:** o pacote do player não importa o app; endpoints não usam `PlatformDbContext` nas rotas novas.
- **Manual:** `docs/ROTEIRO-TESTE-PLAYER-E-JOGOS.md` em Chrome, Safari/iPhone e Android, com throttling de rede para provocar travamentos e conferir que aparecem no dashboard.

### 5.7 Ordem de entrega

A SIPAT do primeiro cliente (600+ pessoas) começa provavelmente em **1º/12/2026**, 17 dias depois deste desenho. A ordem segue duas regras:
- antes do go-live entra só o que **reduz risco** ou **coleta o dado da primeira SIPAT**;
- o player que funciona hoje **não é reestruturado** às vésperas do go-live.

Cada fase termina com os testes verdes e o app funcionando.

**Etapa 1 — antes do go-live (até ~25/11; depois disso, só correções)**

0. **Reprodução em produção (bloqueio encontrado ao planejar, 14/11):** fora do desenvolvimento, o sistema usa `UnconfiguredVideoPlaybackProvider`, que recusa toda sessão de vídeo e toda validação de trecho. Ou seja, hoje ninguém assiste em produção. Entra um provedor de produção para os vídeos do catálogo, com as sessões de vídeo guardadas no Postgres (sobrevivem a um reinício da API) e a mesma regra de evidência do provedor de desenvolvimento, levada para o domínio.
1. **Rede de segurança:** testes de regressão do comportamento atual do player e da tela do Dia (lista de 5.1).
2. **Medição de qualidade ligada ao player atual:** `quality.ts` escrito já no formato do futuro `core` (TypeScript puro, ligado a um `<video>`), dentro de `src/Web/SipatOnline.Web/src/player/core/`. Também entram o endpoint, a tabela e a migration. Sem dashboard ainda: os dados ficam guardados desde o primeiro dia da SIPAT.
3. **Entrega pelo R2, versão mínima:**
   - `R2PlatformCourseVideoStorage` e links assinados na sessão de vídeo; as rotas de arquivo redirecionam para o link assinado depois da verificação de acesso que já existe (tirar essa verificação do endpoint fica para a Etapa 2);
   - um comando para enviar ao R2 os vídeos já existentes;
   - **sem conversão automática ainda**: os vídeos são reconvertidos para 720p antes do envio com um script ffmpeg versionado no repositório (`deploy/scripts/convert-video`).

   Isso tira o vídeo da VM antes de 600 pessoas assistirem ao mesmo tempo (~1,2 Gbps).
4. **Backup diário do Postgres no R2** e teste de restauração.
5. **Roteiro manual** em Chrome, Safari/iPhone e Android, com rede lenta simulada, conferindo que os travamentos chegam à tabela.

**Etapa 2 — durante e logo depois da primeira SIPAT (dezembro)**

6. **Dashboard** da empresa e comparação, já com os dados reais da primeira SIPAT.
7. **Workspace e pacote:** `src/Web/package.json`, `@sipat/video-player`, Dockerfiles e CI; o player muda de pasta sem mudar comportamento.
8. **Core:** extrair as regras para o `core`, com testes; a tela do Dia e a prévia passam a usar eventos; a medição de qualidade se muda para o pacote.
9. **Playground** (`npm run player`).
10. **Conversão automática no envio** (720p + 480p, fila, "processando"). Registrar o ADR-002.
11. **Escolha de qualidade** no player (depende da 10).

**Etapa 3 — evolução**

12. **HLS** no R2.
13. **Capítulos + próximo vídeo automático.**

## 6. Decisões tomadas pelo dono do produto

- Player nosso, para evoluir muito; pacote em `src/Web/SipatVideoPlayer`.
- Roteiro: 720p/480p → estatísticas de travamento → HLS → capítulos e próximo vídeo automático. Fora: legendas, Libras, toque duplo, aviso de retomada, marca d'água.
- Dashboard de qualidade **só para o operador**.
- Sem cache local, sem Mux. Custo baixo e sem custo por usuário.
- Máximo de ~600 pessoas assistindo ao mesmo tempo.

## 7. Escolhas minhas (para o dono conferir)

- Modelo de métrica B (resumo por sessão, tabela própria) e guardar por participante.
- Limites dos semáforos (tabela em 5.5), com base em referências de mercado; ajustáveis.
- Links assinados válidos por 2 horas; conversão com os parâmetros de 5.2; troca automática para 480p após 2 travamentos em 60 s.
- Conversão dentro da API com `BackgroundService` e fila em tabela, sem serviço de fila externo.
- Gráficos em HTML/SVG próprios, sem biblioteca nova.
- O resumo em PDF reaproveita o gerador dos certificados.

## 8. Datas

- **SIPAT do primeiro cliente:** provavelmente 1º/12/2026 (informado em 14/11/2026). Etapa 1 pronta até ~25/11, para sobrar uma semana de testes nos aparelhos.

## 9. Deixado para quem implementar

- Nomes finais de classes, arquivos e rotas internas, desde que sigam as convenções do projeto.
- Detalhes visuais do dashboard dentro do visual já aprovado da operação.
- Como simular `navigator.connection` e os eventos de mídia nos testes.
