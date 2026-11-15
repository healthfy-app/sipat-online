# Roteiro de teste: player e jogos entre navegadores

Objetivo: confirmar que o SipatPlayer e os 6 jogos funcionam em Chrome, Edge, Firefox, Safari (Mac) e
no celular (iPhone e Android). Até agora só foi testado no navegador interno do app (base Chromium).

## Antes de começar

- **Conta de teste:** `maria.jose`, empresa Microsoft (`microsoft-demo`), senha no `.docker-local-credentials.txt`.
- **Curso:** "Teste Novembro - com jogo". A primeira aula tem uma atividade que abre aos 20 segundos.
- **Como abrir no computador:** `https://microsoft-demo.localhost:5188` (o certificado é de desenvolvimento;
  aceite o aviso do navegador).
- **Como abrir no celular:** o endereço `*.localhost` só existe no próprio computador, então o celular não
  alcança. É preciso um endereço que o celular enxergue (um ambiente de teste na internet ou um túnel).
  Ainda não verifiquei como a empresa é escolhida pelo endereço fora do `localhost`; confirme isso antes.
- **Anote para cada navegador:** nome, versão e sistema. Se algo falhar, capture a tela.

## A. Player (aula do participante)

Marque ✅ ou ❌ em cada navegador.

| # | O que fazer | O que deve acontecer | Chrome | Edge | Firefox | Safari Mac | iPhone | Android |
|---|---|---|---|---|---|---|---|---|
| A1 | Abrir a aula | A barra SIPAT aparece (play, voltar 10 s, volume, tempo, tela cheia); sem controles nativos | | | | | | |
| A2 | Tocar e pausar (botão, tecla espaço) | Toca e pausa; o botão grande some ao tocar | | | | | | |
| A3 | Clicar na linha do tempo **antes** do ponto assistido | O vídeo vai para lá | | | | | | |
| A4 | Clicar **depois** do ponto assistido | Volta ao ponto liberado e aparece o aviso "Assista ao vídeo em sequência" | | | | | | |
| A5 | Passar o mouse (ou tocar) na linha | Mostra o tempo; além do liberado, mostra "Assista para liberar" | | | | | | |
| A6 | Teclado na linha do tempo: ←, →, Home, End | ← volta 5 s; → só até o liberado | | | | | | |
| A7 | Procurar menu de velocidade ou clicar com o botão direito no vídeo | Não há opção de acelerar; se houver, a velocidade volta a 1x | | | | | | |
| A8 | Tela cheia (botão) | Mantém a nossa barra; Esc ou botão sai | | | | | | |
| A9 | Em tela cheia, deixar o jogo chegar aos 20 s | Sai da tela cheia e o jogo aparece sobre a aula | | | | | | |
| A10 | Girar o celular (só celular) | Layout se ajusta; barra continua utilizável | | | | | | |
| A11 | Marcador de atividade na linha | Ponto amarelo perto de 0:20; título ao passar o mouse | | | | | | |
| A12 | Recarregar a página no meio da aula | Retoma de onde parou | | | | | | |

**Atenção especial no iPhone:** em A8, a tela cheia deve ser a da página (a nossa barra), não a do sistema.
Se aparecer o player do sistema com barra de avançar, anote a versão do iOS.

## B. Jogos

Para cada jogo: abrir pela aba "Jogos e perguntas" (botão **Testar**), ou pelo vídeo. Marque se funciona.

