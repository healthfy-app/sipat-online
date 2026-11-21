# Revisão de arquitetura e segurança — 15/11/2026

Branch: `feat/video-etapa-2`. Escopo: fronteiras e modelo, segurança, capacidade para 600+ pessoas numa semana e dívida técnica. A decisão de topologia está no **ADR-004**.

## Status das correções (15/11, à noite)

**Feito, antes do go-live:**
- **S1:** o limite por IP subiu para 300/min (só contra inundação). O freio de força bruta passou a ser por **host + matrícula**, 10/min (`LoginAttemptLimiter`), na entrada do participante e do operador. Os dois valores são configuráveis em `SipatOnline:LoginRateLimit`.
- **S2:** o reset de senha pelo admin zera o bloqueio e o contador de erros. O bloqueio caiu de 15 para 5 min.
- **S3/S4:** HSTS, CSP em *report-only* e headers repetidos nas `location` por um `include` comum (`deploy/nginx/security-headers.conf`). O `nginx -t` passa.
- **S5:** o CSRF é validado num único middleware (`ApiAntiforgeryMiddleware`, fail-closed para toda escrita em `/api`). As 55 validações copiadas nos endpoints foram removidas.
- **Salvamento mais leve:** o front reaproveita o token CSRF e só pede outro quando o servidor recusa, reenviando uma vez. O tenant por host fica em cache por 30 s (`TenantHostCache`) e é esquecido ao salvar ou criar uma empresa.

**Adiado para dezembro (pré-requisito do Containers, não faz falta na VM):** Data Protection no banco, envio direto ao R2, fila de conversão para várias instâncias e rate limit fora da memória.

**Cortado por agora (saúde do código, sem ganho para o go-live):** quebrar os arquivos grandes, mover serviços para a Application, tirar o `PlatformDbContext` dos endpoints, tirar o `dist/` do Git e as pendências P4 de grants.

## Resumo

- **A arquitetura está boa para o go-live.** O monólito modular tem isolamento de empresa bem feito (host + claim + middleware), o vídeo sai pelo R2 com link assinado e o servidor valida o que foi assistido. Com o vídeo fora da VM, ela aguenta a carga de 600 pessoas.
- **Um bloqueio real:** o rate limit do login é **10 tentativas por minuto por IP**. Numa fábrica, centenas de celulares saem pelo mesmo IP (NAT do Wi-Fi ou da operadora). No início do turno, a partir da 11ª pessoa, todo mundo recebe 429 (S1).
- **"Full Cloudflare" ainda não está pronto no código.** Há seis premissas de instância única (ADR-004). Recomendo o go-live na VM e a migração em dezembro.

## 1. Fronteiras, modelo de dados e API

**O que está certo**
- Módulos `Identity`, `Tenancy`, `Sipats` e `Learning` com Domain/Application separados e testes de dependência entre módulos (`ModuleDependencyTests`).
- Multiempresa por subdomínio. `TenantResolutionMiddleware` resolve a empresa e `TenantAuthorizationMiddleware` recusa um cookie de outra empresa. O operador global só troca de empresa com o cabeçalho `X-Sipat-Company`, e só no host da plataforma (`PlatformCompanyContextMiddleware`). Bem amarrado.
- O armazenamento de vídeo fica atrás de `IPlatformCourseVideoStorage` (File/R2) e a aula guarda uma referência opaca. Trocar de provedor não toca o domínio.
- O player é um pacote com core em TypeScript puro e **não chama a API** (ADR-003). Fronteira limpa.

**O que vaza**
- **Endpoints falando direto com o banco.** Cinco arquivos usam `PlatformDbContext` (`CourseCategoryEndpoints`, `LearningEngagementEndpoints`, `PlatformCourseCatalogEndpoints`, `TenantAppearanceEndpoints`, `TenantEndpoints`), mas o `EndpointDatabaseTests` só vigia dois outros arquivos. A regra existe, mas não pega quem já viola.
- **Serviços de aplicação morando na Infrastructure:** `EmployeeCredentialService`, `TenantPlanService` e `LearningDistributionService` carregam regra de negócio junto com o EF.
- **Faixas assistidas como JSON em coluna texto** (`WatchedRangesJson`). Funciona e foi decisão consciente (DECISOES-VIDEO, Task 3). Só vira problema se um dia o relatório precisar consultar dentro das faixas.
- **API:** consistente (REST por recurso, ProblemDetails com `code`). A validação de CSRF, porém, é feita à mão em cada endpoint (S5).

