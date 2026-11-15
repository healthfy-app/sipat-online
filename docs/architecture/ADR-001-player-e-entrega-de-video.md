# ADR-001: Player SIPAT e onde ficam os vídeos em produção

**Status:** Proposto
**Data:** 2026-11-14
**Decisores:** dono do produto (HealthEz)

## Contexto

Hoje o vídeo chega ao participante assim:

```
navegador (SipatPlayer: <video> nativo + Media Chrome)
   └─ GET /api/learning/lessons/{id}/media   (nginx → API .NET, com HTTP Range)
        └─ a API confere empresa, atribuição e revisão atual
             └─ lê o MP4 do volume Docker `platform-videos` (/var/sipat/videos)
```

- O player tem regras próprias: não deixa avançar além do trecho já assistido, mantém a velocidade em 1x, mede a cobertura (conclusão aos 90%) e para o vídeo para mostrar os jogos.
- O arquivo é servido **do jeito que foi enviado**. Não há conversão (não existe ffmpeg no projeto): um MP4 de 250 MB com 5 minutos chega a cerca de 6,7 Mbps no celular do operário.
- Há um só arquivo por vídeo. Não existem versões mais leves para conexões ruins (sem *adaptive bitrate*).
- O DNS fica na Cloudflare **sem proxy**, porque os termos dos planos comuns não permitem servir vídeo pelo proxy deles. Todo o tráfego de vídeo sai da VM.
- O armazenamento já tem uma interface, `IPlatformCourseVideoStorage`, e a aula guarda uma referência opaca (`catalog:{id}`). Dá para trocar onde o arquivo mora sem mexer no domínio.
- O go-live com um cliente de mais de 600 pessoas é agora, em novembro de 2026.

### "Mas o vídeo é único para cada usuário"

Isso é verdade, e o mesmo vale para qualquer serviço de vídeo sob demanda, YouTube incluído: cada pessoa abre a sua própria reprodução, começa do zero e assiste no seu ritmo. "Streaming" aqui quer dizer apenas que o arquivo é entregue em pedaços. Não é uma transmissão ao vivo igual para todos.

O que faz o vídeo ser **do participante** fica todo no seu código: a verificação de acesso, o bloqueio de avanço, a cobertura, os jogos e o certificado. Nada disso depende de onde os bytes estão guardados. Os serviços de mercado também entregam com **URL assinada por usuário e com validade** (token). Então dá para continuar exigindo que só quem tem a atribuição consiga abrir o vídeo.

## Estimativa de carga (uma empresa, uma SIPAT)

Premissas: 600 participantes, 6 dias, 5 vídeos por dia, cerca de 4 minutos por vídeo.

| Grandeza | Valor |
|---|---|
| Minutos assistidos por SIPAT | 600 × 6 × 5 × 4 ≈ **72.000 min** |
| Tráfego a 720p bem comprimido (~2 Mbps, ~15 MB/min) | ≈ **1,1 TB** |
| Tráfego com os arquivos como enviados hoje (~6–7 Mbps) | ≈ **3,5 TB** |
| Pico: 30% assistindo ao mesmo tempo (ex.: DDS no início do turno) | 180 × 2 Mbps ≈ **360 Mbps** saindo da VM (≈ 1,2 Gbps sem compressão) |

O pico é o ponto que mais pesa. Muitas vezes os participantes estão na **mesma fábrica, dividindo o mesmo link de internet**. Com um arquivo único e pesado, todos travam juntos. Com várias qualidades (HLS adaptativo), cada celular baixa a qualidade sozinho e continua tocando.

## Decisão

1. **Manter o SIPAT Player** (Media Chrome sobre o `<video>`). O player não é o problema; o problema é a entrega.
2. **No go-live, manter o volume Docker**, mas com três proteções baratas (itens 1 a 3 do plano abaixo).
3. **Depois da primeira SIPAT real, ou na segunda empresa, mover a entrega para um serviço de vídeo gerenciado** (Mux ou Cloudflare Stream), implementando `IPlatformCourseVideoStorage`. O player continua o mesmo.

