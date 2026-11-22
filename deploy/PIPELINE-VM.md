# Ambientes em VM com pipeline (dev e produção)

O mesmo código sobe em duas VMs separadas:

| | dev | produção |
|---|---|---|
| Branch | `dev` (todo push sobe sozinho) | `main` (manual: *Actions → Deploy production → Run workflow*) |
| Workflow | `.github/workflows/deploy-dev.yml` | `.github/workflows/deploy-production.yml` |
| Ambiente do GitHub | `dev` | `production` (pode exigir aprovação) |
| Terraform | workspace `dev`, `environments/dev.tfvars` | workspace `production`, `environments/production.tfvars` |
| Endereços | `ops.<ip-com-traços>.sslip.io` e `<empresa>.<ip-com-traços>.sslip.io` | `ops.<domínio>` e `<empresa>.<domínio>` |
| HTTPS | Let's Encrypt por HTTP-01, um nome por empresa | Let's Encrypt coringa (DNS-01) ou HTTP-01 |

Os dois usam o mesmo `deploy-vm.yml`: ele testa (CI), monta as imagens **no GitHub** (a VM nunca compila), copia as imagens e a pasta `deploy/` por SSH, escreve o `deploy/.env.production` a partir do ambiente do GitHub, roda o `db-init` e sobe `postgres`, `api` e `web`. No fim, confere `https://<PLATFORM_HOST>/health`.

O sistema sobe **vazio**. Só existe o dono da plataforma (`PLATFORM_OPERATOR_LOGIN_IDENTIFIER`), criado no primeiro deploy com a senha de `PLATFORM_OPERATOR_PASSWORD`. A senha só é lida enquanto a conta não existe. Trocar o segredo depois não muda a senha.

## 1. Criar a VM (Terraform)

```powershell
cd deploy\terraform
terraform init -backend-config="workspace_dir=$HOME/.sipat-online/terraform-state"
terraform workspace select -or-create dev
terraform apply -var-file=environments/dev.tfvars
terraform output
```

O estado fica em `~/.sipat-online/terraform-state`, fora do repositório. Faça backup dessa pasta: sem ela o Terraform não sabe o que já criou.

- **dev** (`create_dns_zone = false`): não cria zona de DNS. O sslip.io responde qualquer `*.<ip-com-traços>.sslip.io` com o IP da VM. A saída `platform_host` é o `PLATFORM_HOST` e `tenant_base_domain` é o `TENANT_BASE_DOMAIN`.
- **produção**: copie `environments/production.tfvars.example` para `environments/production.tfvars` (fora do Git), preencha o domínio e rode com o workspace `production`. Com `create_dns_zone = true`, delegue o domínio aos `dns_name_servers` e emita o certificado coringa (`deploy/README.md`, seção 3). Com o DNS na Cloudflare, use `create_dns_zone = false`, crie `ops` e `*` apontando para o IP e deixe `CERTIFICATE_MODE=http01`.

O `cloud-init` roda só no primeiro boot. Ele instala Docker, Certbot e a memória de troca (`swap_size_mb`) e cria `/opt/sipat-online/app`. Mudanças nele **não** recriam a VM.

## 2. Ambiente do GitHub

Em *Settings → Environments*, crie o ambiente (`dev` ou `production`) com:

**Variables**

| Nome | dev (exemplo) | Observação |
|---|---|---|
| `DEPLOY_HOST` | IP da VM | saída `public_ip_address` |
| `DEPLOY_USER` | `sipatadmin` | |
| `DEPLOY_APP_PATH` | `/opt/sipat-online/app` | |
| `TENANT_BASE_DOMAIN` | `20-1-2-3.sslip.io` | saída `tenant_base_domain` |
| `PLATFORM_HOST` | `ops.20-1-2-3.sslip.io` | saída `platform_host` |
| `PLATFORM_OPERATOR_LOGIN_IDENTIFIER` | `rafael.palma` | dono da plataforma |
| `PLATFORM_OPERATOR_DISPLAY_NAME` | `Rafael Palma` | |
| `CERTIFICATE_MODE` | `http01` | `http01`, `dns-azure` ou `manual` |
| `ACME_EMAIL` | (opcional) | avisos do Let's Encrypt |
| `VIDEO_STORAGE_PROVIDER` | `R2` | `File` = disco da VM |
| `R2_SERVICE_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | |
| `R2_VIDEO_BUCKET` | `sipat-videos-dev` | nunca o bucket da produção |
| `R2_DIRECT_UPLOAD` | `false` | `true` só com a regra CORS no bucket |

**Secrets**

| Nome | Conteúdo |
|---|---|
| `DEPLOY_SSH_PRIVATE_KEY` | chave privada só da pipeline (a pública vai em `additional_ssh_public_keys`) |
| `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 <IP>` |
| `POSTGRES_PASSWORD` | senha longa aleatória (só letras e números) |
| `PLATFORM_OPERATOR_PASSWORD` | senha inicial do dono |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | token S3 do R2 com acesso **só** ao bucket do ambiente |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | opcionais (Grafana Cloud) |

Com `VIDEO_STORAGE_PROVIDER=R2` e alguma configuração do R2 faltando, o deploy avisa e usa `File`. Assim a API nunca sobe quebrada.

## 3. Subir

- dev: `git push origin dev`. Também dá para rodar *Actions → Deploy dev → Run workflow*.
- produção: *Actions → Deploy production → Run workflow* na `main`.

## HTTPS por HTTP-01 (dev e produção sem coringa)

`deploy/scripts/issue-certificates.sh` pede ao Let's Encrypt um certificado com o `PLATFORM_HOST` e o host de cada empresa ativa. O timer `sipat-certificates.timer` roda o script a cada 10 minutos. Por isso, uma empresa criada na operação ganha HTTPS em até 10 minutos. O script só chama o Let's Encrypt quando a lista muda. A renovação é do `certbot renew` (timer do cloud-init).

## Custos (dev na conta gratuita da Azure)

- VM B1s (ou B2ats v2), disco P6 de 64 GB e IP público entram na camada grátis de 12 meses. Sem zona de DNS, não há custo de DNS.
- Na conta gratuita nada é cobrado no cartão enquanto ninguém clicar em **Upgrade**. Quando o crédito de US$ 200 (30 dias) acaba, a Azure **desliga** os recursos.
- Antes disso, baixe o backup do banco (`/var/backups/sipat-online`).
- Para apagar tudo: `terraform workspace select dev` e depois `terraform destroy -var-file=environments/dev.tfvars`.
