# SIPAT Online

O SIPAT Online oferece o conteúdo digital das palestras de uma SIPAT em formato EAD. A SIPAT é um evento de realização obrigatória no contexto legal e de segurança do trabalho; a plataforma é um meio para realizar esse evento e engajar os participantes com soluções de aprendizagem úteis para sua vida profissional e pessoal.

O projeto está em fase inicial de desenvolvimento. As fatias verticais atuais implementam configuração do tenant, identidade/autenticação e administração básica de eventos SIPAT, atravessando Domain, Application, Infrastructure e API, com testes unitários, de arquitetura e de integração. A SIPAT continua sendo tratada como evento obrigatório, não como curso.

## Objetivos

- Organizar SIPATs de empresas e disponibilizar os conteúdos digitais das palestras.
- Engajar participantes com uma experiência EAD adequada às necessidades do aluno moderno.
- Comprovar participação por conteúdo assistido e carga horária, com relatórios e certificados.
- Permitir que empresas acompanhem a participação individual e por grupos e subgrupos.
- Apoiar uma migração gradual do sistema atual, preservando o histórico necessário.
- Manter uma arquitetura simples de evoluir, em um monólito modular.

## Perfis e capacidades

| Perfil | Capacidades previstas |
| --- | --- |
| Super Admin | Acesso global e sem restrições funcionais; gestão de usuários e relatórios individuais, por grupo e subgrupo de todas as SIPATs. As ações administrativas devem permanecer auditáveis. |
| Admin do cliente | Gestão de contas de participantes da empresa; acesso aos relatórios das SIPATs da sua empresa às quais recebeu acesso; consulta da participação individual e por grupos e subgrupos, conteúdos e carga horária; moderação de comentários. |
| Participante | Consulta do próprio conteúdo assistido e progresso, comentários nos vídeos, reprodução com retrocesso e emissão do próprio certificado quando cumprir os critérios. |

O acesso de Admin do cliente deve ser limitado à empresa e às SIPATs autorizadas, sem expor dados de outros clientes. A regra detalhada de como esse acesso é concedido será definida no domínio de Identity/Corporate.

## Regras de participação e vídeo

- O participante pode retroceder a reprodução, mas não avançar para uma posição ainda não assistida.
- Admins autorizados podem avançar e retroceder vídeos para fins de gestão e acompanhamento.
- O progresso deve refletir conteúdo efetivamente assistido; buscar até o final do vídeo, por si só, não comprova conclusão.
- Comentários são associados ao conteúdo e podem ser moderados por Admin do cliente.
- Relatórios registram participação individual e agregada por grupos e subgrupos, discriminando conteúdos e carga horária.
- A emissão do certificado depende do cumprimento dos critérios de participação da SIPAT e deve registrar a carga horária correspondente.

O controle de avanço precisa ser validado tecnicamente com o provedor de vídeo escolhido: não basta esconder o botão de avanço no player se a URL do vídeo puder ser acessada por fora ou se o progresso puder ser forjado pelo cliente.

## Linguagem do produto

- **SIPAT:** evento de segurança e prevenção do trabalho, não um curso.
- **SIPAT Online:** plataforma e conteúdo digital das palestras de uma SIPAT em formato EAD.
- **Participante:** pessoa que acessa os conteúdos da SIPAT.
- **Conteúdo/Palestra:** material de aprendizagem disponibilizado durante a SIPAT.
- **Participação:** realização dos conteúdos e carga horária computados para uma pessoa em uma SIPAT.
- **Grupo/Subgrupo:** agrupamento organizacional usado para segmentar participantes e relatórios.

## Tecnologias

- .NET 10 e C# 14
- ASP.NET Core Minimal API
- React, TypeScript e Vite (frontend em `src/SipatOnline.Web`)
- xUnit
- Nullable habilitado e warnings tratados como erros

## Estrutura da solução

```text
SipatOnline.slnx
src/
  SipatOnline.Api/
  SipatOnline.BuildingBlocks.Application/
  SipatOnline.BuildingBlocks.Domain/
  SipatOnline.Identity.Application/
  SipatOnline.Identity.Domain/
  SipatOnline.Sipats.Application/
  SipatOnline.Sipats.Domain/
  SipatOnline.Infrastructure/
  SipatOnline.Tenancy.Application/
  SipatOnline.Tenancy.Domain/
tests/
  SipatOnline.Application.UnitTests/
  SipatOnline.ArchitectureTests/
  SipatOnline.Domain.UnitTests/
  SipatOnline.IntegrationTests/
```

Os projetos ficam diretamente em `src/` e `tests/` para manter a estrutura enxuta. As camadas e módulos são separados por projeto, não por vários níveis de diretórios.

`Domain` concentra regras e tipos do negócio sem dependência de infraestrutura. `Application` coordena casos de uso e contratos. `Infrastructure` implementa persistência e integração com ASP.NET Core Identity. `Api` expõe os endpoints HTTP. A solução segue um monólito modular; não há requisito atual para microserviços ou Azure Functions.

## Pré-requisitos

