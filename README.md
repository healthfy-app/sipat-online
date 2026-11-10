# SIPAT Online

SIPAT é a Semana Interna de Prevenção de Acidentes do Trabalho: um evento de prevenção previsto no contexto legal da CIPA/NR-5, realizado como uma semana de atividades. A empresa contrata o SIPAT Online para disponibilizar digitalmente as palestras e acompanhar a participação; a plataforma é um meio EAD para realizar a SIPAT, não a SIPAT em si nem um curso que a substitui.

O projeto está em fase inicial de desenvolvimento. As fatias verticais atuais implementam configuração do tenant, identidade/autenticação, programação da SIPAT e aprendizagem em vídeo, atravessando Domain, Application, Infrastructure, API e interface web. A SIPAT é o evento semanal de prevenção da empresa; a plataforma oferece o conteúdo digital das palestras em EAD e acompanha a participação.

## Objetivos

- Apoiar a realização da SIPAT de cada empresa com palestras e conteúdos digitais em EAD.
- Engajar participantes com uma experiência EAD adequada às necessidades do aluno moderno.
- Comprovar participação por conteúdo assistido e carga horária, com relatórios e certificados.
- Permitir que empresas acompanhem a participação individual e por grupos e subgrupos.
- Apoiar uma migração gradual do sistema atual, preservando o histórico necessário.
- Manter uma arquitetura simples de evoluir, em um monólito modular.

## Perfis e capacidades

| Perfil | Capacidades previstas |
| --- | --- |
| Operacional / Super Admin da plataforma (`PlatformOperator`, identidade global) | Gestor máximo ("dono"): vê todas as empresas e todas as SIPATs, gere usuários e empresas, cria e mantém cursos (criar ou duplicar), sobe vídeos para uma biblioteca reutilizável, vincula vídeos aos cursos, ativa ou desativa a gamificação do curso e consulta relatórios globais. Já provisiona empresas e consulta um diretório paginado de usuários de todos os tenants; edição de contas, relatórios globais, biblioteca de vídeos e gamificação ainda faltam. |
| Supervisor | Usuário da empresa contratante, criado pelo Operacional (papel `Supervisor`), sem acesso às telas administrativas. Ele pertence a uma única empresa e o isolamento por tenant já se aplica a ele. A associação por SIPAT e as telas de relatório serão feitas junto com o módulo de relatórios, que ainda não existe. |
| Admin do cliente (`ClientAdmin`) | Gestão dos usuários da própria empresa e acesso aos relatórios das SIPATs sob sua responsabilidade. Pode consultar participação individual e por subgrupos, avançar/retroceder a reprodução para acompanhamento e moderar comentários. O acesso continua limitado ao tenant e às SIPATs autorizadas. |
| Super Admin legado (`SuperAdmin`) | Papel administrativo existente, ainda tenant-bound. Não equivale ao Super Admin global descrito pelo PO; alinhar/migrar esse papel sem ampliar acesso entre empresas por acidente. |
| Participante | Consulta seu próprio relatório de conteúdos assistidos e progresso, pode retroceder mas não avançar para trechos não assistidos, comentar nos vídeos e emitir certificado quando cumprir os critérios. |

O escopo global do Super Admin não remove autenticação, auditoria ou controles contra ações acidentais; permite operações e relatórios entre tenants apenas para esse perfil privilegiado. Admins de clientes não acessam dados de outras empresas. A sessão de `PlatformOperator` existe somente no host central de operação.

## Regras de participação e vídeo

