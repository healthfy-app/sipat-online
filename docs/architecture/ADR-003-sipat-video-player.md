# ADR-003: SIPAT Video Player como componente próprio

**Status:** Aceito
**Data:** 2026-11-14
**Decisores:** dono do produto (HealthEz)
**Relacionados:** ADR-001 (player e entrega de vídeo; a parte de entrega será substituída pelo ADR-002: VM + Cloudflare R2, vídeos em 720p e 480p, link assinado)

## Contexto

O dono do produto quer que o player seja **nosso** e evolua muito, como uma peça do produto, não como um detalhe de uma tela.

### Como está hoje

O "player" está dividido em três lugares:

| Onde | Linhas | O que faz |
|---|---|---|
| `src/Web/SipatOnline.Web/src/player/SipatPlayer.tsx` (+ CSS e o carregador do Media Chrome) | ~340 | **Só a interface**: botões, linha do tempo travada no que já foi assistido, marcadores de atividade, tela cheia (inclusive no iPhone) |
| `src/Web/SipatOnline.Web/src/learning/LearningTrackPage.tsx` | ~300 das 749 | **As regras da SIPAT**: faixas assistidas (cobertura), ponto mais distante, bloqueio de avanço, velocidade fixa em 1x, retomada, salvar a cada 10 s, ao pausar, ao sair da página e ao esconder a aba, expiração da sessão de vídeo |
| `src/Web/SipatOnline.Web/src/VideoPreview.tsx` | 56 | Uma **segunda cópia** da lógica de pausar o vídeo para abrir um jogo (prévia do criador) |

Consequências disso:
- **A tela tem que montar o player inteiro.** Qualquer tela nova que toque vídeo tem que reescrever as regras ou copiar o `LearningTrackPage`.
- **As regras não têm teste isolado.** A matemática de cobertura e bloqueio está misturada com o estado da tela.
- **A pausa para jogos existe duas vezes**, com comportamentos que podem divergir.
- **Não dá para desenvolver o player sozinho**, sem subir o app, logar e abrir um Dia.

O que já está bem feito e se mantém:
- O `SipatPlayer` não cria o `<video>` e não chama a API: já é uma fronteira limpa.
- O Media Chrome é carregado sob demanda, em um pedaço próprio do bundle.
- O CSS é próprio (sem Tailwind dentro do player).
- **O servidor valida as faixas assistidas** (`LearningProgress.cs`). O bloqueio no navegador é experiência do usuário; a prova de que alguém assistiu é do servidor. Isso continua assim: quem souber mexer no navegador consegue burlar a interface, mas não o registro.

### O que o produto precisa do player

- A mesma experiência em todas as telas: participante, prévia do criador, catálogo.
- Regras configuráveis por SIPAT: assistir em ordem, velocidade fixa, cobertura mínima de 90%.
- Pausar para jogos e atividades em momentos marcados.
- Funcionar bem em celular simples e em conexão ruim (720p e 480p agora, HLS depois).
- Espaço para evoluir: escolha de qualidade, estatísticas de travamento, HLS, capítulos e próximo vídeo automático.

## Decisão

Criar o **SIPAT Video Player** como um pacote próprio no repositório, em duas camadas:

```
SipatVideoPlayer/
  core/   ← regras em TypeScript puro, sem React: cobertura, bloqueio, velocidade,
            retomada, pontos de atividade, quando salvar, fontes e qualidade
  react/  ← o componente <SipatVideoPlayer>: interface (Media Chrome + nossos controles)
            ligada ao core
  playground/ ← página para desenvolver e testar o player sozinho, com vídeos de exemplo
```

O app usa o player por uma interface pequena: entrega a fonte, as regras e os pontos de atividade, e recebe **eventos** ("trecho assistido", "tentou avançar", "chegou numa atividade", "terminou", "erro"). **O player não chama a API**: a tela decide o que salvar e quando. Assim o mesmo player serve para o participante, para a prévia e para o playground.

As decisões abaixo detalham isso. Cada uma tem a recomendação marcada e precisa ser confirmada.

## Decisões a tomar

### D1. Onde fica a pasta

| Opção | Caminho | Prós | Contras |
|---|---|---|---|
| A | `src/SipatVideoPlayer/` (como foi pedido) | visível como peça do produto, ao lado de `Api`, `Modules`, `Web` | precisa de um `package.json` na raiz do repositório para ligar as duas pastas de JavaScript; os Dockerfiles do frontend e o CI passam a copiar e instalar a partir da raiz |
| **B (recomendada)** | `src/Web/SipatVideoPlayer/`, ao lado de `src/Web/SipatOnline.Web/` | todo o JavaScript continua dentro de `src/Web` (um só `node_modules` e um só lockfile em `src/Web`); Docker e CI mudam pouco | fica "dentro de Web", mas como pasta irmã do app, não dentro dele |