## Opções consideradas — player

| | SIPAT Player (Media Chrome) | Video.js / Plyr / Vidstack | JW Player / Bitmovin |
|---|---|---|---|
| Custo | grátis (open source, mantido pela Mux) | grátis | milhares de dólares por ano |
| Bloqueio de avanço, cobertura de 90%, jogos sobre o vídeo | já feito | teria que refazer | teria que refazer |
| HLS adaptativo no futuro | sim (`hls-video-element` / `mux-video`) | sim | sim |
| Ganho real para o SIPAT | — | nenhum | analytics e DRM, que o SIPAT não precisa |

**Conclusão:** um player de mercado não resolveria nada do que importa aqui, e as regras do SIPAT teriam que ser reescritas nele. A escolha de construir sobre o Media Chrome está certa: ele é uma camada fina sobre o `<video>` nativo, que é o player mais compatível e mais leve que existe. O que falta é **o que entra no player** (arquivo leve e várias qualidades), não o player.

## Opções consideradas — onde ficam e de onde saem os vídeos

Preços em dólar, consultados em 14/11/2026. Confira nas páginas oficiais antes de contratar.

### A. Volume Docker na VM, como está hoje

| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa (já funciona) |
| Custo | Só a VM. O tráfego de saída depende do provedor: incluso em alguns (ex.: Hetzner, 20 TB), ~US$ 0,08–0,09/GB em Azure/AWS (≈ US$ 90 por SIPAT a 720p, ≈ US$ 300 com os arquivos atuais) |
| Escala | Limitada ao link e ao disco de **uma** máquina; o pico de 360 Mbps ou mais pode saturá-la |
| Qualidade | Um arquivo só, sem adaptação; trava em 4G fraco ou em Wi-Fi de fábrica compartilhado |

**Prós:** zero custo novo, controle total, nada para integrar antes do go-live.
**Contras:** a API .NET carrega todos os bytes; não há CDN nem adaptação; o backup do volume é responsabilidade sua; a VM vira o ponto único de falha.

### B. Volume Docker com conversão e nginx servindo o arquivo

É a opção A com três ajustes:
- Converter cada vídeo no envio com ffmpeg para H.264 720p (~2 Mbps, `+faststart`). O tráfego cai para cerca de um terço.
- A API só autoriza e responde com `X-Accel-Redirect`, e o nginx manda o arquivo, que é bem mais eficiente que o .NET para isso.
- Opcional: gerar HLS em 2 ou 3 qualidades, também no ffmpeg.

| Dimensão | Avaliação |
|---|---|
| Complexidade | Média (ffmpeg na imagem, fila de conversão, estado "processando") |
| Custo | O mesmo da A, com ~3× menos tráfego |
| Escala | Ainda uma VM, mas aguenta bem mais |
| Qualidade | Boa em 720p; adaptativa só se gerar HLS |

### C. Serviço de vídeo gerenciado (recomendado como próximo passo)

Você envia o arquivo, o serviço converte, gera HLS adaptativo, entrega por CDN com pontos de presença no Brasil e libera por URL assinada.

| Serviço | Como cobra | Custo estimado por SIPAT (72 mil min, ~1,1 TB) | Observação |
|---|---|---|---|
| **Cloudflare Stream** | US$ 5 por 1.000 min armazenados/mês + US$ 1 por 1.000 min entregues; banda inclusa | entrega ≈ **US$ 72**; acervo de ~1.200 min ≈ US$ 10/mês | Preço previsível; o DNS já está na Cloudflare |
| **Mux** | por minuto armazenado, codificado e entregue; os primeiros 100 mil min entregues de cada mês são grátis | entrega ≈ **US$ 0** no volume de uma empresa; armazenamento de poucos dólares por mês | Os mesmos criadores do Media Chrome (`mux-video` encaixa direto); fica caro só em volume bem maior |
| **Bunny Stream** | conversão grátis; armazenamento ~US$ 0,01/GB; CDN América do Sul **US$ 0,045/GB** | ≈ **US$ 50** | Barato na Europa e nos EUA; no Brasil a tarifa sobe |

