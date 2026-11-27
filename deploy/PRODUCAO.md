# Produção: roteiro de deploy (VM + Cloudflare R2)

Este é **o** roteiro para subir e manter a produção. Ele junta, na ordem certa, o que está espalhado em [CLOUDFLARE-VM.md](CLOUDFLARE-VM.md) (detalhes de cada passo) e [PIPELINE-VM.md](PIPELINE-VM.md) (o script de deploy). Quando um passo tem detalhe lá, o link está no próprio passo.

## Como fica a produção

| Peça | Onde roda | Observação |
|---|---|---|
| Nginx, API (.NET) e PostgreSQL | **uma VM** com Docker (`deploy/compose.production.yaml`) | a API também converte os vídeos (ffmpeg), um por vez, em prioridade baixa |
| DNS | Cloudflare, **conta de produção**, registros **sem proxy** (nuvem cinza) | |
| Vídeos | Cloudflare R2, bucket **privado** `sipat-videos` | o participante assiste por link assinado de 2 h direto do R2, então a banda da VM não é o gargalo |
| Backup do banco | Cloudflare R2, bucket **privado** `sipat-backups` | todo dia às 03:00, 30 dias de histórico |
| HTTPS | Let's Encrypt na VM | um certificado com o host da operação e o de cada empresa, atualizado sozinho |

Custo do R2 numa SIPAT de 600 pessoas: cerca de US$ 0,60/mês (só o armazenamento acima de 10 GB). A saída de dados é grátis, e as leituras ficam dentro da camada gratuita.

## Regras

1. **Produção fica numa conta da Cloudflare separada da de dev.** Nada da produção na conta de dev, nem bucket nem chave.
2. **Só a `main` vai para a produção**, e só um commit que já rodou no dev. Nunca uma branch de trabalho.
3. **Toda subida passa pelo `deploy/scripts/deploy-vm.sh`.** Ele monta as imagens fora da VM, aplica as migrações (`db-init`) **antes** de subir a API nova e termina conferindo `/health`. Não rode `docker compose up --build` na mão na VM.
4. **Os segredos ficam fora do repositório:** em `~/.sipat-online/prod.env` na sua máquina, ou no ambiente `production` do GitHub. Na VM eles só aparecem em `deploy/.env.production`, com permissão 600, e esse arquivo é reescrito a cada deploy.
5. **Suba fora do horário de uso.** Durante a semana de SIPAT de um cliente, só suba correção urgente.

---

## 1. Preparar (uma vez)

### 1.1 VM
- Ubuntu 24.04 e IP público fixo. **Recomendação:** 2 vCPU, 4 GB de RAM mais 4 GB de swap, 40 GB de disco (banco, fila de conversão e imagens). A conversão de vídeo é o que mais pesa em CPU. Com o R2, a banda da VM quase não importa.
- Portas 80 e 443 abertas para todos. SSH só por chave e só do seu IP.
- Anote a arquitetura (`uname -m`): `x86_64` é `DEPLOY_PLATFORM=linux/amd64` (o padrão) e `aarch64` é `linux/arm64`.
- **Se a VM não foi criada pelo Terraform deste repositório**, faça à mão o que o `deploy/terraform/cloud-init.yaml.tftpl` faria:
  - instalar Docker e Docker Compose e pôr o usuário do deploy no grupo `docker`;
  - `sudo install -d -o <usuario> -g <usuario> -m 0750 /opt/sipat-online /opt/sipat-online/app`;
  - `sudo install -d -m 0755 /var/www/certbot`;
  - certbot em `/opt/certbot`: `python3 -m venv /opt/certbot && /opt/certbot/bin/pip install certbot` (é o caminho que `issue-certificates.sh` usa);
  - o timer de renovação, que roda `certbot renew` com um *deploy hook* que recarrega o Nginx (copie `sipat-online-certbot-renew.service`/`.timer` e `deploy/terraform/reload-nginx.sh` do cloud-init);
  - o swap.
- O usuário do deploy precisa de `sudo` sem senha para `install`, `sed` e `systemctl`: o script instala o timer dos certificados.

