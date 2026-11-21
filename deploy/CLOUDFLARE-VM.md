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
   docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec -e SipatOnline__VideoStorage__Provider=R2 api dotnet SipatOnline.Api.dll --copy-videos-to-r2
   ```
   O comando imprime uma linha por vídeo (`copiado  <título>  <Mbps> Mbps`) e um resumo no fim. Ele pode ser repetido sem problema: copia de novo por cima. Vídeos acima de 3 Mbps saem marcados como `PESADO`. Um vídeo sem arquivo no volume aparece como `sem arquivo na origem`; um envio que falha (chave ou bucket errados, rede) aparece como `falha ao copiar: <motivo>`. Nos dois casos o comando continua com os demais vídeos e termina com erro.
5. **Depois troque.** Defina `VIDEO_STORAGE_PROVIDER=R2` no `deploy/.env.production` e reinicie a API (`docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up -d api`).
6. Para cada vídeo marcado como `PESADO`, **converta a 720p no próprio lugar, no volume `platform-videos`**, fora do horário em que as pessoas assistem, e rode a cópia de novo. A conversão da API (passo 7) **não** refaz a 720p de um vídeo que já está no ar, justamente para não trocar o arquivo debaixo de quem está assistindo; por isso o vídeo pesado continua pesado até esta troca manual. Enviar um vídeo novo pelo painel cria um vídeo com **outro id** e **não** altera os Dias que já foram entregues (eles continuam apontando para o vídeo antigo); por isso a troca é feita no arquivo. O arquivo de cada vídeo se chama `<id sem hífens>.video` (ver `FilePlatformCourseVideoStorage`). Descubra o id e o caminho:
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
7. **Depois, gere a 480p dos vídeos antigos** com `--convert-catalog-videos` (veja **Conversão automática** abaixo). Ele coloca na fila todo vídeo pronto que ainda não tem 480p, e a API em execução cria **somente a 480p**, a partir da 720p atual, **mantendo o mesmo id**. A 720p **não é recodificada**: o arquivo, o tamanho e o tipo continuam exatamente os mesmos, então os Dias já entregues e quem estiver assistindo naquele momento não percebem nada; o vídeo continua no ar durante a conversão. Rode depois do passo 6, para a 480p sair da 720p já leve.
8. **Todo vídeo novo é convertido sozinho no envio** (H.264 720p de cerca de 2 Mbps e 480p de cerca de 1 Mbps, áudio AAC e `faststart`). Não é preciso preparar o arquivo antes.

### Conversão automática
- A imagem da API já traz o `ffmpeg`. Cada envio fica guardado (com `VIDEO_STORAGE_PROVIDER=File`, no volume `video-work`, na API `/var/sipat/video-work`; com `R2`, veja o item seguinte) e aparece na biblioteca como **Processando**; a API converte **um vídeo por vez**, em prioridade baixa (`nice`), para não disputar a CPU com quem está assistindo. Ao terminar, o vídeo fica **Pronto** e o original sai da pasta. Um vídeo **Processando** não pode entrar num Dia.
- **Com `VIDEO_STORAGE_PROVIDER=R2` o original espera no bucket**, em `uploads/<id do vídeo>/source`, e sai de lá quando a conversão termina ou falha. O volume `video-work` passa a ser só rascunho: a API baixa o original para uma pasta temporária (`jobs/<id do trabalho>/`) durante a conversão e apaga a pasta no fim. Se o original sumir do bucket antes da conversão, o vídeo fica como **Falhou** e deve ser enviado de novo. Originais abandonados no bucket (envio que nunca foi convertido) ficam em `uploads/`, que é o prefixo a limpar com a regra de ciclo de vida do R2; nunca `videos/`.
- Se o arquivo estiver corrompido, o vídeo fica como **Falhou**, com o motivo na biblioteca, e a fila segue com os próximos. Envie o arquivo de novo.
- Se a API reiniciar no meio de uma conversão (atualização, queda da VM), o trabalho volta para a fila e roda de novo na partida; nada se perde.
- Vídeos enviados antes desta versão não têm a versão 480p. Para eles a API cria **só a 480p**; a 720p que as pessoas assistem **não é recodificada nem trocada**. Com a API no ar, coloque-os na fila (o comando só enfileira e sai; quem converte é a API em execução):
  ```bash
  docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec api dotnet SipatOnline.Api.dll --convert-catalog-videos
  ```
  Ele imprime `N vídeos na fila de conversão.`. Acompanhe na biblioteca da operação; os vídeos continuam disponíveis enquanto são convertidos. Pode ser repetido: vídeos que já estão na fila ou já têm 480p não entram de novo. **Espaço em disco (somente com `File`):** cada vídeo enfileirado tem a 720p atual copiada antes para o volume `video-work`; confira que há espaço livre de aproximadamente o tamanho de toda a biblioteca antes de rodar o comando. Com `R2` a cópia é feita dentro do bucket (a 720p vira `uploads/<id>/source` sem passar pelo disco), então não é preciso reservar espaço no volume.

**Antes do go-live:** confirme nos termos de uso da Cloudflare que servir vídeo pelo R2 é permitido no seu plano. **Plano B:** se houver qualquer problema, defina `VIDEO_STORAGE_PROVIDER=File` (ou apague a variável) e reinicie a API; ela volta a servir os vídeos do volume `platform-videos`, que por isso deve continuar existindo e com cópia externa. **Atenção:** vídeos enviados enquanto o R2 estava ativo existem **somente no R2** e não estão no volume. Antes de voltar para `File`, reenvie esses vídeos pelo painel ou copie-os de volta do bucket para o volume; do contrário eles ficam sem arquivo.

### Backup diário do banco no R2
O banco roda na própria VM; sem cópia externa, perder o disco é perder tudo. Todo dia às 03:00 um *timer* grava um `pg_dump` no R2 e apaga as cópias com mais de 30 dias.

> **O backup é sensível.** As chaves de login e segurança do sistema (Data Protection) ficam no banco, sem criptografia. Quem tiver uma cópia do banco consegue forjar sessões: guarde o bucket de backups privado e com chave de acesso só dele.

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

**Nesta versão o `db-init` é obrigatório, antes de subir a API nova.** Ele cria as tabelas `PlaybackGrants` (sessões de reprodução), `PlaybackQualitySessions` (medição de qualidade do vídeo) e `VideoConversionJobs` (fila de conversão), além do estado de conversão de cada vídeo. Sem elas, toda reprodução e todo envio de vídeo falham. Depois de subir a API nova, rode `--convert-catalog-videos` (seção 5) para gerar a 480p dos vídeos antigos. Rode o `db-init` primeiro e só depois o `up --build -d api web`.

As chaves de proteção de dados (que assinam os cookies de login) agora ficam no banco, e o `db-init` cria a primeira. O volume `aspnet-data-protection` não é mais usado: depois da atualização ele pode ser removido com `docker volume rm` (o nome leva o prefixo do projeto do compose). Quem estava logado precisa entrar de novo uma única vez.

## Limites desta topologia
Uma VM, sem alta disponibilidade, banco não gerenciado e sem CDN para vídeo. Para o MVP e um cliente de 600+ pessoas é um começo razoável, desde que haja cópia externa testada e um plano para o dia do pico.
