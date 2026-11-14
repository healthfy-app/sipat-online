# Implantação em uma VM com Docker e DNS na Cloudflare

Esta é a topologia pensada para começar: **uma VM com Docker** executa Nginx, API e PostgreSQL (o `compose.production.yaml`), e a **Cloudflare cuida só do DNS** (registros sem proxy). O Terraform desta pasta é para Azure e **não** é usado aqui.

O sistema sobe **vazio**: só existe o dono da plataforma. Nenhuma empresa, assunto, vídeo ou categoria é criado; o dono cadastra tudo pelo portal de operação.

## O que você precisa
- Uma VM Linux (Ubuntu 24.04) com Docker e Docker Compose, IP público fixo e as portas 80 e 443 abertas (SSH restrito ao seu IP).
- Um domínio na Cloudflare (aqui chamado `exemplo.com.br`).
- Um token de API da Cloudflare com permissão **Zone · DNS · Edit** só nessa zona (para o certificado wildcard).
- Espaço em disco para os vídeos (o volume `platform-videos`) e para os backups.

## 1. DNS na Cloudflare
Crie estes registros, todos **DNS only** (nuvem cinza, sem proxy):

| Tipo | Nome | Conteúdo |
|------|------|----------|
| A | `ops` | IP da VM |
| A | `*` | IP da VM (cada empresa será `<chave>.exemplo.com.br`) |
| A | `@` | IP da VM (opcional) |

> **Por que sem proxy.** O proxy da Cloudflare limita o tamanho do corpo de uma requisição (alguns planos, ~100 MB), o que bloquearia o envio de vídeos de até 250 MB, e os termos dos planos comuns restringem servir vídeo pelo proxy. Sem proxy a VM recebe o tráfego direto. Se depois quiser a proteção da Cloudflare, o caminho é mover os vídeos para o armazenamento deles (R2).

## 2. Certificado wildcard
O Nginx usa um certificado Let's Encrypt único, nome `sipat-online`, para `exemplo.com.br` e `*.exemplo.com.br`. Com o plugin da Cloudflare:

```bash
sudo apt-get install -y certbot python3-certbot-dns-cloudflare
sudo install -m 600 /dev/null /etc/letsencrypt/cloudflare.ini
sudoedit /etc/letsencrypt/cloudflare.ini        # uma linha: dns_cloudflare_api_token = <TOKEN>
sudo certbot certonly --non-interactive --agree-tos \
  --email voce@exemplo.com.br \
  --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --cert-name sipat-online \
  -d exemplo.com.br -d '*.exemplo.com.br'
```

A renovação automática é do próprio pacote (timer do systemd). Depois de renovar, recarregue o Nginx:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec web nginx -s reload
```

## 3. Configuração (segredos)
```bash
cd /opt/sipat-online/app
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
nano deploy/.env.production
```

Preencha:
- `POSTGRES_PASSWORD`: senha aleatória longa.
- `TENANT_BASE_DOMAIN=exemplo.com.br` e `PLATFORM_HOST=ops.exemplo.com.br`.
- `PLATFORM_OPERATOR_LOGIN_IDENTIFIER`, `PLATFORM_OPERATOR_DISPLAY_NAME` e `PLATFORM_OPERATOR_PASSWORD`: o dono da plataforma (por exemplo, `rafael.palma`) e uma senha inicial forte.
- Deixe `TENANT_ID`, `TENANT_KEY`, `TENANT_NAME` e os `BOOTSTRAP_ADMIN_*` **vazios**: sem primeira empresa.

**Onde ficam as senhas.** Este arquivo vive só na VM (permissão 600, fora do Git). A senha do dono só é lida na **primeira subida**, quando a conta é criada; depois dela, apague a linha `PLATFORM_OPERATOR_PASSWORD` do arquivo. O segredo do token da Cloudflare fica em `/etc/letsencrypt/cloudflare.ini` (600). Os “secrets” da Cloudflare (Workers) servem para aplicações que rodam nela; como a nossa roda na VM, não são lidos por ela. Se o deploy for automatizado por GitHub Actions, os segredos de deploy ficam nos *Secrets* do repositório.

## 4. Subir
```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up -d postgres
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml --profile tools run --rm db-init
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up --build -d api web
curl -f https://ops.exemplo.com.br/health
```

Abra `https://ops.exemplo.com.br`, entre com o dono e cadastre a primeira empresa. Os participantes e administradores da empresa entram em `https://<chave>.exemplo.com.br`.

## 5. Vídeos e backups
- Os vídeos ficam no volume Docker `platform-videos` (na API: `/var/sipat/videos`); o limite é de **250 MB por vídeo**. O Nginx já libera esse tamanho só na rota de envio de vídeos.
- O backup do banco gravado na própria VM **não substitui** uma cópia externa. Inclua o volume `platform-videos` na cópia externa (por exemplo, `rclone` ou *snapshot* do disco) e **teste a restauração** antes do go-live.
- Banda: considere o tamanho médio dos vídeos e o horário de pico (o número de pessoas assistindo ao mesmo tempo) ao escolher o plano de rede da VM.

## 6. Atualizar
```bash
git pull   # na VM, com o método autenticado de sua escolha
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml --profile tools run --rm db-init   # se houver migração
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up --build -d api web
```

## Limites desta topologia
Uma VM, sem alta disponibilidade, banco não gerenciado e sem CDN para vídeo. Para o MVP e um cliente de 600+ pessoas é um começo razoável, desde que haja cópia externa testada e um plano para o dia do pico.