- A programação da SIPAT organiza trilhas; cada trilha contém itens de vídeo. No MVP, trilhas são atribuídas individualmente e o participante só pode consultar trilhas que lhe foram atribuídas.
- Os vídeos de uma trilha podem ser assistidos em qualquer ordem.
- O progresso é independente por participante e item de vídeo dentro da trilha. Assistir ao mesmo vídeo em outra trilha não transfere o progresso.
- Um vídeo é concluído quando pelo menos 90% da duração tiver cobertura de reprodução verificada. Intervalos repetidos contam uma única vez; buscar até o final não comprova conclusão.
- Alterações de conteúdo publicado geram uma nova revisão; revisões anteriores e seus progressos permanecem preservados.
- O participante pode retroceder, mas não avançar para trechos não assistidos; Admins autorizados podem avançar e retroceder para acompanhamento.
- Admins não podem alterar manualmente o progresso do participante.
- O progresso é calculado e persistido no servidor a partir de evidência verificável do provedor; o percentual enviado pelo navegador não é fonte de verdade.
- Comentários são associados ao vídeo; participantes podem comentar e Admins do cliente podem moderar.
- Relatórios por SIPAT registram participação individual e agregada por grupos/subgrupos, discriminando conteúdos assistidos e carga horária. O Super Admin da plataforma consulta relatórios entre empresas.
- A emissão do certificado depende dos critérios de participação da SIPAT e registra a carga horária correspondente.
- O ranking de gamificação é específico por SIPAT e usa pontos; os critérios de pontuação precisam ser definidos antes de serem implementados.

O domínio de aprendizagem é um módulo separado (`Learning`); trilhas, mídias e progresso dão suporte digital à SIPAT, sem substituir o evento organizado pela empresa. O agregado `SipatEvent` não é ampliado com mídia e progresso. A integração de hospedagem será feita por uma porta/adaptador de provedor gerenciado. O fornecedor só será escolhido após uma prova de conceito que comprove reprodução protegida e evidência autenticável de reprodução; o player não é autoridade para declarar conclusão.

## Linguagem do produto

- **SIPAT:** evento de prevenção previsto no contexto legal da CIPA/NR-5 e realizado como uma semana de atividades.
- **SIPAT Online:** conteúdo digital das palestras de uma SIPAT em formato EAD e a plataforma que viabiliza sua realização.
- **Participante:** pessoa que acessa os conteúdos da SIPAT.
- **Conteúdo/Palestra:** material de aprendizagem disponibilizado durante a SIPAT.
- **Participação:** realização dos conteúdos e carga horária computados para uma pessoa em uma SIPAT.
- **Grupo/Subgrupo:** agrupamento organizacional usado para segmentar participantes e relatórios.
- **Operacional:** nome de produto do perfil do dono da plataforma (`PlatformOperator`); sua visão inicial é a lista de empresas e a lista de treinamentos (cujos nomes costumam incluir a empresa), e o dashboard fica em página separada.
- **Supervisor:** usuário da empresa contratante com acesso apenas aos relatórios da sua SIPAT.
- **Curso (catálogo):** conjunto reutilizável de vídeos mantido pelo Operacional; pode ser duplicado e tem gamificação opcional, definida ao criar o curso. Fluxo: curso, vídeos, gamificação.

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
dotnet user-secrets set "SipatOnline:Tenant:PlatformHost" "ops.localhost" --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

Para acessar a operação global local, configure um operador distinto de qualquer conta de empresa. Use uma senha forte e guarde-a em User Secrets:

```powershell
dotnet user-secrets set "SipatOnline:PlatformOperator:LoginIdentifier" "<matricula-do-operador>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:PlatformOperator:DisplayName" "<nome-do-operador>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:PlatformOperator:Password" "<senha-forte>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

O `BootstrapAdmin` abaixo cria um `SuperAdmin` tenant-bound para manutenção da empresa configurada; ele não pode cadastrar tenants:

```powershell
dotnet user-secrets set "SipatOnline:BootstrapAdmin:LoginIdentifier" "<matricula>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:BootstrapAdmin:DisplayName" "<nome>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:BootstrapAdmin:Password" "<senha-forte>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

Inicialize o banco explicitamente. O comando aplica as migrations e cria o tenant local, os perfis e as contas de bootstrap configuradas:

```powershell
dotnet run --project src\SipatOnline.Api\SipatOnline.Api.csproj -- --initialize-database
```

Depois, inicie a API:

```powershell
dotnet run --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

A API fornece `GET /health`; a especificação OpenAPI é disponibilizada em ambiente de desenvolvimento. Em produção, cada empresa é resolvida pelo subdomínio de `SipatOnline:Tenant:BaseDomain` (por exemplo, `empresa.sipat.online`); em desenvolvimento, o domínio raiz usa o tenant configurado e subdomínios `*.localhost` resolvem pelo identificador da empresa. A operação central usa o host distinto `SipatOnline:Tenant:PlatformHost` (localmente `ops.localhost`). Hostnames desconhecidos e tenants inativos não recebem acesso. Domínios próprios de clientes não são resolvidos nesta etapa.

### Demonstração local de vídeo e progresso

Em `Development`, `SipatOnline:Learning:DevelopmentSampleEnabled` cria um perfil de participante separado do Super Admin, uma SIPAT e quatro trilhas atribuídas a esse participante. Configure o acesso local com uma senha forte guardada em User Secrets:

```powershell
dotnet user-secrets set "SipatOnline:Learning:DevelopmentSampleParticipant:LoginIdentifier" "participante.demo" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:Learning:DevelopmentSampleParticipant:DisplayName" "Participante de demonstração" --project src\SipatOnline.Api\SipatOnline.Api.csproj
dotnet user-secrets set "SipatOnline:Learning:DevelopmentSampleParticipant:Password" "<senha-forte>" --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

O perfil de desenvolvimento recebe as trilhas **Ergonomia e atividade física**, **Alimentação para uma vida saudável** e **Comportamento seguro**, com referências públicas do NIOSH/CDC que não são o catálogo proprietário da SIPAT Online. Uma quarta trilha, **Demonstração técnica — vídeo e progresso**, contém o MP4 CC0 de flores da MDN para validar a reprodução e o salvamento de progresso em navegadores compatíveis; ela não é conteúdo de curso. Para testar o fluxo numa empresa recém-cadastrada, o Admin pode criar uma trilha com a referência `development:mdn-flower-demo` e duração `5,055` segundos, publicar e atribuí-la a um participante. A integração de produção continua indisponível até que os arquivos/URLs autorizados do catálogo e um provedor com evidência verificável sejam configurados.

Assista a um vídeo para verificar retomada e progresso persistidos pela API. A verificação atual é local/em memória, pode ser perdida ao reiniciar a API e **não comprova participação oficial**. Não habilite `DevelopmentSampleEnabled` fora de Development. Se os dados do participante estiverem incompletos, a aplicação registra um aviso e não cria o perfil de aprendizagem.

O fluxo de demonstração ponta a ponta é: entrar em `ops.localhost` como `PlatformOperator`, cadastrar empresa e primeiro Admin, e cadastrar os participantes no diretório global; entrar como Admin no subdomínio da empresa, criar uma programação da SIPAT, criar/publicar uma trilha em **Trilhas e vídeos** e atribuí-la ao participante em **Participantes e trilhas**; por fim, entrar como participante no mesmo subdomínio e assistir ao vídeo. Em Development, use somente a referência técnica `development:mdn-flower-demo` descrita acima. Em outros ambientes, a autoria depende de IDs de ativos reconhecidos por um provedor configurado; o provedor de produção e o catálogo de vídeos autorizados ainda não foram definidos.

Os testes PostgreSQL usam Testcontainers. Se o Docker Engine não estiver disponível, esses testes serão ignorados; os testes unitários, de arquitetura e o teste de health continuam executando.

## Docker Compose (frontend + API + PostgreSQL)

O Compose é voltado ao desenvolvimento local. Ele inicia o frontend Vite com HTTPS local, a API e o PostgreSQL, mantém os dados em um volume nomeado e deixa a aplicação responsável por não aplicar migrations automaticamente ao iniciar. A inicialização do banco é um comando explícito.

### Fluxo rápido no Windows

Inicie o Docker Desktop e execute na raiz do projeto:

```powershell
.\docker-local.ps1 up
```