**Decidido (2026-11-14): B, `src/Web/SipatVideoPlayer/`.**

**Por que B:** o player é código de navegador e sempre vai ser instalado e compilado junto com o frontend. Deixar tudo de JavaScript sob `src/Web` mantém a regra simples ("`src/Web` = tudo que roda no navegador") e evita mexer na raiz do repositório e nos três Dockerfiles. Se o dono do produto preferir A, funciona igual; o custo é só a reorganização da instalação.

### D2. Como o app usa o pacote

| Opção | Prós | Contras |
|---|---|---|
| **A (recomendada): workspace npm, o app importa o código-fonte (`@sipat/video-player`)** | sem etapa de build; mudou o player, o app já vê; um só `npm ci` | o pacote só é usável dentro deste repositório |
| B: publicar no npm (privado) com versões | outros projetos podem usar | build, versão e publicação a cada mudança; lento para quem quer evoluir rápido |
| C: alias do Vite apontando para a pasta | nenhuma configuração de npm | as dependências do player (Media Chrome) não são encontradas fora da pasta do app; frágil |

**Por que A:** o objetivo é evoluir muito e rápido. Publicar no npm só faz sentido quando outro produto for usar o player; nesse dia, o Vite gera a versão compilada do mesmo código.

### D3. Tecnologia da interface

| Opção | Prós | Contras |
|---|---|---|
| **A (recomendada): core em TypeScript puro + componente React** | as regras não dependem de React e podem ser testadas sozinhas; o app inteiro já é React | para usar fora de React, precisa de uma camada nova |
| B: Web Component (`<sipat-video-player>`) desde já | funciona em qualquer site, app ou sistema de treinamento | mais trabalho agora, sem nenhum uso fora de React hoje |
| C: tudo em React (como hoje) | nada novo para aprender | as regras continuam presas ao React e às telas |

**Por que A:** separar o core é o que dá o ganho real (testes e reuso entre telas). O Web Component vira um passo pequeno depois, porque ele só envolveria o mesmo core.

### D4. Media Chrome ou controles 100% nossos

| Opção | Prós | Contras |
|---|---|---|
| **A (recomendada): manter o Media Chrome por baixo, com a API pública só nossa** | acessibilidade, teclado, tela cheia e carregamento já resolvidos; suporta HLS (`hls-video-element`) quando precisarmos | uma dependência externa (open source, mantida pela Mux) |
| B: escrever todos os controles do zero | controle total | semanas refazendo o que já funciona, com risco em acessibilidade e iPhone |

**Por que A:** a linha do tempo, que é a parte que nos diferencia, **já é nossa** (`Scrubber`). O resto é encanamento. Como o app só conhece as props e os eventos do nosso player, dá para trocar o Media Chrome no futuro sem mexer em nenhuma tela.

### D5. O que é responsabilidade do player e o que é da tela

| No player | Na tela (app) |
|---|---|
| tocar, pausar, tela cheia, teclado | buscar a sessão e o link do vídeo na API |
| bloquear o avanço além do já assistido (se a regra estiver ligada) | salvar progresso na API |
| velocidade fixa (se ligada) | navegar entre vídeos e Dias |
| calcular as faixas assistidas e avisar por evento | mensagens de "progresso salvo" e de erro de rede |
| decidir **quando** vale salvar (a cada ~10 s, ao pausar, ao esconder a aba) e emitir o evento | o jogo em si (o player abre um espaço e pausa; a tela coloca o jogo) |
| pausar nos pontos de atividade e retomar quando a tela avisar | certificados, pontuação |
| escolher a fonte (720p/480p) e mostrar erro com "tentar de novo" | |
| retomar de onde parou (posição informada pela tela) | |

**Regra:** o player nunca importa nada do app (`api.ts`, rotas, sessão). Um teste de arquitetura no frontend garante isso.

### D6. Jogos

| Opção | Prós | Contras |
|---|---|---|
| **A (recomendada): jogos ficam fora; o player tem um espaço de atividade** | o player continua focado em vídeo; os jogos (`src/games`) evoluem no seu ritmo | — |
| B: jogos dentro do pacote do player | tudo junto | o pacote fica enorme e mistura dois produtos |

Os jogos podem virar um pacote próprio no futuro (`SipatGames`), com o mesmo modelo.

### D7. Estilo e tema