### 1.2 DNS (Cloudflare, conta de produção)
Na zona do domínio (aqui `exemplo.com.br`), crie estes registros, todos **DNS only**:

| Tipo | Nome | Conteúdo |
|---|---|---|
| A | `ops` | IP da VM (portal da operação) |
| A | `*` | IP da VM (cada empresa é `<chave>.exemplo.com.br`) |

Por que sem proxy: o proxy limita o tamanho do envio e os termos dos planos comuns restringem servir vídeo por ele ([CLOUDFLARE-VM.md](CLOUDFLARE-VM.md), seção 1).

### 1.3 R2 (Cloudflare, conta de produção)
1. Crie dois buckets **privados**: `sipat-videos` e `sipat-backups`.
2. Em *Settings* de cada bucket: **"Public Development URL" (`r2.dev`) desligado** e **nenhum *Custom Domain***. Os dois abririam os vídeos e backups para qualquer um, sem login.
3. Crie **um token S3 por bucket**, com leitura e escrita **só naquele bucket**. Guarde o *Access Key ID* e o *Secret Access Key* de cada um. Anote também o endereço da conta: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. **CORS do bucket de vídeos**, para o envio direto do navegador ao R2, com retomada se a conexão cair. Edite `deploy/cloudflare/r2-cors.json` trocando a origem por `https://ops.<seu domínio>` (só a operação envia vídeos) e aplique:
   ```powershell
   Set-Location deploy\cloudflare
   npx wrangler login            # entre com a conta de PRODUÇÃO
   npx wrangler whoami           # confira que é a conta certa antes de seguir
   npx wrangler r2 bucket cors set sipat-videos --file r2-cors.json
   npx wrangler r2 bucket cors list sipat-videos
   ```
5. **Limpeza de envios abandonados:** `npx wrangler r2 bucket lifecycle set sipat-videos --file r2-lifecycle.json`. Ela só vale para `uploads/` (os originais que esperam conversão) e nunca toca em `videos/`.

### 1.4 Arquivo de configuração na sua máquina
Crie `~/.sipat-online/prod.env` (fora do repositório; o significado de cada valor está em [PIPELINE-VM.md](PIPELINE-VM.md), seção 2):

```bash
export DEPLOY_ENVIRONMENT=production
export DEPLOY_HOST=<IP da VM>
export DEPLOY_USER=<usuario>
export DEPLOY_APP_PATH=/opt/sipat-online/app
export DEPLOY_SSH_KEY_FILE=~/.sipat-online/prod-deploy-key
export DEPLOY_KNOWN_HOSTS_FILE=~/.sipat-online/prod-known-hosts   # ssh-keyscan -t ed25519 <IP> > esse arquivo
export DEPLOY_PLATFORM=linux/amd64                                 # ou linux/arm64
export TENANT_BASE_DOMAIN=exemplo.com.br
export PLATFORM_HOST=ops.exemplo.com.br
export CERTIFICATE_MODE=http01
export ACME_EMAIL=<seu e-mail>
export PLATFORM_OPERATOR_LOGIN_IDENTIFIER=<login do dono>
export PLATFORM_OPERATOR_DISPLAY_NAME="<nome do dono>"
export PLATFORM_OPERATOR_PASSWORD=<senha inicial forte>            # apague depois do primeiro deploy
export POSTGRES_PASSWORD=<senha longa, só letras e números>         # NUNCA troque depois do primeiro deploy
export VIDEO_STORAGE_PROVIDER=R2
export R2_SERVICE_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
export R2_VIDEO_BUCKET=sipat-videos
export R2_ACCESS_KEY_ID=<token do bucket de vídeos>
export R2_SECRET_ACCESS_KEY=<token do bucket de vídeos>
export R2_DIRECT_UPLOAD=true
export R2_BACKUP_BUCKET=sipat-backups
```

Com `DEPLOY_ENVIRONMENT=production`, o script **para** se faltar alguma variável do R2. No dev ele cairia para o disco da VM, mas na produção isso deixaria os vídeos novos fora do R2 sem ninguém perceber.