## 2. Segurança

| # | Severidade | Achado | Correção |
|---|---|---|---|
| **S1** | **Alta (bloqueia go-live)** | `identity-auth` limita **10 logins/min por IP** (`Program.cs`). Uma fábrica inteira atrás de um NAT fica bloqueada no início do turno. | Particionar por **IP + matrícula** (ex.: 10/min) e manter um teto alto por IP (ex.: 300/min). Teste: 50 logins distintos do mesmo IP em 1 min passam. |
| S2 | Média | Bloqueio da conta após **5 senhas erradas por 15 min**, e a matrícula costuma ser previsível. Qualquer pessoa consegue travar um colega, e quem erra a senha fica 15 min fora. **Não há como o admin desbloquear:** o reset de senha não zera o bloqueio. | No reset de senha, chamar `SetLockoutEndDateAsync(null)` e `ResetAccessFailedCountAsync`. Avaliar baixar o bloqueio para 5 min, já que o S1 corrigido segura a força bruta. |
| S3 | Média | Sem **HSTS** e sem **CSP** (nem no nginx nem na API). | nginx: `Strict-Transport-Security "max-age=31536000; includeSubDomains"` e uma CSP começando em `Report-Only` (o Media Chrome e os jogos precisam ser testados). |
| S4 | Baixa | No nginx, um `add_header` dentro de `location` **apaga** os headers herdados do `server`. Em `/assets/` (e `/health`) somem o `nosniff`, o `X-Frame-Options` e o `Referrer-Policy`. | Repetir os headers nesses blocos ou movê-los para um `include` comum. |
| S5 | Baixa | O CSRF é validado à mão em cada endpoint de escrita. Um endpoint novo que esqueça a validação fica aberto. O risco é reduzido pelo cookie `SameSite=Strict` e `__Host-`, mas os subdomínios das empresas são *same-site* entre si. | Um `EndpointFilter` de antiforgery aplicado nos `MapGroup` de escrita e um teste de arquitetura que confira todo `MapPost/Put/Delete`. |
| S6 | Baixa | A senha mínima é de 6 caracteres sem outras regras. É decisão de produto (operário) e aceitável **com o S1 e o S2 corrigidos**. | Nenhuma agora. Considerar exigir troca no primeiro acesso. |

**Conferido e ok:** cookies `__Host-` com `Secure`, `HttpOnly` e `SameSite=Strict`; proxies confiáveis obrigatórios fora de Development; OpenAPI só em Development; o ffmpeg recebe argumentos por `ArgumentList` (sem shell); links do R2 assinados e emitidos só depois da checagem de atribuição; servidor validando cobertura e faixas; `Provider=Development` recusado em produção (`ValidatePlaybackProviderSetting` + `PlaybackProviderStartupCheck`); cache do token CSRF do envio de qualidade invalidado em erro; a senha inicial da importação é gerada e nunca fica salva.

## 3. Capacidade: 600 pessoas numa semana

Premissas do ADR-001: 600 pessoas, 6 dias, 5 vídeos de ~4 min por dia, pico de 30% a 100% assistindo ao mesmo tempo no início do turno.

