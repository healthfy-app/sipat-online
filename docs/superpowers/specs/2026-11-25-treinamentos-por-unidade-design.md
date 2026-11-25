# Treinamentos por unidade

Data: 2026-11-25 · Substitui `2026-11-21-publico-e-acompanhamento-por-unidade-design.md` (que nunca foi construído)

## Por quê

O cliente pediu (2026-11-25):

1. Uma SIPAT é um treinamento aplicado a todos os funcionários de uma empresa.
2. Empresa com mais de uma unidade (matriz no Rio, filiais em SP, Minas) pode ter a SIPAT separada por unidade: vídeos, relatórios etc.
3. Cada funcionário tem uma marca dizendo de qual unidade é.
4. Cada treinamento tem link próprio, e as SIPATs são associadas internamente às unidades.

O usuário acrescentou: **a chave é o treinamento ser atribuído sozinho pela unidade da pessoa**, sem ninguém distribuir na mão. E quer a empresa orientada por unidade, com um seletor no topo, e o mesmo jeito de marcar da biblioteca de vídeos ("Associar vídeos") para colocar pessoas em unidade e setor.

## Como está hoje

- Unidade e setor existem no cadastro: `CompanyUnits`, `CompanySectors`, `Users.UnitId`, `Users.SectorId` (um de cada por pessoa). Listas em `/admin/cadastro`; a planilha do RH preenche os dois.
- Colaboradores já filtra por unidade e setor e muda em lote, por um select simples (`collaborators/PlacementDialog.tsx`).
- O treinamento (`SipatEventEntity`) não conhece unidade nem setor.
- **O link próprio já existe** (`trainings/trainingLink.ts`): `{endereço da empresa}/learning?treinamento={id}`, com "Copiar link" no cartão; quem abre um link de treinamento que não tem vê um aviso em "Meus treinamentos". **"Duplicar" também já existe** no cartão (`SipatsPage.duplicate`).
- A entrega é automática para **todo ativo da empresa**, em três pontos de `LearningDistributionService`: `CreateTrackFromCourseAsync` (ao publicar) e as duas `EnsureAssignmentsAsync` (quem chega depois). Mudar a unidade de alguém não dispara entrega.
- O painel (`TenantLearningDashboardPage`) não fala de unidade.

## Objetivos

1. Um treinamento vale para **toda a empresa** (padrão, como hoje) ou para **unidades e/ou setores marcados**.
2. A pessoa recebe sozinha o que é do seu público: ao publicar, ao ser contratada, ao entrar por planilha e **ao mudar de unidade ou setor**.
3. Quem administra escolhe uma unidade no topo e vê treinamentos, colaboradores e números só dela.
4. Colocar pessoas em unidade e setor é feito na lista de colaboradores, com o diálogo de marcar.
5. Cada treinamento tem um link que abre direto nele.

## Fora deste projeto

- **Gestor que só enxerga a sua unidade** (regra de acesso). O seletor é filtro; todo administrador continua vendo a empresa inteira. Projeto separado.
- Pessoa em mais de uma unidade ou setor. Continua um de cada.
- Público por cargo, data de admissão ou pessoa a pessoa. A entrega individual que já existe continua.
- Vídeos privados por unidade na biblioteca. "Vídeos separados por unidade" se resolve pelo treinamento de cada unidade ter os seus vídeos.

## O que não pode acontecer

- Treinamento já publicado mudar de público sozinho: os existentes ficam "toda a empresa".
- Alguém perder andamento ou certificado por ter mudado de unidade.
- Alguém ficar com um treinamento que não é mais seu e que nem abriu, sujando o relatório da unidade antiga.
- Empresa sem unidades ver qualquer coisa nova na tela.

## Abordagens consideradas

- **A. O treinamento guarda o seu público e a entrega obedece.** ← **Escolhida pelo usuário (2026-11-25).** A SIPAT por unidade são três treinamentos, cada um com uma unidade; o treinamento comum continua um só.
- B. Cada treinamento pertence a uma única unidade. Descartada: tudo que é comum teria de ser copiado e as cópias saem de sincronia.
- C. Regras de público completas (cargo, admissão...). Descartada por tamanho; A deixa espaço.