| # | Jogo | O que testar | Chrome | Edge | Firefox | Safari Mac | iPhone | Android |
|---|---|---|---|---|---|---|---|---|
| B1 | Todos | Abertura, contagem 3-2-1, placar com combo, vitória com estrelas, "Jogar de novo", Esc fecha | | | | | | |
| B2 | Quiz | Responder por clique e pelas teclas A/B/C | | | | | | |
| B3 | Cenário | Cartão da situação legível; feedback "atitude arriscada" | | | | | | |
| B4 | Memória | Cartas viram em 3D sem piscar; mesma carta não clica duas vezes | | | | | | |
| B5 | Quebra-cabeça | Arrastar peça sobre peça; clicar em duas peças; página não rola enquanto arrasta | | | | | | |
| B6 | Ordenação | Arrastar pela alça; setas ↑ ↓; página rola normalmente fora da alça | | | | | | |
| B7 | Seguro ou arriscado | Arrastar a carta para os lados (carimbo aparece); botões; setas ← → | | | | | | |
| B8 | Caça aos riscos (jogo antigo) | Lanterna segue o mouse (só computador); toque marca o risco | | | | | | |
| B9 | Qualquer | Com "reduzir movimento" ligado no sistema, tudo funciona sem animação | | | | | | |

**Atenção especial no celular:** em B5 a B7, arrastar com o dedo não pode rolar a página junto. Em B4,
confira se as cartas cabem na tela sem rolar para os lados.

## C. Quem cria (computador)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Cursos → Jogos e perguntas → **Novo jogo** → "Seguro ou arriscado?" | Editor de cartas aparece; "Caça aos riscos" não está na lista |
| C2 | Preencher 3 cartas e clicar **Testar jogo** | Joga o rascunho sem salvar; "Voltar à edição" mantém o texto |
| C3 | **Criar jogo**, depois **Testar** na lista | Joga com o que foi salvo |
| C4 | Editor de cursos: abrir a prévia de uma atividade e de um vídeo | O jogo abre no celular da prévia; o vídeo toca no SipatPlayer |

## D. Se algo falhar

Anote: jogo ou tela, navegador e versão, o que esperava, o que aconteceu, e se o console do navegador mostra erro
(F12 → Console). Casos que mais interessam:

1. Barra do player sem aparecer (só o vídeo): os componentes do Media Chrome não carregaram.
2. Tela cheia abrindo o player do sistema no iPhone.
3. Arrastar um jogo rolando a página no celular.
4. Vídeo que não retoma depois de fechar um jogo.

## E. Qualidade e entrega do vídeo

Confere a entrega em produção (sessões de reprodução, armazenamento R2) e o resumo de qualidade de cada sessão.
Estes testes precisam de aparelhos e de uma conta Cloudflare reais; faça-os com uma pessoa, não por script.

**Como ver as linhas de qualidade** (no ambiente local, a partir de qualquer pasta):

```bash
docker exec sipat-online-dev-postgres-1 psql -U sipat_online -d sipat_online -c \
  'select "StartedAt", "Device", "ConnectionType", "StallCount", "StallMilliseconds", "NeverStarted"
     from learning."PlaybackQualitySessions" order by "StartedAt" desc limit 20;'
```

Em outro ambiente com `compose.yaml`, use `docker compose exec postgres psql -U <usuário> -d <banco> -c '…'`
com a mesma consulta (usuário e banco estão no arquivo `.env` do ambiente).

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| E1 | Assistir um vídeo inteiro em **Chrome (desktop)**, **Safari no iPhone** e **Chrome no Android** | Em cada aparelho: o avanço além do ponto liberado é bloqueado, a velocidade fica em 1x, a tela cheia funciona, o jogo abre no momento certo e o progresso fica salvo (recarregar retoma de onde parou) | |
| E2 | No Chrome: DevTools → Network → **Slow 4G**; tocar o vídeo até travar algumas vezes | Ao terminar ou fechar a sessão, a consulta acima mostra uma linha nova com `StallCount > 0` e `StallMilliseconds > 0` | |
| E3 | Repetir E2 e **fechar a aba durante um travamento** | Mesmo assim a linha existe na consulta, com `StallCount > 0` | |
| E4 | Com `VIDEO_STORAGE_PROVIDER=R2`: abrir a aula com DevTools → Network aberto | As requisições do vídeo vão para `*.r2.cloudflarestorage.com` (link assinado) e o vídeo toca até o fim | |
| E5 | **Reiniciar o contêiner da API no meio do vídeo** (`docker compose restart api`) | O vídeo continua e o progresso continua sendo salvo (a sessão de reprodução, que permite aceitar o avanço depois do reinício, fica em `learning."PlaybackGrants"`; o progresso assistido fica em `learning."LearningProgress"`) | |