O script cria o projeto Docker isolado `sipat-online-dev`, sem modificar os volumes de outros projetos, e gera `.env.docker.local` e `.docker-local-credentials.txt` somente na primeira execução. Ambos são ignorados pelo Git. O documento contém os acessos locais do participante, administrador, operador e PostgreSQL; mantenha-o privado e não use essas senhas em produção. As portas do ambiente isolado são expostas apenas em `127.0.0.1`. Acesse `https://localhost:5188` ou `https://ops.localhost:5188` para a operação. O navegador pode pedir confirmação do certificado de desenvolvimento.

Se `ops.localhost` ou o subdomínio de uma empresa não resolver no Windows, adicione uma entrada `127.0.0.1 ops.localhost` ou `127.0.0.1 <chave-da-empresa>.localhost` ao arquivo `C:\Windows\System32\drivers\etc\hosts` como administrador. O script não modifica esse arquivo.

Na primeira execução, as imagens são construídas; nas seguintes são reutilizadas. O script aguarda o banco e executa as migrations e o seed idempotente antes de iniciar os serviços, sem apagar dados ou substituir senhas de usuários existentes. Para aplicar alterações no código ou nas dependências, reconstrua explicitamente:

```powershell
.\docker-local.ps1 up -Build
.\docker-local.ps1 status
.\docker-local.ps1 logs
.\docker-local.ps1 seed
.\docker-local.ps1 stop
```

`stop` para os serviços sem remover os volumes. O seed cria apenas os dados de demonstração descritos abaixo; não importa empresas ou contas de outros worktrees. Se as portas 5188, 8088 ou 5438 estiverem ocupadas, altere `WEB_PORT`, `API_PORT` ou `POSTGRES_PORT` no arquivo local e ajuste os endereços no documento de credenciais. Para uma instalação existente, trocar a senha no arquivo não altera a senha armazenada no PostgreSQL ou nas contas já criadas. Preserve os dois arquivos locais junto com o volume correspondente: perder ou trocar credenciais não recria automaticamente o banco nem redefine senhas. Arquivos ignorados não são criptografados.

### Compose manual

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
Em desenvolvimento, `DEVELOPMENT_PROXY_HOST` define o endereço confiável do proxy da API e usa `web` por padrão. Para um proxy HTTP executado no host, use o endereço gateway da rede Docker local (por exemplo, `172.18.0.1`); não use `host.docker.internal`, que aponta para o host de destino e não para o endereço de origem visto pela API.

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

## Implantação em produção (Azure + Terraform + Nginx)

Há uma topologia inicial de custo controlado em [deploy/README.md](./deploy/README.md): Terraform provisiona uma VM Ubuntu, DNS wildcard, identidade gerenciada para certificados TLS e regras de rede; Docker Compose executa API e PostgreSQL sem portas públicas; Nginx serve o build de produção do frontend e encaminha as chamadas à API. Configure região, domínio, e-mail TLS, chave SSH e CIDR administrativo antes de provisionar.

Essa opção é um MVP de nó único, não alta disponibilidade. O PostgreSQL e o backup agendado ficam no disco da VM; configure cópias off-site e testes de restauração antes de armazenar dados reais. Revise os custos Azure para sua região e assinatura. A aplicação ainda não oferece vídeo/CDN ou domínios personalizados por cliente.

## Listagem administrativa de usuários

Admins podem consultar contas do tenant resolvido pelo hostname por `GET /api/admin/users`; `GET /api/admin/users/participants` lista somente participantes para a tela de atribuição. As respostas são paginadas por `offset` e `limit` (padrões `0` e `50`; limite máximo `100`) e contêm somente matrícula, nome de exibição, estado e ID interno — nunca senha ou hash. `GET /api/admin/learning/tracks` lista trilhas do tenant para a administração. `GET /api/admin/learning/participation` retorna atribuições ativas e progresso por participante e trilha do tenant atual. A atribuição é validada novamente na API e só aceita participante ativo e trilha publicada do mesmo tenant.

## Portais por empresa

