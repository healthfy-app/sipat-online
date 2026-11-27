# Ambientes em VM com pipeline (dev e produção)

O mesmo código sobe em duas VMs separadas. Qualquer VM Ubuntu ou Debian serve (Azure, Hetzner, Oracle, uma VM do cliente): o deploy prepara a máquina sozinho. Para trocar de VM, veja a seção 4.

| | dev | produção |
|---|---|---|
| Branch | `dev` (todo push sobe sozinho) | `main` (manual: *Actions → Deploy production → Run workflow*) |
| Workflow | `.github/workflows/deploy-dev.yml` | `.github/workflows/deploy-production.yml` |
| Ambiente do GitHub | `dev` | `production` (pode exigir aprovação) |
| Terraform | workspace `dev`, `environments/dev.tfvars` | workspace `production`, `environments/production.tfvars` |
| Endereços | `ops.<ip-com-traços>.sslip.io` e `<empresa>.<ip-com-traços>.sslip.io` | `ops.<domínio>` e `<empresa>.<domínio>` |
| HTTPS | Let's Encrypt por HTTP-01, um nome por empresa | Let's Encrypt coringa (DNS-01) ou HTTP-01 |

Os dois usam o mesmo `deploy-vm.yml`: ele testa (CI), prepara a VM (Docker, rclone, Certbot, pastas e memória de troca, só o que faltar), monta as imagens **no GitHub** (a VM nunca compila), copia as imagens e a pasta `deploy/` por SSH, escreve o `deploy/.env.production` a partir do ambiente do GitHub, roda o `db-init` e sobe `postgres`, `api` e `web`. No fim, confere `https://<PLATFORM_HOST>/health`.

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

O `cloud-init` roda só no primeiro boot. Ele adianta a instalação na Azure, mas não é obrigatório: o deploy instala o que faltar. Mudanças nele **não** recriam a VM.

## 2. Ambiente do GitHub

Em *Settings → Environments*, crie o ambiente (`dev` ou `production`) com:

**Variables**