| Componente | Carga no pico | Avaliação |
|---|---|---|
| **Vídeo (R2)** | 180–600 reproduções simultâneas a ~1–2 Mbps | **Ok.** Os bytes não passam pela VM. O R2 não cobra a saída, e as leituras (~0,5 milhão de operações por SIPAT) cabem na camada grátis. **Risco:** o bucket fica fora do Brasil (o R2 não tem região na América do Sul), e o link assinado do endpoint S3 não passa pelo cache da CDN. Meça o tempo até o primeiro quadro num 4G real. |
| **Login** | 180+ logins em 1–2 min, muitos do mesmo IP | **Bloqueio até corrigir o S1.** Depois disso, o hash PBKDF2 (~50–100 ms de CPU cada) dá ~15 s de CPU espalhados no minuto: ok. |
| **Salvamento de progresso** | 1 salvamento a cada 10 s por pessoa assistindo. **Cada salvamento custa 2 requisições** (`GET /antiforgery` + `PUT/POST`) e cada requisição consulta o tenant no banco | 600 assistindo dão ~120 req/s e ~600–800 consultas/s. Cabe numa VM de 2 vCPU com Postgres local e os índices existentes, mas sem folga. **Corte barato:** reaproveitar o token CSRF (como `sendPlaybackQuality` já faz) e guardar o tenant em cache por 60 s. Isso corta ~60% das consultas. |
| **Medição de qualidade** | 1 envio/min por pessoa | Desprezível. |
| **Conversão (ffmpeg)** | CPU da mesma VM, prioridade `nice 19` | Ok se **ninguém enviar vídeo durante a semana**. Converta tudo antes do dia 1. |
| **Certificados** | Pico no último dia, PDF + transação serializável | Ok. As tentativas em caso de conflito já existem. |
| **Banco** | Postgres na VM, pool padrão de 100 | Ok. O backup diário no R2 e o ensaio de restauração são obrigatórios (ponto único de falha). |

**Custo por SIPAT de 600 pessoas:** R2 (armazenamento + operações) fica em centavos de dólar, sem custo de saída. Fica a VM (fixa por mês) ou, no Containers, o uso daquela semana. A banda deixa de ser problema.

**Para dar segurança ao número:** antes de 25/11, um teste de carga curto (k6 ou similar) com 200 sessões fazendo login e salvando a cada 10 s contra a VM real. Olhar o p95 dos salvamentos e a CPU do Postgres.

## 4. Dívida técnica priorizada

| Prioridade | Item | Por quê | Esforço |
|---|---|---|---|
| **P0 — antes do go-live** | S1: rate limit de login por IP | Bloqueia a fábrica no turno | P (1 h + teste) |
| **P0** | S2: o reset de senha libera o bloqueio | Senão o admin não consegue ajudar o operário no dia | P |
| P1 — antes do go-live, se der | Reaproveitar o token CSRF nas escritas do participante | Corta pela metade as requisições do salvamento | P |
| P1 | Cache de tenant por host (60 s, `IMemoryCache`) | Uma consulta a menos em toda requisição | P |
| P1 | S3/S4: HSTS, CSP report-only, headers no nginx | Endurecimento barato | P |
| P2 — dezembro (pré-requisito do Containers) | Data Protection no banco | Disco efêmero | P |
| P2 | Envio de vídeo direto ao R2 (PUT pré-assinado) | Limite de corpo do Worker; tira 250 MB do caminho da API | M |
| P2 | Fila de conversão segura para várias instâncias (`SKIP LOCKED` + lease) | Premissa de instância única | M |
| P2 | Rate limit fora da memória | Várias instâncias | P |
| P3 — saúde do código | S5: filtro de antiforgery nos grupos + teste de arquitetura | Hoje uma regra esquecida vira brecha | P |
| P3 | Ampliar `EndpointDatabaseTests` aos 5 endpoints que usam `PlatformDbContext` (ou mover para serviços) | A regra existe mas não pega quem viola | M |
| P3 | Quebrar `api.ts` (1.201 linhas), `PlatformCourseCatalogEndpoints.cs` (904), `App.tsx` (776) e `LearningService.cs` (777) por área | Arquivos que todo mundo edita e que geram conflitos | M |
| P3 | Tirar `src/Web/SipatOnline.Web/dist/` do Git | Build commitado gera diffs falsos e fica velho | P |
| P3 | Mover `EmployeeCredentialService`, `TenantPlanService` e `LearningDistributionService` para Application | Fronteira de camada | M |
| P4 — pendências do DECISOES-VIDEO | Grants expirados nunca apagados; POSTs concorrentes de faixa em last-write-wins (token `xmin`); evidência gravada fora da transação do progresso | Aceitas e documentadas. Nunca inflam a cobertura | P cada |

Já resolvidos desde o DECISOES-VIDEO (conferido no código): `Provider` desconhecido falha na partida; altura ímpar no `scale` (agora `trunc(ih/2)*2`); `HOME`/`RCLONE_CONFIG` na unidade do systemd; cache do token CSRF da qualidade invalidado; o editor de curso só oferece vídeos `Ready`; limite de 366 dias igual no cliente e no servidor.
