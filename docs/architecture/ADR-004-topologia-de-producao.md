# ADR-004: Topologia de produção — VM + R2 no go-live, Cloudflare Containers depois

**Status:** Proposto
**Data:** 2026-11-15
**Decisores:** dono do produto (HealthEz)
**Relacionados:** ADR-002 (entrega de vídeo pelo R2), ADR-003 (SIPAT Video Player), `deploy/CLOUDFLARE-VM.md`, `REVISAO-ARQUITETURA-2026-11-15.md`

## Contexto

- A primeira SIPAT real (cliente de 600+ pessoas) começa por volta de **1º/12/2026**. Faltam duas semanas.
- A decisão de 15/11 é que a produção seja **"full Cloudflare"**. A API é .NET e o banco é PostgreSQL. Workers não roda .NET e a Cloudflare não oferece Postgres gerenciado (o D1 é SQLite). Então "full Cloudflare" significa **Cloudflare Containers para a API + Postgres fora da Cloudflare + R2**.
- O caminho que está **escrito, testado e com runbook** é outro: **uma VM com Docker** (nginx + API + Postgres) e vídeos no R2 (`deploy/compose.production.yaml`, `deploy/CLOUDFLARE-VM.md`). Não há nada de Containers no repositório (nenhum `wrangler.toml`, nenhum Worker na frente).
- A SIPAT tem que ser barata. Cada empresa usa a plataforma cerca de uma semana por ano, então custo fixo alto é desperdício e pagar por uso é bom.
- O código tem premissas de **uma instância só**, e elas quebram no Containers:

| Premissa | Onde | No Containers |
|---|---|---|
| Chaves de Data Protection em disco | volume `aspnet-data-protection` | disco efêmero. Cada reinício ou nova instância desloga todo mundo e invalida os tokens CSRF |
| Fila de conversão com um único worker | `VideoConversionProcessor` (BackgroundService). O DECISOES-VIDEO registra: "a second API instance would steal Running jobs" | duas instâncias brigam pelos mesmos jobs |
| Original do vídeo em `video-work` até converter | volume `video-work` | perde o original se a instância dormir no meio |
| Envio de vídeo de até 250 MB passando pela API | nginx `client_max_body_size 260m` | o Worker na frente do container limita o corpo da requisição (~100 MB nos planos Free/Pro; confira na documentação) |
| Rate limit de login em memória | `AddRateLimiter` em `Program.cs` | cada instância conta sozinha |
| Plano B `File` (volume da VM) | `VIDEO_STORAGE_PROVIDER=File` | deixa de existir. Só o R2 funciona |

## Decisão (proposta)

1. **Go-live (1º/12) na VM + R2, como está documentado.** É o único caminho ensaiado. Trocar a topologia a duas semanas da SIPAT põe em risco a venda.
2. **Preparar o código para várias instâncias sem mudar a hospedagem** (os itens de "Ações" abaixo). Essas mudanças também melhoram a VM.
3. **Migrar para Cloudflare Containers depois da primeira SIPAT** (dezembro/janeiro), quando a medição de qualidade e o tráfego real estiverem em mãos, com o mesmo banco num Postgres gerenciado externo.

## Opções consideradas

### A. VM única + R2 (o que está pronto)

| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa. Runbook pronto, backup no R2 e restauração ensaiável |
| Custo | VM pequena com custo fixo mensal (2 vCPU / 4 GB fica na faixa de R$ 30–120/mês, conforme o provedor) + R2 (centavos por SIPAT). Paga o ano todo para usar uma semana |
| Escala | Uma máquina. Com o vídeo no R2 ela só carrega a API e o banco, e isso aguenta 600 pessoas (ver a revisão) |
| Familiaridade | Alta |

**Prós:** pronta, simples, plano B `File` disponível, Postgres na mesma rede (latência ~0).
**Contras:** ponto único de falha, banco não gerenciado (o backup é responsabilidade sua), custo fixo, atualização manual por SSH.

### B. Cloudflare Containers + Postgres externo + R2 ("full Cloudflare")

| Dimensão | Avaliação |
|---|---|
| Complexidade | Média/alta **agora**: Worker na frente, Data Protection no banco, envio direto ao R2, fila com várias instâncias, CI de deploy |
| Custo | Workers Paid (US$ 5/mês) + uso do container (a instância dorme sem tráfego) + Postgres gerenciado (camada grátis ou ~US$ 0–25/mês). Na faixa de US$ 15–40/mês, perto do custo da VM, mas sem servidor para manter |
| Escala | Várias instâncias, perto do usuário. O gargalo vira a **latência até o Postgres** |
| Familiaridade | Baixa. Nada disso foi ensaiado |

**Prós:** sem servidor para manter, dorme fora da semana da SIPAT, TLS/DNS/WAF da Cloudflare de graça, deploy por CI.
**Contras:**
- **Latência container → banco.** Cada salvamento faz de 4 a 6 consultas. Com o container longe do banco (30–150 ms por ida e volta), um salvamento passa de ~10 ms para 0,5 s. É preciso fixar a região do container perto do banco e medir.
- Disco efêmero (todos os itens da tabela acima).
- Limite de corpo de requisição para o envio de vídeo.
- Cold start na primeira requisição depois que a instância dorme. Para uma semana por ano isso é aceitável e é justamente o que barateia.
- Perde o plano B `File`.

### C. Ficar na VM para sempre

Descartada como destino final: contraria a decisão "full Cloudflare" e mantém o custo fixo anual. Continua sendo o plano de contingência da opção B.

## Análise de trade-offs

O que pesa é **risco agora contra custo e operação depois**. A opção B não traz nenhum ganho para a primeira SIPAT: com o vídeo já no R2, a VM aguenta a carga. Já o risco da B é alto, porque são seis mudanças estruturais sem ensaio a duas semanas do evento. Depois da primeira SIPAT a conta inverte: a B elimina a manutenção da VM e o custo do resto do ano. As mudanças que ela exige (Data Protection no banco, envio direto ao R2, fila segura para várias instâncias) valem a pena de qualquer forma.

## Consequências

- **Fica mais fácil:** o go-live usa o que foi ensaiado. A migração depois é para um código que já não depende de disco local.
- **Fica mais difícil:** por algumas semanas existem dois alvos de deploy (VM em produção, Containers em teste).
- **Revisitar:** latência medida entre o container e o Postgres; o limite de corpo de requisição do plano contratado; se a região do Postgres gerenciado é São Paulo; os termos do R2 para vídeo (já pendente no ADR-002).

## Ações

Antes do go-live (na VM):
1. [x] Corrigir o rate limit de login por IP (ver S1 na revisão). Feito em 15/11: limite por matrícula.
2. [ ] Ensaiar a restauração do backup (já está no runbook, prazo 25/11).
3. [ ] Teste de carga curto: 200 sessões salvando a cada 10 s contra a VM real, medindo p95.

Para o Containers (dezembro):
4. [ ] Data Protection no banco (`PersistKeysToDbContext`).
5. [ ] Envio do vídeo direto do navegador ao R2 (PUT pré-assinado), com a conversão lendo do R2.
6. [ ] Fila de conversão segura para várias instâncias (`SELECT … FOR UPDATE SKIP LOCKED` com lease), ou um container separado só para a conversão.
7. [ ] Rate limit fora da memória (regra de Rate Limiting/WAF da Cloudflare no login) ou por login no banco.
8. [ ] Escolher o Postgres gerenciado (região São Paulo, se houver) e medir a latência a partir do container.
9. [ ] Worker + `wrangler.toml` + CI de deploy; ensaio completo em `dev` com o bucket `sipat-videos-dev`.