- SDK do .NET 10
- Node.js LTS e npm para desenvolver e testar o frontend
- Git
- PostgreSQL para executar a aplicação e os testes de integração
- Docker Desktop com engine ativo para os testes de integração com PostgreSQL via Testcontainers

Confira o SDK ativo na raiz do repositório:

```powershell
dotnet --version
```

O arquivo `global.json` fixa a família do SDK em .NET 10.

## Restaurar, compilar e testar

Execute os comandos a partir da raiz do repositório:

```powershell
dotnet restore SipatOnline.slnx
dotnet build SipatOnline.slnx --no-restore
dotnet test SipatOnline.slnx --no-build
```

Para validar o frontend, execute a partir de `src\SipatOnline.Web`:

```powershell
npm ci
npm run lint
npm test
npm run build
```

## Configurar e executar a API

A API exige configuração explícita do banco e do tenant; não há valores de produção fictícios como fallback. Para desenvolvimento local, configure User Secrets no projeto da API:

```powershell
dotnet user-secrets init --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "ConnectionStrings:SipatOnline" "Host=localhost;Database=sipat_online;Username=postgres;Password=<senha-local>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:Tenant:Id" "<guid-estavel-do-tenant>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:Tenant:Key" "desenvolvimento" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:Tenant:Name" "Empresa de desenvolvimento" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:Tenant:BaseDomain" "localhost" --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

Para provisionar o primeiro Super Admin, configure também, usando uma senha forte e apenas para o ambiente local:

```powershell
dotnet user-secrets set "SipatOnline:BootstrapAdmin:LoginIdentifier" "<matricula>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:BootstrapAdmin:DisplayName" "<nome>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:BootstrapAdmin:Password" "<senha-forte>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

Inicialize o banco explicitamente. O comando aplica as migrations e cria o tenant, os perfis e, se configurado, o Super Admin:

```powershell
dotnet run --project src\SipatOnline.Api\SipatOnline.Api.csproj -- --initialize-database
```

Depois, inicie a API:

```powershell
dotnet run --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

A API fornece `GET /health`; a especificação OpenAPI é disponibilizada em ambiente de desenvolvimento. Em produção, cada empresa é resolvida pelo subdomínio de `SipatOnline:Tenant:BaseDomain` (por exemplo, `empresa.sipat.online`); em desenvolvimento, o domínio raiz usa o tenant configurado e subdomínios `*.localhost` resolvem pelo identificador da empresa. Hostnames desconhecidos e tenants inativos não recebem acesso. O domínio próprio do cliente está preparado no modelo de marca, mas não é ativado nesta etapa.

Os testes PostgreSQL usam Testcontainers. Se o Docker Engine não estiver disponível, esses testes serão ignorados; os testes unitários, de arquitetura e o teste de health continuam executando.

## Docker Compose (frontend + API + PostgreSQL)

O Compose é voltado ao desenvolvimento local. Ele inicia o frontend Vite com HTTPS local, a API e o PostgreSQL, mantém os dados em um volume nomeado e deixa a aplicação responsável por não aplicar migrations automaticamente ao iniciar. A inicialização do banco é um comando explícito.

Copie o arquivo de exemplo e substitua os valores locais, especialmente a senha do PostgreSQL. Se quiser criar o primeiro Super Admin, preencha os três campos `BOOTSTRAP_ADMIN_*`; deixe todos vazios para não criá-lo:

```powershell
Copy-Item .env.example .env
```

Execute os comandos a partir da raiz:

```powershell
docker compose up -d postgres
docker compose run --build --rm db-init
docker compose up --build -d api web
```

`db-init` aplica as migrations e inicializa o tenant e os perfis; se configurado, também cria o Super Admin. A API usa o hostname interno `postgres` para acessar o banco. O `.env` não deve ser versionado; a porta local do PostgreSQL e a porta HTTP da API podem ser alteradas por `POSTGRES_PORT` e `API_PORT`.

Abra `https://localhost:5173` para o tenant local configurado ou `https://<TENANT_KEY>.localhost:5173` para um tenant pelo subdomínio (o navegador pode pedir confirmação do certificado de desenvolvimento). Configure `TENANT_BASE_DOMAIN` para o domínio-raiz usado no ambiente; `localhost` é o padrão local. A API permanece acessível em `http://localhost:8080/health`.

Para executar o frontend sem Compose, instale Node.js LTS e rode `npm ci` e `npm run dev` dentro de `src\SipatOnline.Web`; por padrão o proxy local encaminha `/api` para `http://localhost:8080`. O destino pode ser alterado com `SIPAT_API_TARGET`.

Confira a API e acompanhe os logs com:

```powershell
docker compose ps
docker compose logs -f api
docker compose logs -f web
```

Parar os serviços preservando o banco:

```powershell
docker compose down
```

Para apagar também o volume e todos os dados locais do PostgreSQL, execute explicitamente `docker compose down --volumes`. Essa remoção é destrutiva; só use quando quiser reinicializar o banco do zero.

Os testes automatizados continuam usando PostgreSQL efêmero via Testcontainers, separado do volume do Compose:

```powershell
dotnet test tests\SipatOnline.IntegrationTests\SipatOnline.IntegrationTests.csproj
```

Esse comando requer Docker Engine ativo.

## Listagem administrativa de usuários

Usuários autorizados podem consultar as contas do tenant resolvido pelo hostname por `GET /api/admin/users`. A resposta é paginada por `offset` e `limit` (padrões `0` e `50`; limite máximo `100`) e contém somente matrícula, nome de exibição, estado e ID interno — nunca senha ou hash. A consulta respeita o tenant atual e requer autenticação de Super Admin ou Admin do cliente.

## Portais por empresa

Cada tenant ativo é acessado pelo seu identificador como subdomínio de `SipatOnline:Tenant:BaseDomain` (por exemplo, `empresa.sipat.online`). O servidor resolve o tenant antes da autenticação; hostnames desconhecidos, chaves reservadas (`api`, `admin`, `app`, `www`) e tenants inativos não recebem contexto de tenant. A sessão também carrega o tenant ao qual o usuário pertence, e uma sessão de uma empresa não pode ser reutilizada em outra.

`GET /api/tenant/branding` retorna nome, logo e cores públicos do tenant atual; `GET /api/identity/session` retorna o usuário autenticado e seus papéis. Em desenvolvimento, o hostname raiz `localhost` usa o tenant configurado e subdomínios como `empresa.localhost` resolvem pela chave. Em produção, a raiz do domínio não é um tenant: o tráfego do portal deve chegar pelo subdomínio.

O proxy/ingress de produção deve preservar o `Host` original ao encaminhar as requisições para a API. Não confie em `X-Forwarded-Host` de clientes nem habilite essa resolução sem configurar uma lista de proxies confiáveis. No modo Development, a API aceita `X-Forwarded-Proto` somente do proxy local configurado por `SipatOnline:DevelopmentProxy:Host` (o serviço `web` no Compose; `localhost` fora dele).

Domínios próprios do cliente ainda não são resolvidos nem validados por DNS/TLS. A configuração `CustomDomain` existente é apenas um ponto de extensão para uma etapa futura, após definir a hospedagem e o processo de verificação do domínio.

## Administração de SIPATs

O `Tenant` existente representa a empresa. Não há uma entidade de empresa duplicada; cada evento SIPAT está associado ao tenant atual e suas consultas são isoladas por esse vínculo. Admins do cliente e Super Admins podem criar e consultar eventos, editar título/descrição/período, publicar e cancelar:

- `GET /api/admin/sipats?offset=0&limit=50` — lista paginada do tenant atual.
- `GET /api/admin/sipats/{id}` — consulta um evento do tenant atual.
- `POST /api/admin/sipats` — cria um evento em rascunho.
- `PUT /api/admin/sipats/{id}` — altera dados do evento.
- `POST /api/admin/sipats/{id}/publish` — publica um rascunho.
- `POST /api/admin/sipats/{id}/cancel` — cancela um evento em rascunho ou publicado.

Título, início e fim são obrigatórios; a data final deve ser posterior à inicial. Datas passadas são aceitas para permitir registros históricos, e instantes são normalizados para UTC. Rascunhos e eventos publicados podem ser editados; eventos cancelados são terminais. Escritas exigem autenticação, autorização administrativa e token antifalsificação, e são registradas na auditoria.

Inscrições/atribuição de participantes, grupos e subgrupos, conteúdo das palestras e regras de participação permanecem fora desta fatia.

## Decisões de produto já definidas

- O foco inicial é B2B: empresas contratam o serviço e acompanham seus colaboradores.
- Matrículas não exigem CPF. O vínculo do participante é associado à empresa e à matrícula.
- Pagamentos e checkout acontecem fora da plataforma e não fazem parte do escopo inicial.
- Os vídeos são de autoria própria; o provedor de hospedagem ainda será escolhido.
- A plataforma pode adotar padrões funcionais comuns a produtos de aprendizagem, mantendo marca, interface e conteúdo originais.
- A plataforma entrega o conteúdo digital do evento SIPAT; não deve tratar a SIPAT como sinônimo de curso.

## Próximas etapas

1. Validar os critérios de participação, cálculo de carga horária e emissão de certificados com o negócio.
2. Definir como grupos/subgrupos são organizados e como Admins do cliente recebem acesso a SIPATs.
3. Expandir os casos de uso e regras de Identity/Tenancy a partir das necessidades confirmadas do negócio.
4. Implementar os vínculos entre empresa, usuário e SIPAT, mantendo as camadas e limites de dependência.
5. Definir o provedor de vídeo por meio de uma prova de conceito que avalie privacidade, reprodução incorporada, bloqueio de avanço, legendas, progresso, interatividade, custos e portabilidade.
6. Validar os formatos de exportação e os volumes de dados do sistema atual antes de detalhar a migração.

## Segurança e configuração

Não armazene senhas, tokens, chaves ou outras credenciais neste repositório. Configurações locais e segredos de desenvolvimento devem ser fornecidos por mecanismos apropriados, como User Secrets ou variáveis de ambiente.