| Dimensão | Avaliação |
|---|---|
| Complexidade | Média: uma nova implementação de `IPlatformCourseVideoStorage`, o player passa a tocar HLS, um webhook avisa "vídeo pronto" |
| Custo | US$ 0 a 72 por SIPAT de 600 pessoas, sem pico de banda na sua VM |
| Escala | O problema deixa de ser seu; 10 empresas ao mesmo tempo não mudam a VM |
| Qualidade | A melhor das opções: HLS adaptativo, CDN perto do usuário, celular fraco continua tocando |

**Contras:** dependência de um fornecedor; os vídeos passam a ficar fora da sua VM (verificar se o contrato com o cliente permite); custo cresce com o uso.

### D. Armazenamento de objetos + CDN (R2, S3 + CloudFront)

Tira o arquivo da VM e o R2 não cobra saída, mas **não converte nem gera HLS**. Você continuaria precisando do ffmpeg da opção B. Só compensa se quiser controle total da conversão. Para o tamanho do SIPAT hoje, a opção C entrega mais por menos trabalho.

## Análise das escolhas

- **Player:** não há o que ganhar trocando. O diferencial do SIPAT (não pular, 90%, jogos, certificado) está justamente no player próprio.
- **Entrega:** a escolha real é entre **pagar com o seu tempo e a sua VM** (A/B) e **pagar alguns dólares por SIPAT** (C). Para uma empresa, A com os ajustes de B aguenta. A partir de duas ou três empresas rodando SIPAT na mesma semana, a VM vira o gargalo e C fica mais barato do que o seu tempo.
- **Momento:** trocar de infraestrutura na semana do go-live é o maior risco de todos. Por isso a decisão vem em duas etapas.

## Consequências

- **Fica mais fácil:** o go-live acontece sem nova dependência; a troca futura fica limitada a uma implementação de `IPlatformCourseVideoStorage` e à fonte do player.
- **Fica mais difícil:** até a etapa 2, a VM precisa de link e disco folgados, e o backup do volume de vídeos é obrigatório.
- **Revisitar:** depois da primeira SIPAT real, com números medidos (pico de banda, tráfego total, reclamações de travamento).

## Plano de ação

**Antes do go-live (etapa 1)**
1. [ ] Garantir que os vídeos do acervo estejam em 720p H.264, cerca de 2 Mbps, com `faststart` (reconverter os que já foram enviados; o ffmpeg pode rodar fora do sistema por enquanto).
2. [ ] Confirmar com o provedor da VM a velocidade do link de saída e o preço do tráfego; estimar o custo com a tabela acima.
3. [ ] Incluir o volume `platform-videos` no backup externo e testar a restauração (já está em `deploy/CLOUDFLARE-VM.md`).
4. [ ] (Se der tempo) Servir o arquivo pelo nginx com `X-Accel-Redirect` depois da autorização na API.

**Depois da primeira SIPAT (etapa 2)**
5. [ ] Medir pico e total de tráfego do evento real.
6. [ ] Fazer uma prova de conceito com Mux (encaixa direto no Media Chrome) e com Cloudflare Stream: um vídeo, URL assinada, bloqueio de avanço e cobertura funcionando com HLS.
7. [ ] Implementar o provedor escolhido em `IPlatformCourseVideoStorage`, com estado "processando" no catálogo e migração dos vídeos existentes.

## Fontes de preço

- Cloudflare Stream: https://developers.cloudflare.com/stream/pricing
- Mux: https://www.mux.com/pricing
- Bunny Stream: https://bunny.net/pricing/stream/