---

## 2. Primeira subida

1. Confira o código:
   ```powershell
   git switch main
   git pull
   git status                              # nada pendente
   git log --oneline -5                    # é o commit que rodou no dev?
   dotnet format whitespace SipatOnline.slnx --verify-no-changes
   ```
   O CI da `main` no GitHub precisa estar verde.
2. Suba, no Git Bash, com o Docker Desktop ligado (cerca de 10 min):
   ```bash
   source ~/.sipat-online/prod.env && bash deploy/scripts/deploy-vm.sh
   ```
   Na saída, confira a linha `... settings; video storage: R2; images: <commit>` e o `/health` respondendo no fim.
3. Marque a versão, para saber sempre o que está no ar:
   ```powershell
   git tag prod-2026-11-27
   git push origin prod-2026-11-27
   ```
4. Apague `PLATFORM_OPERATOR_PASSWORD` do `prod.env`. A senha só é lida enquanto a conta do dono não existe, e o próximo deploy já a tira do arquivo da VM.
5. **Backup:** configure o rclone na VM e o timer de backup, rode uma vez e **ensaie a restauração** ([CLOUDFLARE-VM.md](CLOUDFLARE-VM.md), "Backup diário do banco no R2"). Sem o ensaio, não há backup: há um arquivo que talvez funcione.

## 3. Teste de fumaça (depois de toda subida)

- [ ] `https://ops.<domínio>` abre com cadeado e o dono entra.
- [ ] Na primeira subida: cadastre a primeira empresa e, em até 10 min, `https://<chave>.<domínio>` abre com cadeado.
- [ ] Envie um vídeo pela biblioteca. Ele passa de "Processando" para pronto e aparece no bucket em `videos/<id>/720p.mp4` e `480p.mp4`.
- [ ] Um participante de teste assiste **no celular, pelo 4G**: o vídeo toca, avança e volta. No DevTools, o link do vídeo é `https://<ACCOUNT_ID>.r2.cloudflarestorage.com/...` e **nunca** `r2.dev`.
- [ ] O certificado de conclusão sai em PDF.
- [ ] `docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml logs --tail 100 api` não mostra erro.

## 4. Antes da SIPAT de cada cliente

- **Rede da fábrica:** peça à TI do cliente para liberar `*.<domínio>` e `*.r2.cloudflarestorage.com`. Sem o segundo, o site abre dentro da empresa, mas o vídeo não toca.
- **Vídeos prontos:** nenhum vídeo da programação em "Processando" ou "Falhou". Um vídeo "Processando" não entra num Dia.
- **Teste na rede do cliente:** se possível, peça a alguém de lá para abrir um vídeo no celular, no Wi-Fi da fábrica.
- **Sem deploy na semana**, salvo correção urgente, e sempre fora do horário dos turnos.

## 5. Atualizar

É o mesmo passo da primeira subida (2.1 a 2.3), sempre a partir da `main` e fora do horário de uso. O `db-init` roda sozinho antes da API nova. O que muda entre uma versão e outra (comandos de migração de dados, como `--convert-catalog-videos`) vem descrito no PR. Leia antes de subir.

### Imagens assinadas (Sigstore)
Todo deploy pelo GitHub Actions **assina** o pacote com as imagens da API e do site antes de mandar para a VM, com a identidade do próprio workflow (token OIDC do GitHub, sem chave privada guardada em lugar nenhum). A assinatura fica registrada no log público de transparência da Sigstore (Rekor). Na VM, o deploy **confere a assinatura antes de carregar as imagens**: o pacote tem de ser exatamente o que o workflow `deploy-vm.yml` deste repositório assinou, a partir da branch do ambiente (`main` na produção). Se não conferir, o deploy para e a VM continua com a versão anterior.