| Nome | dev (exemplo) | Observação |
|---|---|---|
| `DEPLOY_HOST` | IP da VM | saída `public_ip_address` |
| `DEPLOY_USER` | `sipatadmin` | |
| `DEPLOY_APP_PATH` | `/opt/sipat-online/app` | |
| `TENANT_BASE_DOMAIN` | (vazio no dev) | com domínio próprio, o domínio. Vazio junto com `PLATFORM_HOST`: vem do IP, `<ip-com-traços>.sslip.io` |
| `PLATFORM_HOST` | (vazio no dev) | com domínio próprio, `ops.<domínio>`. Vazio: `ops.<ip-com-traços>.sslip.io` |
| `PLATFORM_OPERATOR_LOGIN_IDENTIFIER` | `rafael.palma` | dono da plataforma |
| `PLATFORM_OPERATOR_DISPLAY_NAME` | `Rafael Palma` | |
| `CERTIFICATE_MODE` | `http01` | `http01`, `dns-azure` ou `manual` |
| `ACME_EMAIL` | (opcional) | avisos do Let's Encrypt |
| `VIDEO_STORAGE_PROVIDER` | `R2` | `File` = disco da VM |
| `R2_SERVICE_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | |
| `R2_VIDEO_BUCKET` | `sipat-videos-dev` | nunca o bucket da produção |
| `R2_DIRECT_UPLOAD` | `false` | `true` só com a regra CORS no bucket |
| `R2_BACKUP_BUCKET` | `sipat-backups-dev` | backup diário do banco (03:00, 30 dias) e de onde uma VM nova restaura. Bucket **privado**, nunca o da produção |

**Secrets**

| Nome | Conteúdo |
|---|---|
| `DEPLOY_SSH_PRIVATE_KEY` | chave privada só da pipeline (a pública vai em `additional_ssh_public_keys`) |
| `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 <IP>` (o `use-vm.sh` da seção 4 grava) |
| `POSTGRES_PASSWORD` | senha longa aleatória (só letras e números) |
| `PLATFORM_OPERATOR_PASSWORD` | senha inicial do dono |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | token S3 do R2 com acesso **só** ao bucket do ambiente |
| `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY` | token S3 do R2 só do bucket de backups. Vazios: usa a chave dos vídeos (só se ela também escreve no bucket de backups) |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | opcionais (Grafana Cloud) |

Com `VIDEO_STORAGE_PROVIDER=R2` e alguma configuração do R2 faltando, o deploy avisa e usa `File`. Assim a API nunca sobe quebrada.

Criar ambientes e segredos exige permissão de **admin** no repositório. Quem só tem permissão de push recebe 403.

O workflow `deploy-dev.yml` também precisa da variável `DEPLOY_PLATFORM=linux/arm64` no ambiente `dev`, porque a VM de dev é ARM.

## 3. Subir

- dev: `git push origin dev`. Também dá para rodar *Actions → Deploy dev → Run workflow*.
- produção: *Actions → Deploy production → Run workflow* na `main`.

### Sem o GitHub (da sua máquina)

O mesmo script roda no Git Bash, com Docker Desktop. As variáveis são as mesmas da tabela acima, exportadas num arquivo **fora do repositório**:

```bash
source ~/.sipat-online/dev.env      # export DEPLOY_HOST=..., POSTGRES_PASSWORD=..., etc.
bash deploy/scripts/deploy-vm.sh
```

`DEPLOY_SSH_KEY_FILE` e `DEPLOY_KNOWN_HOSTS_FILE` apontam para a chave da pipeline e para o resultado de `ssh-keyscan -t ed25519 <IP>`.

**Nunca troque a `POSTGRES_PASSWORD` de um ambiente que já subiu.** O banco guarda a senha do primeiro deploy, e com outra senha a API não conecta.

## 4. Trocar de VM

Os vídeos ficam no R2 e o banco tem backup diário no R2 (`R2_BACKUP_BUCKET`). A VM só guarda o que dá para refazer. Trocar de VM (o crédito da Azure acabou, outro provedor, máquina maior) é:

1. **Backup agora, na VM antiga** (se ela ainda liga), para não perder o que entrou depois das 03:00:
   ```bash
   ssh <usuário>@<IP antigo> sudo systemctl start sipat-backup.service
   ```
   Daqui até o fim, ninguém usa o sistema antigo: o que entrar nele não vai para a VM nova.
2. **VM nova**: Ubuntu 24.04 (ou Debian), portas 22, 80 e 443 abertas, a chave pública da pipeline em `~/.ssh/authorized_keys` do usuário e `sudo` sem senha (o padrão das imagens de nuvem). Na Azure, é o Terraform da seção 1. Se a arquitetura mudar, ajuste `DEPLOY_PLATFORM` (`linux/amd64` ou `linux/arm64`).
3. **Apontar o ambiente para ela** (Git Bash, na sua máquina):
   ```bash
   deploy/scripts/use-vm.sh dev <IP novo>            # ou: use-vm.sh dev <IP novo> ubuntu
   ```
   Ele grava `DEPLOY_HOST` (e `DEPLOY_USER`, se informado) e o `DEPLOY_SSH_KNOWN_HOSTS` da VM nova. No dev, os endereços vêm do IP e mudam sozinhos (`ops.<ip-novo>.sslip.io`). Com domínio próprio, aponte `ops` e `*` para o IP novo no DNS.
4. **Subir restaurando**: *Actions → Deploy dev* (ou *Deploy production*) *→ Run workflow*, com `restore_backup` = `latest`. O deploy prepara a VM, carrega o último backup no banco vazio, aplica as migrações mais novas, sobe tudo e emite o HTTPS. Se o banco da VM nova já tiver dados, ele para sem mexer em nada.
5. Confira o login e um vídeo. Só então apague a VM antiga.

Os segredos do ambiente continuam os mesmos. O usuário do banco é criado com a `POSTGRES_PASSWORD` do ambiente, e as sessões abertas continuam valendo, porque as chaves de login ficam no banco.

**Com `VIDEO_STORAGE_PROVIDER=File`** os vídeos estão no disco da VM antiga e não vão juntos: copie o volume `platform-videos` antes ou passe para o R2.

## HTTPS por HTTP-01 (dev e produção sem coringa)

`deploy/scripts/issue-certificates.sh` pede ao Let's Encrypt um certificado com o `PLATFORM_HOST` e o host de cada empresa ativa. O timer `sipat-certificates.timer` roda o script a cada 10 minutos. Por isso, uma empresa criada na operação ganha HTTPS em até 10 minutos. O script só chama o Let's Encrypt quando a lista muda. A renovação é do `certbot renew` (timer `sipat-certbot-renew.timer`, instalado pelo deploy).

## Custos (dev na conta gratuita da Azure)

- VM B1s (ou B2ats v2), disco P6 de 64 GB e IP público entram na camada grátis de 12 meses. Sem zona de DNS, não há custo de DNS.
- Na conta gratuita nada é cobrado no cartão enquanto ninguém clicar em **Upgrade**. Quando o crédito de US$ 200 (30 dias) acaba, a Azure **desliga** os recursos.
- Antes disso, troque de VM (seção 4): com `R2_BACKUP_BUCKET`, o banco já está no R2.
- Para apagar tudo: `terraform workspace select dev` e depois `terraform destroy -var-file=environments/dev.tfvars`.