Anote em cada caso o aparelho, o navegador e a versão. Se E2 ou E3 não gerarem linha, anote o horário para
procurar nos logs da API.

## G. Dashboard de qualidade

Confere o painel de qualidade do vídeo da operação (`/platform/qualidade` e `/platform/companies/{id}/qualidade`).
Precisa de uma conta da operação da plataforma e de uma conta de administrador de empresa.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| G1 | Chrome com **Slow 4G**: provocar travamentos num Dia e abrir `/platform/companies/{id}/qualidade` | A sessão aparece em "Sessões com travamento", na hora certa do gráfico e em "Por conexão" | |
| G2 | Na mesma tela, baixar o resumo e abrir o PDF | O PDF abre com uma página e o nome da empresa inteiro (sem cortar) | |
| G3 | Abrir `/platform/qualidade` | A empresa aparece com os quatro semáforos; clicar nela abre a tela da empresa | |
| G4 | Escolher um período de 366 dias e depois de 367 dias | 366 carrega; 367 mostra "Escolha um período de até um ano." sem pedir nada ao servidor | |
| G5 | Entrar como **administrador da empresa** | Não há "Qualidade do vídeo" no menu; a rota da API `/api/platform/…/playback-quality` no endereço da empresa responde **404** (não 403: a rota da operação nem existe nesse endereço) | |

## H. Conversão e qualidade 720p/480p

Confere o envio com conversão automática e a escolha de qualidade no player.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| H1 | Enviar um vídeo na Biblioteca | Aparece "Processando"; não aparece no planejador do Dia nem na lista "Vincular da biblioteca" do editor de curso; em poucos minutos fica "Pronto" | |
| H2 | Abrir o vídeo pronto num Dia | O player mostra o botão de qualidade com Automática, 720p e 480p | |
| H3 | **Android** com 3G simulado | Começa em 480p | |
| H4 | **iPhone** | Começa em 720p | |
| H5 | Escolher 480p e recarregar | Continua em 480p | |
| H6 | Em 720p com **Slow 4G**: provocar 2 travamentos em 1 minuto | Troca sozinho para 480p, sem perder a posição e sem liberar o avanço | |
| H7 | Depois do H6, abrir o menu e escolher **Automática** de novo | Continua em 480p (não volta para 720p sozinho) | |
| H8 | Abrir o menu de qualidade | A opção em uso tem o sinal de marcado (✓) e o botão mostra a qualidade atual | |
| H9 | Chrome e **iPhone Safari**: trocar a qualidade no meio do vídeo e observar a ordem dos eventos (playground `npm run player` em `src/Web`, ou o console) | Ordem esperada: `qualityChange`, nova carga do arquivo, volta à posição, `playing`. Sem dois "carregando" seguidos e sem salto para o início | |
| H10 | **iPhone em tela cheia nativa**: deixar o vídeo cair sozinho para 480p e, durante a troca, fazer um **avanço (seek)** | A troca acontece sem sair da tela cheia; o avanço respeita o ponto liberado e a posição não se perde | |
| H11 | iPhone: depois da troca de arquivo (manual ou automática) com o vídeo tocando | O `play()` volta a tocar sozinho depois que o arquivo muda; se parar, anote a versão do iOS | |
| H12 | Repetir os itens de **A. Player** (bloqueio, 1x, tela cheia no iPhone, jogos, salvar ao sair) | Tudo igual ao que era antes | |
| H13 | `npm run player` em `src/Web` | O playground abre e mostra os eventos | |

Anote em cada caso o aparelho, o navegador e a versão.

## F. Fora do escopo deste roteiro

- Vídeos longos e conexão lenta (streaming adaptativo não existe hoje).
- Legendas e leitor de tela completo (o player tem rótulos e teclado, mas não passou por teste com leitor de tela).
