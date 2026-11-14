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

## E. Fora do escopo deste roteiro

- Vídeos longos e conexão lenta (streaming adaptativo não existe hoje).
- Legendas e leitor de tela completo (o player tem rótulos e teclado, mas não passou por teste com leitor de tela).