- **Produção só aceita imagens assinadas.** Subir da sua máquina com `deploy-vm.sh` para a produção é recusado. Numa emergência (GitHub fora do ar), `ALLOW_UNSIGNED_IMAGES=true` libera uma subida sem assinatura.
- Cada deploy também grava uma **atestação de proveniência (SLSA)**: de qual commit e de qual workflow saiu o pacote. Ela aparece em *Attestations* no GitHub e pode ser conferida com `gh attestation verify --repo healthfy-app/sipat-online <arquivo>`.
- O `cosign` da VM é instalado pelo `prepare-vm.sh` a partir do release oficial, com o checksum fixado no script. As actions do GitHub que assinam estão fixadas por commit.

### Aspire Dashboard (traces, logs e métricas da API)
Com a variável `ASPIRE_DASHBOARD=true` no ambiente `production` do GitHub (ou no `prod.env`), o deploy sobe o container `aspire-dashboard` na VM e a API manda para ele a telemetria (OTLP). Ele mostra cada requisição com a rota, o tempo, o SQL e as chamadas ao R2, os logs estruturados e as métricas.

- **Página pública com token.** Com o segredo `ASPIRE_BROWSER_TOKEN` (no ambiente do GitHub ou no `prod.env`), a página fica em `https://aspire.<domínio>` e pede esse token no primeiro acesso de cada navegador. O certificado inclui o host sozinho. Sem o segredo, a página só existe pelo túnel. Para trocar o token (vazou, saiu alguém), troque o segredo e rode o deploy de novo.
- **Pelo túnel SSH**, sem passar pela internet: a página também escuta em `127.0.0.1:18888` da VM.
  ```powershell
  ssh -i $HOME\.sipat-online\prod_deploy -N -L 18888:127.0.0.1:18888 sipat@<IP da VM>
  ```
  Com o túnel aberto, acesse `http://localhost:18888` (pede o mesmo token). Feche o terminal para encerrar.
- `aspire` é uma chave reservada: nenhuma empresa pode usá-la.
- **Guarda tudo em memória.** Reiniciar o container ou a VM apaga o histórico. Para guardar dias de histórico, use o Grafana Cloud ([CLOUDFLARE-VM.md](CLOUDFLARE-VM.md), seção 7); os dois não funcionam juntos, e o `ASPIRE_DASHBOARD=true` tem prioridade.
- Para desligar, apague a variável e rode o deploy de novo: o container é removido.

## 6. Quando algo dá errado

- **A versão nova quebrou e a versão não teve migração de banco:** volte para a tag anterior e rode o script de novo (`git switch --detach prod-<data anterior>` e o passo 2.2). Volte para a `main` depois.
- **A versão teve migração:** **não** volte o código. A versão antiga não conhece as tabelas novas. Corrija para frente (um commit com a correção, pelo mesmo caminho). Se o banco em si ficou ruim, restaure o backup da noite ([CLOUDFLARE-VM.md](CLOUDFLARE-VM.md), passo 7 do backup) sabendo que se perde o que aconteceu desde as 03:00.
- **O R2 ficou fora do ar:** existe o plano B `VIDEO_STORAGE_PROVIDER=File`, mas os vídeos enviados com o R2 só existem no R2. Leia o aviso em [CLOUDFLARE-VM.md](CLOUDFLARE-VM.md), seção 5, antes de usar.
- **Logs e saúde:** `curl -f https://ops.<domínio>/health` e `docker compose ... logs --tail 200 api web postgres`. Para ver traces e erros do navegador num painel, ligue o Grafana Cloud grátis ([CLOUDFLARE-VM.md](CLOUDFLARE-VM.md), seção 7). É recomendado antes da primeira SIPAT.

## 7. Limites conhecidos e próximo passo

Uma VM é um ponto único de falha: se ela cair, cai tudo até ela voltar, e o banco não é gerenciado. Para o primeiro cliente isso é aceitável **com** o backup ensaiado. O próximo passo é a topologia de Containers ([CLOUDFLARE-CONTAINERS.md](CLOUDFLARE-CONTAINERS.md)), com banco gerenciado e os vídeos servidos por um domínio próprio (`videos.<domínio>`). Ela usa o mesmo banco e o mesmo bucket, então a VM continua como contingência.
