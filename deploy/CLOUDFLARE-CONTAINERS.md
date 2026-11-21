# SIPAT Online em Cloudflare Containers

Runbook do destino "full Cloudflare" (ADR-004, opção B). A VM descrita em [README.md](README.md) e em [CLOUDFLARE-VM.md](CLOUDFLARE-VM.md) continua funcionando e é o plano de contingência. Os arquivos desta topologia estão em `deploy/cloudflare/` e o deploy roda em `.github/workflows/deploy-cloudflare.yml`.

Itens marcados com **verificar** não puderam ser confirmados sem acesso à conta Cloudflare (a validação feita foi offline: tipos, `wrangler deploy --dry-run`). Confirme cada um no primeiro ensaio em `dev` e apague a marca.

## 1. O que é

- **Worker** (`deploy/cloudflare/src/index.ts`): recebe todo o tráfego do domínio. Serve o site estático (o `dist` do Vite) e encaminha `/api/*` e `/health` para a API. Reescreve `X-Forwarded-For` (com o IP real do cliente) e `X-Forwarded-Proto`.
- **Containers**: a mesma imagem do `Dockerfile` roda em dois papéis. `SipatApi` (até 5 instâncias, atende o HTTP, nunca converte vídeo) e `SipatConverter` (uma instância, só converte vídeo).
- **Postgres gerenciado**: fora da Cloudflare (seção 3). Os containers não guardam estado; o disco deles é efêmero.
- **R2**: guarda os vídeos. O navegador do operador envia o original direto ao R2 por um link assinado (seção 9).

Fluxo de um envio: o navegador pede o link (`POST /api/platform/catalog/videos/uploads`), faz `PUT` direto no R2, chama `…/complete`; o Worker acorda o `SipatConverter`, que baixa o original do R2, converte para 720p e 480p e sobe os resultados.

## 2. Pré-requisitos