**Recomendado:** CSS próprio do pacote, com **variáveis CSS** para as cores (`--sipat-player-accent`, `--sipat-player-surface`...). Cada empresa poderá ter as cores dela sem mudar o player. Sem Tailwind dentro do pacote, para não depender da configuração do app. (Já é assim hoje, só falta a camada de variáveis.)

### D8. Textos e idioma

**Recomendado:** textos em português por padrão ("Assista para liberar", "Tela cheia"...), reunidos em um único objeto dentro do pacote. Fica fácil revisar e trocar a redação, sem montar agora um sistema de idiomas que ninguém pediu.

### D9. Testes

| Camada | Como |
|---|---|
| core | **Vitest**, testes puros: cobertura, junção de faixas, bloqueio, velocidade, pontos de atividade, quando salvar. É onde mora o risco, e é o mais barato de testar |
| componente React | Vitest + Testing Library (o que já existe hoje): botões, teclado, eventos |
| reprodução real | o jsdom não toca vídeo. Por isso o roteiro manual de `docs/ROTEIRO-TESTE-PLAYER-E-JOGOS.md` e, depois, testes no navegador com Playwright (Chrome, Safari/WebKit, celular) |

### D10. Playground

**Recomendado:** uma página própria (`npm run player`), com vídeos de exemplo, todas as regras ligáveis por botões e um registro dos eventos na tela. É ali que o player evolui sem subir a API nem logar. Já existe um precedente para os jogos (`game-lab.html`), mas ele é marcado como temporário. O playground do player é permanente.

### D11. Fontes de vídeo

**Recomendado:** a tela passa uma lista de fontes (`[{ src, qualidade: '720p' }, { src, qualidade: '480p' }]`) e o player escolhe. Primeiro pela preferência salva do participante; sem ela, pela conexão (`navigator.connection` quando o navegador informa). Também há um botão de qualidade. **HLS** entra depois como mais um tipo de fonte, carregado sob demanda, sem mudar a interface das telas.

### D12. Eventos e estatísticas

**Recomendado:** o player emite eventos tipados (`play`, `pause`, `range`, `seekBlocked`, `activity`, `ended`, `error`, `stall`, `qualityChange`). Hoje a tela usa só os de progresso. Os de travamento e qualidade abrem caminho para um painel "onde o vídeo trava" por empresa, útil para conversar com o cliente sobre a rede dele.

## Consequências

**Fica mais fácil:**
- Qualquer tela toca vídeo com as regras da SIPAT em poucas linhas.
- As regras de cobertura e bloqueio passam a ter testes próprios.
- O player evolui no playground, sem depender do app.
- O `LearningTrackPage` perde cerca de 300 linhas.

**Fica mais difícil:**
- Um pacote a mais para entender (workspace npm).
- Mudanças na interface pública do player (props e eventos) precisam de cuidado, porque várias telas dependem dela.

**Revisitar:**
- Publicar no npm, ou criar o Web Component, quando surgir um uso fora deste app.
- Trocar o Media Chrome, se algum dia ele limitar o que queremos fazer.

## Roteiro de evolução (depois da extração)

Definido pelo dono do produto em 2026-11-14, nesta ordem, cada item no playground primeiro:
1. **Fontes 720p/480p** com escolha automática e manual (depende do ADR-002).
2. **Estatísticas de travamento** por empresa (eventos `stall` e `qualityChange`).
3. **HLS** com qualidade adaptativa, servido do R2.
4. **Capítulos** e **próximo vídeo automático** no fim do Dia.

Ficaram de fora por enquanto: legendas e janela de Libras, toque duplo e aviso de retomada, marca d'água.

## Plano de implementação

1. [x] Criar o workspace npm em `src/Web` e o pacote vazio `@sipat/video-player`, ajustando os Dockerfiles do frontend e o CI.
2. [x] Mover o `SipatPlayer` (componente, CSS, carregador do Media Chrome) para o pacote, sem mudar comportamento. Os testes atuais continuam verdes.
3. [x] Extrair para o `core`, **com testes primeiro**: faixas assistidas, ponto mais distante, bloqueio, velocidade fixa e "quando salvar", a partir do `LearningTrackPage`.
4. [x] Extrair a pausa em pontos de atividade e trocar as duas cópias (participante e prévia) por ela.
5. [x] Ligar o `LearningTrackPage` e o `VideoPreview` ao novo componente por eventos; a tela fica só com a API e as mensagens.
6. [x] Criar o playground (`npm run player`).
7. [x] Adicionar o teste de arquitetura: o pacote não importa nada do app.
8. [ ] Rodar o roteiro manual em Chrome, Safari e celular antes de publicar.
