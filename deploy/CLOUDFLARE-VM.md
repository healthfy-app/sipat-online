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

### Vídeos no Cloudflare R2 (recomendado para o pico)
Com o R2, o participante assiste por links assinados e temporários direto da Cloudflare, e a banda da VM deixa de ser o gargalo.

1. No painel da Cloudflare, em **R2**, crie um bucket **privado** para os vídeos (por exemplo, `sipat-videos`).
2. Crie uma chave de API do R2 (token S3) com permissão de leitura e escrita **somente nesse bucket**. Anote o endereço da conta (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`), o *Access Key ID* e o *Secret Access Key*.
3. No `deploy/.env.production`, descomente e preencha `R2_SERVICE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_VIDEO_BUCKET`. **Ainda não** ative `VIDEO_STORAGE_PROVIDER=R2`: primeiro copie os vídeos (passo 4), depois troque (passo 5). Assim ninguém tenta assistir a um vídeo que ainda não está no bucket.
4. **Copie primeiro.** Copie os vídeos que já estão no volume da VM para o bucket (as variáveis do R2 já estão no arquivo; o `-e` só diz ao comando que o destino é o R2):
   ```bash
   docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml run --rm -e SipatOnline__VideoStorage__Provider=R2 api --copy-videos-to-r2
   ```
   O comando imprime uma linha por vídeo (`copiado  <título>  <Mbps> Mbps`) e um resumo no fim. Ele pode ser repetido sem problema: copia de novo por cima. Vídeos acima de 3 Mbps saem marcados como `PESADO`. Um vídeo sem arquivo no volume aparece como `sem arquivo na origem`; um envio que falha (chave ou bucket errados, rede) aparece como `falha ao copiar: <motivo>`. Nos dois casos o comando continua com os demais vídeos e termina com erro.
5. **Depois troque.** Defina `VIDEO_STORAGE_PROVIDER=R2` no `deploy/.env.production` e reinicie a API (`docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up -d api`).
6. Para cada vídeo marcado como `PESADO`, **converta no próprio lugar, no volume `platform-videos`**, e rode a cópia de novo. Enviar um vídeo novo pelo painel cria um vídeo com **outro id** e **não** altera os Dias que já foram entregues (eles continuam apontando para o vídeo antigo); por isso a troca é feita no arquivo. O arquivo de cada vídeo se chama `<id sem hífens>.video` (ver `FilePlatformCourseVideoStorage`). Descubra o id e o caminho:
   ```bash
   docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
   select "Id", "Title", "SizeBytes" from learning."PlatformCourseVideos" order by "Title";
   SQL
   DIR=$(docker volume inspect sipat-online-production_platform-videos --format '{{ .Mountpoint }}')
   ID=<Id do vídeo pesado, sem os hífens>
   ```
   Converta para um arquivo temporário na mesma pasta, guarde o original e mova o convertido por cima (a API continua servindo o arquivo antigo até o `mv`):
   ```bash
   sudo deploy/scripts/convert-video.sh "$DIR/$ID.video" "$DIR/$ID.tmp.mp4"
   sudo cp -p "$DIR/$ID.video" "/var/backups/$ID.original.video"   # opcional: guarda o original fora do volume
   sudo chown --reference="$DIR/$ID.video" "$DIR/$ID.tmp.mp4"
   sudo mv "$DIR/$ID.tmp.mp4" "$DIR/$ID.video"
   ```
   Em seguida rode a cópia (passo 4) outra vez. Ela envia o **tamanho real do arquivo** e, ao copiar com sucesso, corrige o `SizeBytes` cadastrado; o Mbps da linha já sai calculado com o tamanho novo.
7. **Todo vídeo novo deve passar por `convert-video.sh` antes do envio.** O script gera H.264, no máximo 720p, cerca de 2 Mbps, áudio AAC de 128 kbps e `faststart`, que é o que mantém o vídeo leve para quem assiste no celular e na rede da fábrica. Requer o `ffmpeg` instalado (`sudo apt install ffmpeg`).

**Antes do go-live:** confirme nos termos de uso da Cloudflare que servir vídeo pelo R2 é permitido no seu plano. **Plano B:** se houver qualquer problema, defina `VIDEO_STORAGE_PROVIDER=File` (ou apague a variável) e reinicie a API; ela volta a servir os vídeos do volume `platform-videos`, que por isso deve continuar existindo e com cópia externa. **Atenção:** vídeos enviados enquanto o R2 estava ativo existem **somente no R2** e não estão no volume. Antes de voltar para `File`, reenvie esses vídeos pelo painel ou copie-os de volta do bucket para o volume; do contrário eles ficam sem arquivo.

### Backup diário do banco no R2
O banco roda na própria VM; sem cópia externa, perder o disco é perder tudo. Todo dia às 03:00 um *timer* grava um `pg_dump` no R2 e apaga as cópias com mais de 30 dias.

1. Instale o rclone: `sudo apt install rclone` (ou `curl https://rclone.org/install.sh | sudo bash`).
2. No painel da Cloudflare, em **R2**, crie um bucket **privado** só para backups (por exemplo, `sipat-backups`, separado do bucket de vídeos). Crie uma chave de API do R2 com leitura e escrita **somente nesse bucket**.
3. Configure o remote chamado `r2` (rode como o usuário que executará o backup, normalmente `root`): `rclone config`, `n`, nome `r2`, tipo `s3`, provedor `Cloudflare`, informe *Access Key ID* e *Secret Access Key*, e em *endpoint* `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Teste com `rclone lsd r2:`.
4. No `deploy/.env.production`, acrescente `R2_BACKUP_BUCKET=sipat-backups`.
5. Rode uma vez à mão e confira o arquivo: `deploy/scripts/backup-postgres.sh` e `rclone ls r2:sipat-backups/postgres`.
6. Instale e ative o timer (ajuste `WorkingDirectory` e `ExecStart` em `sipat-backup.service` se o repositório não estiver em `/opt/sipat-online`):
   ```bash
   sudo cp deploy/systemd/sipat-backup.service deploy/systemd/sipat-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now sipat-backup.timer
   systemctl list-timers sipat-backup.timer   # próxima execução
   ```
   Depois de instalar, **rode o serviço uma vez agora** e confira que ele funciona sob o systemd (que não tem o ambiente do seu terminal; a unidade já define `HOME` e `RCLONE_CONFIG` para `/root`): `sudo systemctl start sipat-backup.service` e `journalctl -u sipat-backup.service -e`. Se o rclone estiver configurado para outro usuário, ajuste `RCLONE_CONFIG` na unidade.
7. **Ensaie a restauração antes de 25/11.** Restaurar não toca no banco em uso: cria o banco novo `sipat_online_restore_test` (apagando-o antes, se existir) e imprime as contagens de `Tenants`, `LearningProgress` e `PlatformCourseVideos` para você comparar com a produção:
   ```bash
   deploy/scripts/restore-postgres.sh r2:sipat-backups/postgres/<arquivo>.dump
   # as mesmas três contagens no banco de PRODUÇÃO, para comparar:
   docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F " = "' <<'SQL'
   SELECT 'Tenants', count(*) FROM tenancy."Tenants"
   UNION ALL SELECT 'learning.LearningProgress', count(*) FROM learning."LearningProgress"
   UNION ALL SELECT 'PlatformCourseVideos', count(*) FROM learning."PlatformCourseVideos";
   SQL
   docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" sipat_online_restore_test'   # ao terminar
   ```
   Os vídeos que ainda estiverem no volume `platform-videos` (plano B) não entram neste backup; os que estão no R2 já ficam fora da VM.

## 6. Atualizar
```bash
git pull   # na VM, com o método autenticado de sua escolha
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml --profile tools run --rm db-init   # OBRIGATÓRIO nesta versão (veja abaixo)
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up --build -d api web
```

**Nesta versão o `db-init` é obrigatório, antes de subir a API nova.** Ele cria as tabelas `PlaybackGrants` (sessões de reprodução) e `PlaybackQualitySessions` (medição de qualidade do vídeo). Sem elas, toda reprodução de vídeo falha. Rode o `db-init` primeiro e só depois o `up --build -d api web`.

## Limites desta topologia
Uma VM, sem alta disponibilidade, banco não gerenciado e sem CDN para vídeo. Para o MVP e um cliente de 600+ pessoas é um começo razoável, desde que haja cópia externa testada e um plano para o dia do pico.
