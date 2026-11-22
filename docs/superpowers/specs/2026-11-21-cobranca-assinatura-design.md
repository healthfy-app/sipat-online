# Cobrança: assinatura mensal ou anual

Data: 2026-11-21 · Projeto 5 de 5 · Depende de: nada técnico; vem por último porque o resto já entrega valor sem ele

## Por quê

Com uso permanente, a empresa paga **por ano** (12 meses) ou **por mês** (mensalidade nos meses em que usar). Hoje só existe o **plano** (Bronze, Prata, Ouro, Diamante), que decide o que a empresa pode personalizar; não há período contratado nem bloqueio quando acaba.

## Objetivos

1. O operador registra, por empresa, o **contrato**: modalidade (anual / mensal), início, fim (ou mês a mês), e o plano.
2. O sistema **avisa** quando o contrato está perto de vencer e **mostra** as empresas vencidas.
3. Empresa vencida fica em modo **somente leitura** para o administrador; participantes continuam vendo e emitindo certificados do que já concluíram. *Decisão minha: não cortar o operário no meio do treinamento por atraso de pagamento.*

## Fora deste projeto
- **Cobrar de verdade** (boleto, cartão, nota fiscal, gateway). *Decisão minha: fica no financeiro/comercial de vocês; o sistema só registra o contrato e reage ao vencimento.* Se depois quiserem gateway, entra como projeto próprio.
- Preço por número de participantes. Se o preço depender disso, o painel já mostra a contagem de ativos por empresa.

## O que não pode acontecer
- Bloquear uma empresa sem aviso.
- Bloquear participantes de concluir o que já começaram.

## Abordagens consideradas
- **A. Contrato registrado pelo operador + avisos + somente leitura no vencimento.** ← **Escolhida.** Barato, sem gateway, combina com a regra de infraestrutura barata.
- B. Integração com gateway de pagamento (Stripe, Asaas, Pagar.me). Descartada agora: custo, tempo e decisão comercial que ainda não existe.

## O design

### 1. Dados
- `CompanyContracts(Id, TenantId, Modality [Annual|Monthly], StartsOn, EndsOn?, Plan, Notes, CreatedAt)`. O contrato vigente é o de data mais recente que cobre hoje. O plano da empresa passa a vir do contrato vigente (mantendo o campo atual como valor quando não há contrato, para não quebrar quem já existe).
- Mensal: o operador marca os meses pagos/liberados (`EndsOn` avança mês a mês). Anual: `EndsOn = StartsOn + 12 meses`.

### 2. Telas
- **Operador › Empresa › Contrato**: histórico de contratos, novo contrato, renovar (+12 meses / +1 mês).
- **Operador › Empresas**: coluna "Contrato até" e marcação **"Vence em N dias"** (30 dias antes) e **"Vencido"**; filtro por situação.
- **Administrador da empresa**: faixa no topo 30 dias antes ("Seu contrato vence em 12/03. Fale com a equipe SIPAT Online.") e, vencido, "Contrato vencido: somente leitura".

### 3. Somente leitura (vencido)
- Administrador não cria, não publica e não carrega participantes; vê painéis e baixa relatórios.
- Treinamentos publicados continuam para os participantes até o próprio fim; contínuos (projeto 4) param de entregar a pessoas novas.
- O operador sempre pode editar.

## Testes
- Contrato vigente decide o plano; aviso de 30 dias; vencido bloqueia escrita do administrador, não bloqueia o participante; renovação devolve tudo.

## Perguntas suas
1. Vencido = **somente leitura** (proposta) ou **bloqueio total**?
2. Mensal paga **todo mês** enquanto ativo, ou **só nos meses em que usar** (como o sócio disse)? A proposta cobre os dois: o operador libera os meses.