- Conta Cloudflare no plano **Workers Paid** (Containers exige). **Decisão pendente do dono.**
- Uma **zona** com o domínio (raiz da plataforma e coringa dos clientes). O plano da zona (Free ou Pro) define os limites da seção 7 e do corpo da requisição (seção 10). **Decisão pendente do dono.**
- DNS: registro `*` (proxied/laranja) e o do host da plataforma (`ops…`) apontando para a zona. O coringa em `routes` só funciona com registro coringa proxied. **Verificar:** o valor do registro pode ser qualquer um (por exemplo `A 192.0.2.1`), pois o Worker responde antes da origem.
- Docker no CI (já existe no `ubuntu-latest`) e na máquina de quem fizer deploy manual: o `wrangler deploy` constrói a imagem.
- Node 22 e `npm ci` em `deploy/cloudflare/`.
- Troque em `deploy/cloudflare/wrangler.jsonc` os domínios de exemplo (`exemplo.com.br`, `ops.dev.exemplo.com.br`) e o `R2_SERVICE_URL` (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`) pelos reais. Em `r2-cors.json`, troque a origem pelo host da plataforma.

## 3. Banco

A Hyperdrive só se liga a Workers, não a um processo .NET dentro de um container. Por isso o container recebe uma connection string comum do Npgsql, como segredo do Worker repassado por `envVars`.

**Recomendação (decisão pendente do dono): Neon, endpoint direto (não o `-pooler`).** O pooler em modo transação (PgBouncer) atrapalha os prepared statements do Npgsql.

- Região: **São Paulo (`aws-sa-east-1`) — verificar disponibilidade** no momento da contratação. Sem São Paulo, a latência container↔banco pesa em cada requisição; medir é o item 8 do ADR e o primeiro passo do ensaio.
- Connection string de exemplo (um bloco, sem o segredo): `Host=<endpoint-direto>;Port=5432;Database=sipat_online;Username=<usuario>;Password=<senha>;SSL Mode=VerifyFull;Maximum Pool Size=10`. `Maximum Pool Size=10` por instância: são poucas instâncias, então o total fica longe do limite de conexões do plano.
- **Backups**: configure o backup/point-in-time do provedor e ensaie a restauração. As chaves do Data Protection (cookies de login e antiforgery) ficam **sem criptografia** na tabela `DataProtectionKeys` do banco: quem lê o banco já é dono de todas as contas, e um certificado seria mais um segredo para girar. Consequência: **todo backup do banco é sensível** e deve ter o mesmo cuidado do banco vivo (acesso restrito, criptografado no destino).
- As migrações rodam pelo CI antes do deploy (`--initialize-database`); os containers nunca migram ao subir.

## 4. R2

Dois buckets, nomes fixados em `wrangler.jsonc`: `sipat-videos-dev` e `sipat-videos`.

1. Crie os buckets (painel ou `npx wrangler r2 bucket create <nome>`).
2. Crie um **token de API do R2 por bucket**, com leitura e escrita somente naquele bucket. Guarde `Access Key ID` e `Secret Access Key` (seção 5).
3. CORS (necessário ao envio direto), em `deploy/cloudflare/`:
   `npx wrangler r2 bucket cors set sipat-videos-dev --file r2-cors.json`
   A origem do arquivo é `https://<PLATFORM_HOST>`; ajuste para cada ambiente. O arquivo usa o formato do wrangler (`rules[].allowed.origins/methods/headers`); a conferência foi feita no código do wrangler instalado, mas **verificar** o resultado com `npx wrangler r2 bucket cors list <bucket>`.
4. Ciclo de vida: `npx wrangler r2 bucket lifecycle set sipat-videos-dev --file r2-lifecycle.json` (ou pelo painel). A regra vale **somente para o prefixo `uploads/`**: apaga objetos após 7 dias e aborta multipart incompleto após 1 dia. Nada em `videos/`.

Endereço do S3 do R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, o mesmo em todos os ambientes da conta.

## 5. Segredos

Do Worker (um por ambiente; o `wrangler` pergunta o valor, não o escreva na linha de comando):

```powershell
Set-Location deploy\cloudflare
npx wrangler secret put DATABASE_CONNECTION_STRING --env dev
npx wrangler secret put R2_ACCESS_KEY_ID --env dev
npx wrangler secret put R2_SECRET_ACCESS_KEY --env dev
```

Repita com `--env prod`. O `secret put` exige que o Worker exista; se o primeiro `wrangler deploy` ainda não rodou, use `npx wrangler versions secret put …` ou faça o primeiro deploy e depois os segredos. **Verificar** qual caminho a versão instalada aceita.

No GitHub:

| Onde | Nome | Tipo |
| --- | --- | --- |
| Repositório | `CLOUDFLARE_API_TOKEN` (permissões: Workers Scripts e Containers editar, na conta) | secret |
| Repositório | `CLOUDFLARE_ACCOUNT_ID` | secret |
| Ambiente `dev` e `prod` | `DATABASE_CONNECTION_STRING` (a mesma do segredo do Worker) | secret |
| Ambiente `dev` e `prod` | `TENANT_BASE_DOMAIN`, `PLATFORM_HOST` (iguais ao `vars` do `wrangler.jsonc`) | variables |

Crie os ambientes `dev` e `prod` no GitHub. No `prod`, ative "Required reviewers": o deploy de produção espera uma aprovação.

## 6. Primeiro deploy em `dev`

1. Preencha os domínios em `wrangler.jsonc`, crie bucket, CORS, lifecycle e segredos (seções 2 a 5).
2. **Dono da plataforma: rode a inicialização uma vez, à mão**, para criar o dono e a primeira chave do Data Protection. Só aqui entram as variáveis `PLATFORM_OPERATOR_*`; depois nunca mais:

   ```powershell
   docker build -t sipat-online-api:ci .
   docker run --rm `
     -e ConnectionStrings__SipatOnline="<connection string do dev>" `
     -e SipatOnline__Tenant__BaseDomain=dev.exemplo.com.br `
     -e SipatOnline__Tenant__PlatformHost=ops.dev.exemplo.com.br `
     -e SipatOnline__ForwardedHeaders__KnownNetworks__0=0.0.0.0/0 `
     -e SipatOnline__PlatformOperator__LoginIdentifier=<login> `
     -e SipatOnline__PlatformOperator__DisplayName="<nome>" `
     -e SipatOnline__PlatformOperator__Password=<senha-longa> `
     -e ASPNETCORE_ENVIRONMENT=Production `
     sipat-online-api:ci --initialize-database
   ```

   O Worker não tem `PLATFORM_OPERATOR_*` de propósito: a senha do dono não fica na Cloudflare.
3. Faça push na `main` (ou rode o workflow "Deploy Cloudflare" por `workflow_dispatch`). O job `verify` roda o CI, depois o `deploy` constrói o site, aplica as migrações e roda `wrangler deploy --env dev`.
4. Ensaio: login do dono em `https://<PLATFORM_HOST>`, envio de um vídeo de teste (confira que o `PUT` vai direto ao R2), conversão concluída, reprodução. Reinicie/dispare um segundo deploy e confirme que o login continua valendo.

Produção: crie uma tag `v*`; o ambiente `prod` usa o mesmo caminho. Faça a inicialização manual do `prod` (passo 2) antes da primeira tag.

## 7. Proteção de login na borda

O limite de tentativas **por conta** (10 por minuto por host + login, `SipatOnline:LoginRateLimit:PerLoginPerMinute`) fica no banco (`identity."LoginAttemptWindows"`) e é compartilhado por todas as instâncias. Janelas com mais de 1 hora são apagadas por amostragem (1 em cada 100 tentativas). Cada tentativa de login faz **uma escrita** no banco, então a borda deve barrar inundações por IP antes de a API ver o tráfego.

O limite **por IP** da API (`identity-auth`, 300 por minuto) continua em memória por instância: com N instâncias o teto efetivo é N × 300. A regra de borda é o limite global por IP.

Crie no painel (Segurança → WAF → Regras de limite de taxa) uma regra de Rate Limiting na zona:

- Expressão: `http.request.method eq "POST" and http.request.uri.path in {"/api/identity/login" "/api/platform/identity/login"}`
- Característica de contagem: IP.
- Limite: 50 requisições em 10 segundos. Ação: bloquear por 10 segundos.
- O plano Free só permite o período de 10 s. Uma fábrica com 180 logins em 1 a 2 minutos fica em torno de 15 a 30 por 10 s no mesmo IP (NAT da fábrica), abaixo do limite. **Verificar** os limites de período do plano contratado.

## 8. Conversão de vídeo

- Existe uma instância nomeada `converter` (`SipatConverter`). O Worker a acorda quando um envio termina (`201` de `…/complete`) e a cada hora (cron `0 * * * *`), para pegar jobs que ficaram esperando.
- Enquanto `GET /health/conversion` disser `busy`, o Worker renova o tempo de atividade e o container não dorme (`onActivityExpired` + `renewActivityTimeout`). Sem conversão, ele dorme após 10 minutos. **Verificar** esses dois métodos na versão instalada de `@cloudflare/containers` (0.3.7): o `tsc` aceitou os nomes, mas o comportamento só se confirma em `dev`.
- As instâncias `SipatApi` têm `RunInBackground=false` e não pegam jobs. A fila é segura para várias instâncias mesmo assim (cada job é pego por uma só, com lease).
- **Disco local por container**: precisa caber a cópia temporária de um envio (até 250 MB) mais a pasta do job com o original e as duas saídas (720p e 480p). Reserve folga de alguns GB. **Verificar** o disco da instância `standard-3` e `standard-1` (tamanhos de instância também a confirmar na documentação atual).
- Queda brusca: se o container do conversor cair no meio de uma conversão, o job volta para a fila quando o lease vence, em cerca de `LeaseDuration` + o intervalo de verificação do worker (2 min + 30 s, por volta de **2,5 min**). Em reinício normal (deploy, desligamento gracioso) o job é devolvido na hora e retomado logo ao subir.

## 9. Limite de corpo e envio direto

O corpo de uma requisição pela Cloudflare tem limite de cerca de **100 MB** nos planos Free e Pro (**verificar** o limite do plano contratado). Um vídeo de até 250 MB não passa pelo Worker: por isso o envio vai direto ao R2 com `PUT` pré-assinado (validade de 1 hora). O formulário antigo (multipart pela API) só funciona na VM; no Cloudflare, `DirectUpload=true`.

Ao concluir (`complete`), a API confere o tamanho (1 B a 250 MB), o tipo (`video/mp4` ou `video/webm`) e a assinatura do arquivo. Um objeto grande demais ou inválido é apagado. Envios abandonados saem do bucket pela regra de ciclo de vida do prefixo `uploads/` (7 dias).

## 10. Atualizar e voltar atrás

- Atualizar: push na `main` (dev) ou tag `v*` (prod). O CI migra o banco **antes** de publicar o Worker.
- Voltar o código: `npx wrangler rollback --env prod` (em `deploy/cloudflare/`). **Verificar** se o rollback cobre também a imagem dos containers.
- **Migrações só vão para a frente.** Um rollback do Worker deixa o banco no esquema novo; por isso as migrações desta série são aditivas (tabelas e colunas novas), compatíveis com o código anterior.

## 11. Voltar para a VM

O banco e o R2 são os mesmos. Para voltar: aponte o DNS para a VM e siga o runbook de [README.md](README.md) / [CLOUDFLARE-VM.md](CLOUDFLARE-VM.md). A VM lê as mesmas chaves do banco e o mesmo bucket (`VIDEO_STORAGE_PROVIDER=R2`). `R2_DIRECT_UPLOAD` fica `false` na VM, a menos que o CORS do bucket inclua a origem dela. Aviso: a **primeira subida da VM nesta versão desloga todo mundo uma vez**, porque as chaves do Data Protection passam a viver no banco (o anel antigo, em volume, deixa de valer). Planeje essa subida fora do horário de uso.

## 12. Ambientes e configurações

Todas as chaves abaixo vivem em `SipatOnline:` e viram variável de ambiente trocando `:` por `__`. O **padrão** é o valor do código quando a chave não existe e reproduz o comportamento anterior: a VM e o ambiente local continuam funcionando sem definir nada. "—" significa que o ambiente não define a chave (vale o padrão).

| Chave (variável de ambiente) | Padrão | Local (`compose.yaml`) | VM (`compose.production.yaml`) | Cloudflare dev | Cloudflare prod |
| --- | --- | --- | --- | --- | --- |
| Nome da aplicação do Data Protection: **constante** `SipatOnline` (`DataProtectionSetup.ApplicationName`), não configurável | `SipatOnline` | igual | igual | igual | igual |
| `SipatOnline:LoginRateLimit:PerLoginPerMinute` (`SipatOnline__LoginRateLimit__PerLoginPerMinute`): tentativas por conta e host por minuto, contador no banco | `10` | — | — | — | — |
| `SipatOnline:LoginRateLimit:PerAddressPerMinute` (`SipatOnline__LoginRateLimit__PerAddressPerMinute`): limite por IP, em memória por instância | `300` | — | — | — | — |
| `SipatOnline:VideoConversion:RunInBackground` (`SipatOnline__VideoConversion__RunInBackground`): roda o worker de conversão neste processo | `true` | — (`true`) | — (`true`) | `false` na `SipatApi`, `true` no `SipatConverter` | igual ao dev |
| `SipatOnline:VideoConversion:LeaseDuration` (`SipatOnline__VideoConversion__LeaseDuration`, formato `hh:mm:ss`): quanto tempo um job fica "preso" sem renovação | `00:02:00` | — | — | — | — |
| `SipatOnline:VideoConversion:LeaseRenewInterval` (`SipatOnline__VideoConversion__LeaseRenewInterval`): de quanto em quanto o dono renova; deve ser positivo e menor que `LeaseDuration` | `00:00:30` | — | — | — | — |
| Intervalo de verificação do worker de conversão (`PollInterval`): **constante** de 30 s no código (`VideoConversionWorker.PollInterval`), não configurável | 30 s | igual | igual | igual | igual |
| `SipatOnline:VideoConversion:WorkPath` (`SipatOnline__VideoConversion__WorkPath`): pasta temporária das conversões (obrigatória com `Enabled=true`) | vazio | `/var/sipat/video-work` | `/var/sipat/video-work` (volume) | `/tmp/sipat-video-work` (disco efêmero) | igual ao dev |
| `SipatOnline:VideoStorage:Provider` (`SipatOnline__VideoStorage__Provider`): `File` ou `R2` | `File` | `${VIDEO_STORAGE_PROVIDER:-File}` | `${VIDEO_STORAGE_PROVIDER:-File}` | `R2` | `R2` |
| `SipatOnline:VideoStorage:R2:DirectUpload` (`SipatOnline__VideoStorage__R2__DirectUpload`): envio direto do navegador ao R2 (exige CORS no bucket) | `false` | `${R2_DIRECT_UPLOAD:-false}` | `${R2_DIRECT_UPLOAD:-false}` | `true` | `true` |
| `SipatOnline:VideoStorage:R2:ServiceUrl` (`…__R2__ServiceUrl`) | vazio (obrigatória com `R2`) | `${R2_SERVICE_URL:-}` | `${R2_SERVICE_URL:-}` | var `R2_SERVICE_URL` | var `R2_SERVICE_URL` |
| `SipatOnline:VideoStorage:R2:AccessKeyId` (`…__R2__AccessKeyId`) | vazio (obrigatória com `R2`) | `${R2_ACCESS_KEY_ID:-}` | `${R2_ACCESS_KEY_ID:-}` | segredo `R2_ACCESS_KEY_ID` | segredo `R2_ACCESS_KEY_ID` |
| `SipatOnline:VideoStorage:R2:SecretAccessKey` (`…__R2__SecretAccessKey`) | vazio (obrigatória com `R2`) | `${R2_SECRET_ACCESS_KEY:-}` | `${R2_SECRET_ACCESS_KEY:-}` | segredo `R2_SECRET_ACCESS_KEY` | segredo `R2_SECRET_ACCESS_KEY` |
| `SipatOnline:VideoStorage:R2:Bucket` (`…__R2__Bucket`) | vazio (obrigatória com `R2`) | `${R2_VIDEO_BUCKET:-}` | `${R2_VIDEO_BUCKET:-}` | `sipat-videos-dev` | `sipat-videos` |
| `SipatOnline:ForwardedHeaders:KnownProxies` (`SipatOnline__ForwardedHeaders__KnownProxies__0`): IPs de proxy confiáveis; fora do Development é obrigatório ter proxies ou redes | vazio | — (em Development vale `DevelopmentProxy:Host`, padrão `localhost`; o compose usa `web`) | `172.28.0.2` (o Nginx) | — | — |
| `SipatOnline:ForwardedHeaders:KnownNetworks` (`SipatOnline__ForwardedHeaders__KnownNetworks__0`, `__1`): redes confiáveis, alternativa a `KnownProxies` (decisão 15 do plano; entregue pela Task 7) | vazio | — (Development não lê esta chave) | `${TRUSTED_PROXY_NETWORK:-}` (vazio = só `KnownProxies`) | `0.0.0.0/0` e `::/0` | `0.0.0.0/0` e `::/0` |

Notas de leitura da tabela:

- O deploy automático no Cloudflare fica **desligado** até a conta estar pronta: crie a variável de repositório `CLOUDFLARE_DEPLOY_ENABLED=true` no GitHub para ligá-lo.

- Local e VM não precisam de nenhuma chave nova para continuar como antes. A VM em R2 só passa a usar o envio direto quando alguém aplica o CORS no bucket e põe `R2_DIRECT_UPLOAD=true` em `deploy/.env.production`.
- Os valores do Cloudflare vêm de `deploy/cloudflare/src/index.ts` (função `apiEnv`) e de `vars` em `wrangler.jsonc`. Para mudar um valor no Cloudflare, edite `apiEnv`; para os domínios, edite `vars` e as variáveis do ambiente no GitHub (devem coincidir).
- Chaves que já existiam e continuam iguais (`Tenant:*`, `PlatformOperator:*`, `BootstrapAdmin:*`, `ConnectionStrings:SipatOnline`, `VideoConversion:Enabled`) não entram na tabela. No Cloudflare, `Tenant:Id` é o GUID zero (a plataforma sobe sem empresa) e `ASPNETCORE_ENVIRONMENT=Production`.
- Não há chave para o contador de login nem para o Data Protection além das acima: ambos ficam no banco, criados pelas migrações e pelo `--initialize-database`.

## 13. Pontos de atenção

- **Primeiro dia em produção**: a troca para as chaves no banco desloga todo mundo uma vez (seção 11 para a VM; no Cloudflare já nasce assim).
- **Backups do banco são sensíveis**: contêm as chaves do Data Protection sem criptografia (seção 3).
- Segredos nunca entram em `wrangler.jsonc` nem no repositório; `vars` são visíveis no painel.
- O `_headers` do site repete os cabeçalhos do Nginx (`deploy/nginx/security-headers.conf`) e acrescenta o R2 em `connect-src` da CSP em modo somente relatório (o `PUT` do envio direto). Quando a CSP sair do modo relatório, revise esse domínio.

## 14. Decisões pendentes do dono

1. **Workers Paid**: contratar o plano (pré-requisito dos Containers).
2. **Plano da zona** (Free ou Pro): define o período da regra de Rate Limiting e o limite de corpo.
3. **Banco**: confirmar o Neon (região São Paulo, **verificar disponibilidade**) ou escolher outro Postgres gerenciado.

## 15. Lista de "verificar"

- Disponibilidade do Neon em São Paulo (`aws-sa-east-1`) e a latência medida do container (item 8 do ADR).
- Tamanhos de instância `standard-1` e `standard-3` (CPU, memória, disco) e se o disco comporta a seção 8.
- `onActivityExpired` e `renewActivityTimeout` na versão instalada de `@cloudflare/containers`.
- Preservação do cabeçalho `Host` no `containerFetch`/`fetch` do container (a API resolve a empresa pelo `Host`; o `X-Forwarded-Host` não é usado). Se o `Host` chegar trocado, o login por empresa falha: é o primeiro teste do ensaio em `dev`.
- Ordem entre `wrangler secret put` e o primeiro `wrangler deploy`.
- Rollback cobre a imagem dos containers.
- Limites do plano: corpo de requisição (~100 MB) e período do Rate Limiting.
- Registro DNS coringa para rotas `*.dominio/*`.
- Saída do `npx wrangler deploy --dry-run --env dev` e `--env prod` (feita offline): a configuração é aceita, a imagem é construída e os bindings aparecem; o deploy real não foi feito.
