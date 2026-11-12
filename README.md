# SIPAT Online

Plataforma EAD para apoiar empresas na realização da **Semana Interna de Prevenção de Acidentes do Trabalho (SIPAT)**. Participantes acompanham conteúdos e progresso; equipes administrativas gerenciam empresas, cursos e atividades.

[![CI](https://github.com/healthfy-app/sipat-online/actions/workflows/ci.yml/badge.svg)](https://github.com/healthfy-app/sipat-online/actions/workflows/ci.yml)

> Projeto em desenvolvimento. A hospedagem de vídeo para produção e os critérios oficiais de participação ainda precisam ser definidos. A demonstração local não comprova participação oficial.

## O que já existe

- Portal por empresa com identidade visual própria.
- Perfis de Operacional, Admin, Supervisor e Participante, com dados isolados por empresa.
- Catálogo de cursos, editor de conteúdo, gamificação opcional e progresso de aprendizagem.
- API .NET, frontend React/TypeScript e persistência PostgreSQL.

## Tecnologias

| Camada | Stack |
| --- | --- |
| API e domínio | .NET 10, C# 14, ASP.NET Core |
| Web | React, TypeScript, Vite |
| Dados | PostgreSQL, Entity Framework Core |
| Testes | xUnit, Vitest, Testing Library e Testcontainers |
| Execução | Docker Compose; Azure VM + Terraform para implantação de referência |

A solução é um monólito modular: `src/Modules` contém os módulos de negócio; `src/Api`, `src/Infrastructure` e `src/Web` hospedam as camadas de execução. Os testes ficam em `tests/`.

## Rodar localmente

Requisitos: Docker Desktop com o engine ativo. Na raiz do repositório, execute:

```powershell
.\docker-local.ps1 up
```

Abra `https://ops.localhost:5188`. Na primeira execução, o script prepara o banco, as imagens e as credenciais de desenvolvimento. Os acessos locais são gravados em `.docker-local-credentials.txt`, arquivo privado e ignorado pelo Git. O navegador pode solicitar confirmação do certificado HTTPS local.

Para reconstruir após alterações:

```powershell
.\docker-local.ps1 up -Build
```

Outros comandos úteis: `.\docker-local.ps1 status`, `logs` e `stop`. Para conhecer a apresentação ponta a ponta e os dados de demonstração, consulte [docs/MVP-DEMO.md](docs/MVP-DEMO.md).

## Desenvolver e validar

Com SDK .NET 10, Node.js 24 e Docker disponíveis:

```powershell
dotnet restore SipatOnline.slnx
dotnet format whitespace SipatOnline.slnx --verify-no-changes --no-restore
dotnet test SipatOnline.slnx
```

No frontend:

```powershell
Set-Location src\Web\SipatOnline.Web
npm ci
npm run lint
npm test
npm run build
```

`npm run lint` executa o type-check do TypeScript. O CI também constrói as imagens de produção da API e do portal. Testes PostgreSQL usam Testcontainers e precisam do Docker ativo.

## CI e implantação

O workflow [CI](.github/workflows/ci.yml) valida formatação, testes .NET, type-check/testes/build do frontend e imagens Docker em pull requests e alterações em `main`.

A implantação de referência usa uma VM Azure de nó único, Terraform, DNS e Nginx. Veja [deploy/README.md](deploy/README.md) para provisionamento, configuração TLS, operação e limitações. Depois de preparar a VM e o arquivo `deploy/.env.production`, configure no ambiente GitHub `production`:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variável | `DEPLOY_HOST` | Host ou IP da VM |
| Variável | `DEPLOY_USER` | Usuário SSH de implantação |
| Variável | `DEPLOY_APP_PATH` | Caminho absoluto do clone, por exemplo `/opt/sipat-online/app` |
| Secret | `DEPLOY_SSH_PRIVATE_KEY` | Chave privada autorizada na VM |
| Secret | `DEPLOY_SSH_KNOWN_HOSTS` | Chave pública/fingerprint SSH confiável da VM |

O workflow [Deploy production](.github/workflows/deploy-production.yml) só pode ser iniciado manualmente em `main` e executa o CI antes de implantar. Ele atualiza o clone remoto em fast-forward, aplica as migrations e recria API e web. Proteja o ambiente `production` com revisores obrigatórios. A implantação não provisiona infraestrutura nem configura domínio, TLS, backups ou credenciais por você.

## Segurança

Nunca versione `.env`, `deploy/.env.production`, credenciais locais, tokens, chaves privadas ou arquivos Terraform de estado. Use GitHub Secrets para a automação e User Secrets/variáveis de ambiente no desenvolvimento. Revise [deploy/README.md](deploy/README.md) e configure backups externos testados antes de armazenar dados reais.