O endereço inicial abre o login ou, se já houver uma sessão, a área correspondente ao perfil. Após autenticar, o participante vê sua formação e o progresso das trilhas atribuídas; certificado e fórum são indicados como funcionalidades futuras.

Cada tenant ativo é acessado pelo seu identificador como subdomínio de `SipatOnline:Tenant:BaseDomain` (por exemplo, `empresa.sipat.online`). O servidor resolve o tenant antes da autenticação; hostnames desconhecidos, chaves reservadas (`api`, `admin`, `app`, `www`) e tenants inativos não recebem contexto de tenant. A sessão também carrega o tenant ao qual o usuário pertence, e uma sessão de uma empresa não pode ser reutilizada em outra.

`GET /api/tenant/branding` retorna nome, logo e cores públicos do tenant atual; `GET /api/identity/session` retorna o usuário autenticado e seus papéis. Em desenvolvimento, o hostname raiz `localhost` usa o tenant configurado e subdomínios como `empresa.localhost` resolvem pela chave. Em produção, a raiz do domínio não é um tenant: o tráfego do portal deve chegar pelo subdomínio.

O host configurado em `SipatOnline:Tenant:PlatformHost` é isolado do tenant plane. Nele, `PlatformOperator` autentica por `/api/platform/identity/login`, cadastra empresas em `/api/platform/companies` e consulta usuários de empresas em `/api/platform/users?offset=0&limit=50`. O login global padrão é `sipat.online.admin`; a conta só é provisionada quando `PLATFORM_OPERATOR_PASSWORD` está configurada como segredo local. O provisionamento cria o tenant e seu primeiro `ClientAdmin` em uma transação auditada. O diretório global é paginado (limite máximo `100`) e não retorna e-mails, senhas ou hashes. `POST /api/platform/users` cria usuários em uma empresa ativa, limitado aos perfis `Participant` e `ClientAdmin`, e registra a operação na auditoria. A listagem de empresas também não retorna credenciais. Usuários de empresa não podem usar essas APIs, mesmo que tentem reutilizar uma sessão em outro host.

O painel global `/platform/dashboard` ordena empresas pela quantidade de participantes ativos cadastrados; esse número não representa o limite comercial contratado. O catálogo global `/platform/courses` permite cadastrar cursos e vídeos MP4/WebM de até 250 MiB. No Compose, os arquivos ficam no volume Docker `platform-course-videos`; o armazenamento atual é local e não deve ser considerado uma solução de mídia de produção. Contratos, limites comerciais e associação do catálogo global aos pacotes dos tenants ainda não existem.

O proxy/ingress de produção deve preservar o `Host` original ao encaminhar as requisições para a API. Não confie em `X-Forwarded-Host` de clientes nem habilite essa resolução sem configurar uma lista de proxies confiáveis. No modo Development, a API aceita `X-Forwarded-Proto` somente do proxy local configurado por `SipatOnline:DevelopmentProxy:Host` (o serviço `web` no Compose; `localhost` fora dele).

Domínios próprios do cliente ainda não são resolvidos nem validados por DNS/TLS. A configuração `CustomDomain` existente é apenas um ponto de extensão para uma etapa futura, após definir a hospedagem e o processo de verificação do domínio.

## Administração da programação da SIPAT

O `Tenant` existente representa a empresa. Não há uma entidade de empresa duplicada; cada programação SIPAT está associada ao tenant atual e suas consultas são isoladas por esse vínculo. Admins do cliente e Super Admins podem criar e consultar programações, editar título/descrição/período, publicar e cancelar:

- `GET /api/admin/sipats?offset=0&limit=50` — lista paginada do tenant atual.
- `GET /api/admin/sipats/{id}` — consulta um evento do tenant atual.
- `POST /api/admin/sipats` — cria um evento em rascunho.
- `PUT /api/admin/sipats/{id}` — altera dados do evento.
- `POST /api/admin/sipats/{id}/publish` — publica um rascunho.
- `POST /api/admin/sipats/{id}/cancel` — cancela um evento em rascunho ou publicado.

