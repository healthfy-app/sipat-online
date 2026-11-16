# Vídeo externo (YouTube, Vimeo) como vídeo bônus — design

Data: 2026-11-15 · Status: implementado em feat/video-externo (2026-11-16)

## Intenção

O Rafael quer "mais um tipo de conteúdo que fica disponível pra empresa escolher": vídeos de YouTube, Vimeo etc.
Isso abre espaço pra conteúdo livre. Os vídeos da casa são curtos (uns 5 min), e os documentários ele já usa pelo
link do YouTube oficial.

O vídeo externo é um **bônus**. As regras de negócio (assistir em ordem, velocidade fixa, progresso conferido no
servidor, conclusão, certificado, relatório de qualidade) valem só pro nosso vídeo. No vídeo externo não tem como
medir o progresso, então ele não conta.

## Metas

- Ao adicionar um vídeo no editor do Assunto, a pessoa escolhe o provedor: **Nosso vídeo** (o fluxo de hoje),
  **YouTube** ou **Vimeo**. No YouTube e no Vimeo ela cola o link e dá um título.
- O vídeo externo fica na Biblioteca como um item do acervo (abordagem A). Ele entra no Assunto e no Dia pela
  mesma lista de vídeos de hoje, **na posição que quem monta escolher**, inclusive no meio.
- Pro participante, a moldura do player é a mesma. Só o player de dentro muda: o nosso `<video>` vira o iframe do
  provedor.
- O vídeo externo aparece como apêndice de forma discreta: uma marca pequena (ex.: "Extra · YouTube") e nada de
  check de concluído. Sem selo chamativo e sem cara de conteúdo de segunda linha.

## Fora do escopo

- Medir progresso, tempo assistido ou qualidade do vídeo externo.
- Provedores além de YouTube e Vimeo (o desenho deixa espaço pra eles, mas não entram agora).
- Baixar ou copiar o vídeo externo pro R2.
- Playlists e transmissões ao vivo.

## O que não pode acontecer (anti-metas)

- O vídeo externo **travar a sequência**: com "assistir em ordem", ele nunca bloqueia o próximo vídeo e nunca
  impede o Dia ou o Assunto de ficar 100 %.
- O vídeo externo entrar na conclusão, no certificado, no "X de Y vídeos" ou na duração total.
- Uma tela quebrada quando a rede da empresa bloqueia o YouTube.
- O operário achar que o extra é obrigatório.

## Restrições

- Hoje o plano da etapa 2 dizia "nada vai para terceiros (sem YouTube)". Isso **muda**: o iframe do provedor manda
  dados pro Google/Vimeo. Pra reduzir: YouTube em `youtube-nocookie.com`, Vimeo com `dnt=1`. O ADR-001 ganha uma
  nota registrando a mudança.
- A CSP (`deploy/nginx/security-headers.conf`, por enquanto Report-Only) ganha `frame-src` com
  `https://www.youtube-nocookie.com` e `https://player.vimeo.com`. Não carregamos o script da API do YouTube (é só
  o iframe), então `script-src` fica como está.
- Go-live em 1/12. A mudança não pode mexer no comportamento dos vídeos da casa.

## Abordagens consideradas

- **A) O vídeo externo é um item da Biblioteca, sem arquivo (escolhida).** Ele tem provedor e link e entra nas
  mesmas listas de vídeo (`videoIds`) do Assunto e do Dia. Dá pra reaproveitar o mesmo documentário em vários
  Assuntos, e o montador da SIPAT funciona sem mudança. Custo: a Biblioteca passa a mostrar itens que não foram
  enviados por upload.
- **B) Link solto dentro do Assunto.** Mais rápido de cadastrar uma vez, mas a lista da aula vira uma lista com dois
  tipos de coisa, a mudança se espalha pelo montador, pela contagem e pelos relatórios, e o link não é reaproveitado.
- **Descartada: tratar como "atividade"** (igual ao formulário externo). Ficaria fora da moldura do player, e o
  pedido é o mesmo visual.

## Como fica

### Dados (servidor)

- `PlatformCourseVideoEntity` ganha `Provider` (`Sipat` | `YouTube` | `Vimeo`, padrão `Sipat`) e `ExternalId`
  (o id do vídeo no provedor, extraído do link). Um item externo nasce com `Status = Ready`, sem arquivo,
  `SizeBytes = 0`, `HasSd480 = false` e sem checkpoints de jogo.
- A duração do externo é opcional e informada à mão (o servidor não consulta o provedor). Ela é só pra exibir e
  **não entra** na duração total do Dia.
