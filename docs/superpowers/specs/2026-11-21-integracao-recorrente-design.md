# Integração: treinamento sem data de fim, para quem é contratado

Data: 2026-11-21 · Projeto 4 de 5 · Depende de: projeto 1; usa o projeto 3 se o público for por unidade/setor

## Por quê

Com uso permanente, a empresa tem treinamentos que **não acontecem numa semana**: "todo funcionário novo faz o treinamento de segurança". Ele fica sempre aberto, e cada pessoa tem um **prazo contado a partir da entrada dela**.

## Objetivos

1. Um treinamento pode ser **contínuo**: tem data de início, **não tem data de fim**.
2. Quem entra no público (contratação, carga, mudança de setor) recebe na hora, como hoje.
3. Opcional: **prazo por pessoa** ("concluir em 30 dias a partir da entrada"), com atraso visível no acompanhamento.
4. Os módulos do treinamento contínuo não têm data; aparecem como "Módulo 1, 2…" (regra do projeto 1).

## Fora deste projeto
- Reciclagem periódica ("refazer todo ano"). *Decisão minha: fica para depois; hoje, para repetir, duplica-se o treinamento no ano seguinte, como a SIPAT.*
- Liberar um módulo por dia (gotejamento). Todos os módulos ficam disponíveis de uma vez.
- Lembrete por e-mail/WhatsApp de prazo.

## O que não pode acontecer
- Treinamento contínuo aparecer como "Concluído" (fase) só porque o tempo passou.
- Mudar a SIPAT: ela continua com início e fim pelas datas dos dias.

## Abordagens consideradas
- **A. `EndsAt` opcional no treinamento.** ← **Escolhida.** Fim vazio = contínuo. Muda pouco: as consultas que hoje usam `EndsAt > agora` passam a aceitar fim vazio.
- B. Um tipo novo de entidade "treinamento contínuo". Descartada: duplicaria construtor, entrega e relatórios.

## O design

### 1. Dados
- Migração: `SipatEvents.EndsAt` vira **anulável**. `DeadlineDays int?` (prazo por pessoa) no treinamento.
- Domínio e validador: `EndsAt` opcional; quando informado, continua maior que `StartsAt`.
- `SipatPlanService.SaveAsync`: as datas dos dias ainda definem início e fim quando existirem; se nenhum dia tem data, o treinamento **não** ganha fim automaticamente (o início é a data de publicação, se não houver).
- Todas as consultas com `EndsAt > now` (`EnsureAssignmentsAsync`, publicação, fase) tratam `EndsAt == null` como "ainda no ar".

### 2. Construtor
- Ao criar um treinamento: **"Tem período?"** → **Com datas** (como a SIPAT hoje) / **Contínuo** (sem fim, módulos sem data). Contínuo esconde as datas dos módulos e mostra "Prazo para cada pessoa: [nenhum | N dias]".
- Encerrar um contínuo: botão **"Encerrar"**, que grava o fim como hoje (para de entregar a novos; quem já tem continua vendo).

### 3. Fases
- Contínuo publicado: **"Contínuo"** (no lugar de "Em andamento"); nunca vira "Concluído" pelo tempo. Encerrado manualmente: "Encerrado".

### 4. Participante
- Na tela inicial, o contínuo aparece nos chips como qualquer treinamento. Com prazo: "Conclua até 15/12". A regra de qual abre primeiro (projeto 1) considera contínuo com prazo vencendo como prioridade. *Decisão minha.*

### 5. Acompanhamento
- Para contínuo com prazo: status extra **"Atrasado"** (prazo passou e não concluiu), contado no painel, filtrável em Participantes e no Excel, também por unidade e setor.

## Testes
- Criar e publicar contínuo; contratado depois recebe; encerrado não entrega mais; fase "Contínuo"; prazo calculado da data de entrada da pessoa no treinamento (data da atribuição); "Atrasado".
- SIPAT com datas não muda de comportamento.