Título, início e fim são obrigatórios; a data final deve ser posterior à inicial. Datas passadas são aceitas para permitir registros históricos, e instantes são normalizados para UTC. Rascunhos e programações publicadas podem ser editados; programações canceladas são terminais. Escritas exigem autenticação, autorização administrativa e token antifalsificação, e são registradas na auditoria.

As telas administrativas para grupos/subgrupos, admins com escopo limitado, relatórios por SIPAT, comentários, certificados, ranking e regras oficiais de participação ainda não estão implementadas. A aprendizagem já inclui trilhas versionadas, autoria e publicação de trilhas, atribuição individual, player do participante, progresso salvo no servidor e acompanhamento tenant-scoped das atribuições ativas.

## Decisões de produto já definidas

- O foco inicial é B2B: empresas contratam o serviço e acompanham seus colaboradores.
- Matrículas não exigem CPF. O vínculo do participante é associado à empresa e à matrícula.
- Pagamentos e checkout acontecem fora da plataforma e não fazem parte do escopo inicial.
- Os vídeos são de autoria própria; será usado um provedor gerenciado por adapter, mas o fornecedor ainda será escolhido por prova de conceito.
- O progresso de vídeo exige 90% de cobertura reproduzida verificável, é segregado por item na trilha e não é compartilhado entre trilhas.
- A atribuição de trilhas começa individualmente; grupos/subgrupos ficam para uma etapa futura.
- Participantes são identificados pelo ID do usuário autenticado existente; Learning não cria uma identidade paralela.
- A plataforma pode adotar padrões funcionais comuns a produtos de aprendizagem, mantendo marca, interface e conteúdo originais.
- O que a empresa contrata é o SIPAT Online: conteúdo digital das palestras em EAD e a plataforma que viabiliza a realização da SIPAT, evento de prevenção da empresa.

## Próximas etapas

1. **Permissões e escopo administrativo:** evoluir o `PlatformOperator` global (já provisiona empresas e consulta diretório de usuários) para gestão de contas e relatórios entre tenants; manter `SuperAdmin` legado tenant-bound até migração segura e auditar as operações globais.
2. **Participação e estrutura organizacional:** modelar participação de usuários por SIPAT, grupos/subgrupos e quais SIPATs o Admin do cliente pode administrar/consultar.
3. **Conteúdo real e reprodução:** escolher provedor por prova de conceito, cadastrar palestras/vídeos autorizados, obter duração/legendas e substituir as referências técnicas de demonstração por assets de produção.
4. **Relatórios e carga horária:** disponibilizar relatório pessoal para participantes e relatórios individuais/agregados por SIPAT para Admins autorizados e Super Admins.
5. **Interação e acompanhamento:** comentários nos vídeos, moderação pelo Admin e controles de reprodução para gestão, sem permitir ao participante avançar conteúdo não assistido.
6. **Certificados:** fechar critérios com o PO e emitir certificado pessoal com participação/carga horária comprovadas.
7. **Gamificação:** definir com o PO as regras de pontuação, desempate, privacidade e visibilidade do ranking por SIPAT antes de persistir pontos.
8. **Pacotes comerciais:** representar os planos/grades contratados e limitar o catálogo e a atribuição às trilhas incluídas em cada contratação.
9. **Operação de produção:** concluir segurança, backups com restauração testada, monitoramento e processo de DNS/TLS para domínios de clientes antes de dados reais.
10. **Migração:** validar os formatos de exportação e volumes do sistema atual antes de importar histórico.

A arquitetura proposta para trilhas, vídeos, progresso, integração de provedor e compatibilidade com os módulos existentes está em [docs/architecture/video-progress.md](./docs/architecture/video-progress.md).

## Segurança e configuração

Não armazene senhas, tokens, chaves ou outras credenciais neste repositório. Configurações locais e segredos de desenvolvimento devem ser fornecidos por mecanismos apropriados, como User Secrets ou variáveis de ambiente.