## O design

### 1. Público do treinamento

> **Revisto em 2026-11-25 a pedido do usuário: o setor é de dentro da unidade** ("o RH de Minas", "o TI de São Paulo"). O público é uma lista de **alvos**, cada um uma unidade opcionalmente estreitada a um setor: `Minas` (toda a unidade), `Minas › RH`, `São Paulo › TI`, `Todas as unidades › Produção`. Nenhum alvo = toda a empresa. A pessoa recebe se cair em qualquer alvo. A lista de setores continua uma só por empresa (é a que o RH manda na planilha); o "RH de Minas" é o cruzamento da pessoa com o alvo. Na tela, cada unidade marcada mostra embaixo os seus setores, com quantas pessoas tem em cada um. Onde o texto abaixo fala em "unidades e setores marcados" como dois conjuntos, vale esta regra.
>
> **Criar segue o filtro do topo** (mesmo dia): com unidade escolhida, colaborador novo e linha de planilha sem unidade entram nela, e treinamento novo nasce com ela no "Para quem".

- Duas tabelas de ligação, `SipatEventUnits (SipatEventId, UnitId)` e `SipatEventSectors (SipatEventId, SectorId)`, com `TenantId`. Nenhuma linha = toda a empresa. *Tabela e não JSON, porque a entrega e os filtros consultam por unidade.*
- Regra: a pessoa está no público se (nenhuma unidade marcada **ou** a dela está marcada) **e** (nenhum setor marcado **ou** o dela está marcado).
- Pessoa sem unidade não entra em público que escolhe unidades (idem setor).
- Unidade ou setor desativado continua valendo nos treinamentos em que já está; só não é oferecido para novos.

**Na tela do treinamento:** uma linha "Para quem", com o valor atual ("Toda a empresa" ou "SP · Rio · Produção") e o botão **Mudar**. Abre o diálogo de marcar, abas **Unidades** e **Setores**, várias caixas por aba, busca e "Criar unidade «X»" na hora. Embaixo, a contagem ao vivo: "214 pessoas vão receber" e, quando houver, "12 pessoas sem unidade não vão receber".

```
Para quem
[ Unidades ] [ Setores ]
Marque as unidades que fazem este treinamento. Sem nenhuma marcada, vale para toda a empresa.
[ Buscar ou criar unidade            ]
[x] São Paulo            212 pessoas
[ ] Rio de Janeiro       180 pessoas
[ ] Minas Gerais          96 pessoas
214 pessoas vão receber · 12 sem unidade não vão receber
                        [Cancelar] [Salvar]
```

- O cartão do treinamento mostra o público em uma etiqueta.
- **Duplicar para outra unidade:** o "Duplicar" que já existe no cartão cria o rascunho e abre nele o "Para quem", para escolher a unidade da cópia. É o caminho para montar a SIPAT de cada unidade a partir da primeira.

### 2. Entrega automática

- Os três pontos que hoje entregam a todos passam a entregar ao público de cada treinamento. Vale a pena juntá-los em uma função só.
- A entrega roda também quando unidade ou setor de alguém muda: edição individual, mudança em lote e planilha que atualiza quem já existe.
- **Quando a pessoa sai do público** (mudou de unidade, ou o público do treinamento foi restringido): se **não começou**, o treinamento sai dela; se **já começou ou concluiu**, fica, com andamento e certificado.
  - *Decisão minha:* "começou" se decide pelo treinamento inteiro, não dia a dia: com andamento em qualquer dia, a pessoa fica com todos os dias.
  - *Decisão minha:* só sai o que a pessoa tinha **por estar no público**. Um treinamento entregue à mão a alguém de fora do público nunca é tirado pela regra.
  - *Decisão minha:* "sair" aqui é apagar a atribuição sem uso, não marcá-la como revogada. Hoje uma atribuição revogada nunca é devolvida, e quem volta para a unidade antiga tem de receber de novo.
- Ampliar o público de um treinamento publicado entrega na hora aos novos.
- A mensagem depois de mudar pessoas diz o efeito: "3 pessoas passaram para São Paulo e receberam SIPAT 2026 · São Paulo".