- Um endpoint novo cria o item externo a partir de `{ provider, url, title }`. O servidor valida e normaliza o link
  e guarda só o id. Links aceitos: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`,
  `vimeo.com/<id>` e `player.vimeo.com/video/<id>`. Qualquer outra coisa é recusada com uma mensagem clara.
- Rotas de arquivo, conversão e cópia pro R2 ignoram ou recusam itens externos (`/file` responde 404). O conversor
  e o copiador pulam esses itens.
- Quando o Assunto é distribuído pra empresa, a aula do participante (`LearningLesson`) recebe uma
  `ProviderAssetReference` do tipo `youtube:<id>` ou `vimeo:<id>` (hoje é `catalog:<id>`/`development:`), e a aula
  fica marcada como **bônus** (campo `IsBonus` ou derivado do prefixo).
- **Progresso e conclusão:** a sessão de reprodução, as faixas assistidas e o relatório de qualidade recusam aulas
  bônus. A conclusão do Assunto e do Dia, o "X de Y" e o certificado contam **só as aulas que não são bônus**.

### Editor do Assunto

- O "Adicionar vídeo" (`courseEditor/AddVideoDialog.tsx`) abre com a escolha do provedor no topo: Nosso vídeo ·
  YouTube · Vimeo.
  - Nosso vídeo: o fluxo de hoje (escolher da Biblioteca ou enviar).
  - YouTube/Vimeo: campo de link + título + duração opcional, com uma prévia do vídeo dentro da janela antes de
    adicionar. O item vai pra Biblioteca e já entra na aula.
- Na estrutura do Assunto e no montador da SIPAT, o item externo mostra o ícone do provedor e a marca "Extra". A
  contagem e a duração do Dia ignoram os extras. O limite de 5 vídeos por Dia vale **só pros nossos**.

### Player (pacote `SipatVideoPlayer`)

- O pacote ganha um componente de moldura comum e um player "externo" (`ExternalVideoPlayer`): mesmo cartão,
  mesmo título e mesmas proporções, mas dentro dele fica o iframe do provedor, com os controles do próprio
  provedor. Sem regras, sem barra nossa, sem eventos de salvamento.
- O núcleo (`core/*`) não muda. O app decide qual player montar pela `ProviderAssetReference` da aula.
- Se o iframe não carregar em alguns segundos (rede bloqueada), aparece a mensagem "Este vídeo não abriu na sua
  rede" com o link pra abrir fora, no lugar de uma área vazia.

### Tela do participante (`learning/LearningTrackPage.tsx`)

- O extra aparece na lista do Assunto/Dia na posição que foi montada, com uma marca discreta ("Extra · YouTube"),
  sem círculo de progresso e sem check.
- Com "assistir em ordem", o extra nunca fica bloqueado e nunca bloqueia: o vídeo seguinte libera conforme o
  último vídeo nosso concluído antes dele.
- "Próximo vídeo" passa pelo extra normalmente, sem esperar nada dele.
- A barra de progresso do Assunto e o "3 de 5" ignoram os extras.

### Regras do Dia e dos jogos (decisões minhas, a confirmar na leitura)

- `ProgramDayRules`: o Dia continua exigindo de 1 a 5 vídeos **nossos**. Os extras vão por fora desse limite, com
  no máximo 3 por Dia. Um Dia com apenas extras é recusado.
- Montador da SIPAT: o extra aparece na lista de vídeos do Dia na posição montada, com a marca "Extra". No CSV ele
  ocupa uma coluna "Vídeo N" como qualquer vídeo (o CSV casa pelo título, o formato não muda).
- Revisto ao planejar: `AfterVideoCount` e os ids de atividade continuam sendo **posições na lista inteira**
  (extras incluídos), porque o servidor e a tela casam vídeo e aula pela posição em vários pontos. O que muda é a
  liberação: um jogo "depois do vídeo N" libera quando todos os vídeos **nossos** entre os N primeiros estão
  concluídos. O extra nunca segura um jogo.
- `LearningLesson.Create` aceita duração 0 para aula bônus.

### SIPAT já distribuída (decidido pelo usuário: o caminho seguro)

- O extra entra também nas SIPATs que já estão com a empresa. A atualização **mantém as aulas que já existem**
  (mesmos ids, progresso, conclusão e certificado) e só encaixa o extra na posição montada. Hoje o caminho de
  atualização (`LearningDistributionService`, `RefreshDayTrackAsync`) apaga e recria as aulas quando a lista de
  vídeos muda; esse caminho precisa passar a casar as aulas pela referência do vídeo, em vez de recriar tudo.
- Teste obrigatório: participante com progresso e certificado, extra adicionado no meio do Assunto, nada do que ele
  já tinha muda.

### Dono do item (preparação para a Biblioteca por empresa)

- O item externo nasce com `OwnerTenantId` vazio (acervo global, do operador). Quando existir a Biblioteca por
  empresa, o mesmo campo guarda a empresa dona. Nesta etapa o campo existe e não é usado além de ficar vazio.

## Testes que precisam existir

- Servidor: normalização e recusa de links; criação do item externo; `/file` de externo dá 404; sessão de
  reprodução de aula bônus recusada; conclusão e certificado com um bônus no meio ficam 100 % sem assistir o bônus.
- Web: escolha de provedor no diálogo; prévia; marca "Extra" na lista; o extra não bloqueia o próximo com
  "assistir em ordem"; a contagem e a duração ignoram extras; mensagem de rede bloqueada.
- Os testes de player e de página que já existem continuam verdes sem edição.

## Deixado para quem for construir

- Nome exato dos campos e da migração; se `IsBonus` é coluna ou derivado do prefixo da referência.
- O texto final das marcas e mensagens (seguir a identidade do `/learning`).
- O tempo de espera antes de mostrar "não abriu na sua rede" (sugestão: 8 s).
