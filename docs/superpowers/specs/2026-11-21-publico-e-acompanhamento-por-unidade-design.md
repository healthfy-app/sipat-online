# Público e acompanhamento por unidade e setor

Data: 2026-11-21 · Projeto 3 de 5 · Depende de: projeto 1 (seletor de treinamento) e projeto 2 (unidade e setor no cadastro)

## Por quê

Com a plataforma de uso permanente, a empresa quer ver o andamento **por unidade e por setor** ("quanto da unidade de Minas já concluiu a SIPAT") e mandar um treinamento **só para quem precisa** (brigada de incêndio, setor de produção, unidade do ES).

## Objetivos

1. Painel, Participantes e Excel filtram e agrupam por **unidade** e **setor**, além do treinamento (projeto 1).
2. Um treinamento pode ser publicado para **todos** (padrão, como hoje) ou para um **público**: unidades e/ou setores escolhidos.
3. Quem entra depois no público (contratado, ou que mudou de setor) recebe o treinamento automaticamente, como já acontece hoje com quem é contratado.

## Fora deste projeto
- Escolher pessoas uma a uma. *Decisão minha: público é por unidade e setor; a escolha individual continua sendo a que já existe hoje (entregar a um colaborador).*
- Grupos personalizados ("Brigada"). **Decidido pelo usuário em 2026-11-21: o setor é a forma de atribuir.** Quem precisar de um grupo transversal usa a entrega manual.

## O que não pode acontecer
- Treinamento já publicado para todos mudar de público sem querer.
- Pessoa perder um treinamento que já começou porque mudou de setor. *Decisão minha: quem mudou de setor **mantém** o que já recebeu; só passa a receber os novos do setor novo.*

## Abordagens consideradas
- **A. Público guardado no treinamento (listas de unidades e setores) e aplicado na entrega.** ← **Escolhida.** `EnsureAssignmentsAsync` já é o ponto único que decide quem recebe; o filtro entra ali.
- B. Gerar a lista de pessoas na hora de publicar e congelar. Descartada: quem é contratado depois ficaria de fora, que é justamente o caso da integração (projeto 4).

## O design

### 1. Público do treinamento
- `SipatEvent` (o treinamento) ganha público: `AudienceUnitIds[]` e `AudienceSectorIds[]` (tabela de ligação ou JSON). Ambos vazios = **todos**.
- Regra: a pessoa recebe se (nenhuma unidade escolhida **ou** a unidade dela está na lista) **e** (nenhum setor escolhido **ou** o setor dela está na lista). Ex.: unidade = Minas, setor = Produção → só a Produção de Minas.
- Pessoa sem unidade/setor cadastrado não entra num público que filtra por aquilo. O construtor avisa: "12 pessoas sem setor não vão receber".
- No construtor, antes de publicar: "Para quem?" → **Todos** / **Escolher unidades e setores**, com a contagem ao vivo de quantas pessoas vão receber.
- Mudar o público de um treinamento publicado: amplia na hora (novos recebem); **restringir não tira** de quem já recebeu. *Decisão minha.*

### 2. Entrega
- `LearningDistributionService.EnsureAssignmentsAsync` filtra os participantes pelo público de cada treinamento.
- Ela roda também quando a unidade ou o setor de alguém muda, não só na contratação: no cadastro individual, na mudança em lote (projeto 2) e na carga. Exemplo: um treinamento atribuído ao setor "Produção" aparece na hora para quem o RH acabou de colocar na Produção.

### 3. Acompanhamento
- Painel da empresa: seletor de treinamento (projeto 1) + filtros de unidade e setor; um quadro **"Por unidade"** e outro **"Por setor"** com: pessoas no público, concluíram, em andamento, não iniciaram, % concluído. Clicar numa linha filtra o resto da tela.
- Participantes: filtros de unidade e setor (já criados no projeto 2) combinados com o treinamento.
- Excel: colunas unidade, setor, matrícula, e uma aba de resumo por unidade e por setor.
- Operador (painel da plataforma) continua vendo por empresa; o detalhe por unidade aparece ao entrar na empresa.

## Testes
- Entrega: todos; só unidade; só setor; unidade + setor; pessoa sem setor; contratado depois; mudança de setor amplia e não tira.
- Números do painel por unidade e setor batem com a lista de participantes filtrada.