### 3. Unidade e setor das pessoas (lista de colaboradores)

- Os dois botões "Mudar unidade" e "Mudar setor" viram um: **Unidade e setor**.
- Abre o mesmo diálogo de marcar, abas Unidades e Setores, com busca e criar na hora. Como a pessoa tem uma só unidade, a lista é de **escolha única**, com "Sem unidade" como primeira opção.
- Abre mostrando o estado atual: marcada se todos os escolhidos estão nela; "(em parte das pessoas)" se só alguns. Só muda a aba em que se mexeu.
- Cada opção mostra quantas pessoas já tem.
- **O cadastro de unidade e setor acontece aqui, junto da pessoa, como o assunto nos vídeos** (pedido do usuário, 2026-11-25): digitar um nome que não existe oferece "Criar unidade «X»", e cada opção tem o X de tirar, com confirmação em linha.
  - *Decisão minha:* tirar uma unidade ou setor sem pessoas e sem treinamentos apaga ("Ninguém está nela."); com uso, desativa: some das escolhas, as pessoas e o histórico ficam ("212 pessoas continuam nela; ela só deixa de ser oferecida.").
  - *Decisão minha:* a página `/admin/cadastro` continua, para renomear, reativar e escolher os campos obrigatórios, mas ninguém precisa passar por ela para criar.
- A planilha continua sendo o caminho para carga grande; o diálogo é para acertos.
- A lista com busca e "criar na hora" sai de `videoLibrary/AssociateVideosDialog.tsx` para um componente comum, usado pelos três diálogos (vídeos, público, pessoas).

### 4. Seletor de unidade no topo

- No topo da área da empresa, global, igual para o admin e para o operador dentro da empresa: um controle segmentado no estilo do iPhone (**Todas · SP · Rio · Minas**, com a pílula deslizando); com muitas unidades vira uma pílula única que abre a lista. Trocar refiltra as telas na hora (pedido do usuário, 2026-11-25). Só aparece se a empresa tem duas ou mais unidades ativas (mesma regra do seletor de treinamento).
- A escolha é lembrada no navegador, por empresa, e vale entre as telas.
- O que ele muda:
  - **Treinamentos:** mostra os da unidade e os de toda a empresa. Criar um treinamento com unidade escolhida já vem com ela marcada no público.
  - **Colaboradores:** substitui o filtro de unidade da página (o de setor fica). Números do topo e CSV seguem.
  - **Visão geral e Excel:** números só das pessoas da unidade.
- Com "Todas as unidades", a Visão geral ganha o quadro **Por unidade** (pessoas, concluíram, em andamento, não iniciaram, % concluído); clicar numa linha escolhe a unidade no seletor. O Excel ganha as colunas unidade e setor.
- O operador, ao entrar na empresa, vê o mesmo seletor.

### 5. Link próprio

- Já existe e fica como está: `/learning?treinamento={id}` no endereço da empresa, com **Copiar link** no cartão. Quem abre entra e cai direto naquele treinamento.
- Quem não está no público já vê hoje "O treinamento deste link não está disponível para você. Aqui estão os seus treinamentos." Nada a mudar.
- *Decisão minha:* o link não dá acesso; quem decide o acesso é o público. Assim um link vazado para outra unidade não bagunça o relatório.

## Ordem de entrega

Cada passo fica útil sozinho:

1. Público do treinamento e entrega automática (seções 1 e 2).
2. Diálogo "Unidade e setor" nos colaboradores (seção 3).
3. Seletor no topo (seção 4, sem o quadro "Por unidade").
4. Quadro "Por unidade" e colunas no Excel.

## Fica com quem constrói

- Onde exatamente o seletor entra no layout (`App.tsx`, barra lateral ou cabeçalho) e como fica no celular.
- Como `/learning` destaca o treinamento vindo do link.
- A forma da API (um `PUT` do público no treinamento; um endpoint de contagem para o "vão receber").
- Os testes: no mínimo a regra de entrega (toda a empresa; só unidade; unidade + setor; sem unidade; contratado depois; mudou de unidade sem começar; mudou tendo começado; voltou para a unidade antiga).
