# Implantação de produção (Azure VM + Nginx)

Esta topologia é uma opção econômica de MVP, não uma arquitetura de alta disponibilidade: uma VM executa Nginx, API e PostgreSQL. Interrupções da VM afetam todo o serviço. O PostgreSQL não é gerenciado e os backups locais da VM não substituem cópias externas testadas.

## 1. Preparar a conta e o domínio

- Instale Terraform e Azure CLI, autentique com `az login` e selecione a assinatura correta com `az account set --subscription <subscription-id>`.
- Tenha um domínio que você controla e uma chave SSH Ed25519. A chave pública deve existir no caminho informado ao Terraform.
- Obtenha seu IP público e use-o como `/32` para restringir SSH. Não abra SSH para `0.0.0.0/0`.
- O exemplo abaixo usa `brazilsouth`; escolha uma região e tamanho de VM disponíveis para sua assinatura e orçamento.

## 2. Provisionar a infraestrutura

No PowerShell, na raiz do repositório:

```powershell
Copy-Item deploy\terraform\terraform.tfvars.example deploy\terraform\terraform.tfvars
```

Edite `deploy\terraform\terraform.tfvars`: informe domínio, e-mail de Let's Encrypt, caminho da chave SSH e IP/CIDR permitido para SSH. Nunca coloque senhas, tokens ou chaves privadas nesse arquivo.

```powershell
Set-Location deploy\terraform
terraform init
terraform fmt -check
terraform validate
terraform plan -out sipat-online.tfplan
terraform apply sipat-online.tfplan
terraform output
```

O plano cria resource group, VNet/subnet, NSG, IP estático, VM Ubuntu 24.04, zona DNS, registros A de raiz e wildcard, identidade gerenciada e concessão `DNS Zone Contributor` limitada à zona. A VM instala Docker Compose e Certbot com plugin DNS do Azure. A senha de um service principal não é necessária e não é escrita no state.

Delegue no registrador do domínio os servidores retornados por `dns_name_servers`. A zona DNS só será autoritativa depois que essa delegação se propagar. O registro wildcard envia os subdomínios ao IP da VM.

## 3. Publicar o código na VM

Use o `ssh_command` da saída do Terraform. Copie ou clone o repositório para `/opt/sipat-online/app` usando seu método autenticado. Não coloque tokens Git na URL ou no histórico do shell.

No servidor, configure o ambiente de produção:

```bash
cd /opt/sipat-online/app
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
nano deploy/.env.production
```

Defina uma senha aleatória forte para PostgreSQL, o domínio delegado, uma chave GUID de tenant e nome/chave do primeiro tenant. Configure os três campos `BOOTSTRAP_ADMIN_*` com a matrícula, nome e senha inicial do Super Admin. O arquivo `.env.production` é ignorado pelo Git e contém segredos: mantenha-o legível apenas pelo administrador do servidor.

Antes de iniciar o portal, emita o certificado wildcard depois da propagação do DNS:

```bash
sudo /opt/certbot/bin/certbot certonly \
  --non-interactive --agree-tos \
  --email seu-email@seudominio.com \
  --dns-azure --dns-azure-config /etc/letsencrypt/dns-azure.ini \
  --cert-name sipat-online \
  -d seudominio.com -d '*.seudominio.com'
```

A identidade gerenciada da VM recebe permissão DNS apenas nessa zona. O timer do systemd renova o certificado diariamente e reinicia o Nginx após uma renovação bem-sucedida. O Nginx inicia em HTTP enquanto não existe certificado; faça o bootstrap do certificado antes de coletar credenciais ou enviar dados.

## 4. Inicializar banco e iniciar a aplicação

Na raiz do clone:

```bash
docker compose --env-file deploy/.env.production \
  -f deploy/compose.production.yaml up -d postgres
docker compose --env-file deploy/.env.production \
  -f deploy/compose.production.yaml --profile tools run --rm db-init
```

Após inicializar o Super Admin, remova a senha inicial e os demais campos `BOOTSTRAP_ADMIN_*` de `deploy/.env.production`. Depois suba a aplicação:

```bash
docker compose --env-file deploy/.env.production \
  -f deploy/compose.production.yaml up --build -d api web
docker compose --env-file deploy/.env.production \
  -f deploy/compose.production.yaml ps
```

O Postgres não publica porta no host nem na internet. Apenas Nginx publica 80/443. A rede Docker do backend é interna. O Nginx preserva o `Host` e encaminha `X-Forwarded-Proto`/`X-Forwarded-For`; a API confia somente no IP estático do contêiner Nginx.

Use `https://<chave-do-tenant>.<dominio>` para entrar. A raiz do domínio e chaves reservadas não são portais de tenant.

## Operação

- Atualização: obtenha a nova versão do código e execute `docker compose ... up --build -d api web`. Revise migrations e execute `db-init` quando a release alterar o schema.
- Saúde: `docker compose ... ps` e `curl -f https://<chave-do-tenant>.<dominio>/health`.
- Logs: `docker compose ... logs --tail 100 api web postgres`.
- Backup local diário: systemd grava dumps compactados em `/var/backups/sipat-online` e mantém 14 dias. Como os dumps ficam no mesmo disco da VM, configure e teste uma cópia off-site antes de armazenar dados reais. Faça também ensaios de restauração.
- Custos: compute, disco, IP público e DNS podem gerar cobrança conforme região/assinatura. Revise o custo no Azure Pricing Calculator antes de aplicar.
- Destruição: `terraform destroy` remove a VM, a rede, a zona e os dados persistidos nela; exporte os backups e confirme a delegação DNS antes de executar.

Esse provisionamento não cria alta disponibilidade, escalonamento horizontal, banco gerenciado, CDN de vídeo nem domínio customizado por empresa. Essas decisões dependem de orçamento, volume, requisitos de disponibilidade, retenção e região.
