# ADR-002: Entrega de vídeo pela VM com Cloudflare R2 e conversão própria

**Status:** Aceito
**Data:** 2026-11-15
**Decisores:** dono do produto (HealthEz)
**Relacionados:** substitui a parte de **entrega** do ADR-001 (o player continua como lá e no ADR-003)

## Contexto

- O custo do vídeo tem de ficar fixo, **sem preço por participante**: o produto é vendido por SIPAT, e uma empresa de 600 pessoas não pode custar dez vezes uma de 60.
- Uma SIPAT de 600 pessoas soma cerca de 72.000 minutos assistidos (≈ 1,1 TB a 720p bem comprimido) e um pico de até 600 pessoas ao mesmo tempo no início do turno. Servido pela VM, esse pico satura a banda; servido como enviado (6 a 7 Mbps), o tráfego triplica.
- Azure Blob no Brasil cobra a saída de dados (~US$ 0,18/GB): **cerca de R$ 1.000 por SIPAT** de 600 pessoas, só de banda.
- Mux e Cloudflare Stream resolvem tudo (conversão, HLS, CDN), mas cobram por minuto entregue ou armazenado e põem um terceiro no caminho de cada reprodução.
- O armazenamento já está atrás de `IPlatformCourseVideoStorage`, com `File` (volume da VM) e `R2` (Etapa 1, links assinados).
- O participante assiste no celular, muitas vezes no 4G ou no Wi-Fi da fábrica: uma versão leve é necessária, não opcional.

## Decisão

1. **VM pequena + Cloudflare R2.** A API continua na VM; os arquivos ficam num bucket privado do R2, que não cobra saída de dados. O participante assiste por **links assinados de 2 h** (mais uma margem), pedidos depois das verificações de acesso da API.
2. **Conversão própria com ffmpeg dentro da imagem da API.** Todo envio vira duas versões:
   - **720p:** `-c:v libx264 -profile:v high -pix_fmt yuv420p -b:v 2M -maxrate 2500k -bufsize 4M -c:a aac -b:a 128k -movflags +faststart`, `-vf "scale=-2:'min(720,trunc(ih/2)*2)'"`;
   - **480p:** `-c:v libx264 -profile:v main -pix_fmt yuv420p -b:v 1M -maxrate 1250k -bufsize 2M -c:a aac -b:a 96k -movflags +faststart`, `-vf "scale=-2:'min(480,trunc(ih/2)*2)'"`;
   - sempre `-hide_banner -nostdin -y -preset veryfast`.
3. **Uma conversão por vez, em prioridade baixa** (`ProcessPriorityClass.Idle`, que no Linux é `nice 19`), por um único `BackgroundService` lendo uma fila em tabela (`learning."VideoConversionJobs"`). O vídeo fica "Processando" até as duas versões estarem no armazenamento e, enquanto isso, **não entra num Dia**. Um reinício no meio devolve o trabalho à fila; um arquivo corrompido vira "Falhou" com o motivo, sem travar a fila.
4. **`File` continua como plano B.** Basta trocar `VIDEO_STORAGE_PROVIDER` para voltar a servir do volume da VM; a conversão funciona igual nos dois.

## Alternativas consideradas

| Opção | Por que não |
|---|---|
| **VM servindo o MP4** (ADR-001, opção A/B) | Sem custo extra, mas a banda da VM vira o gargalo no pico do turno e o plano de rede encarece. Fica só como plano B. |
| **Azure Blob** | Mesma ideia do R2, mas a saída de dados no Brasil custa ~R$ 1.000 por SIPAT de 600 pessoas e cresce com cada participante. |
| **Mux / Cloudflare Stream** | Melhor qualidade de entrega (HLS adaptativo, CDN) com pouco trabalho, mas preço por minuto, dependência de um terceiro em toda reprodução e dados do participante saindo do nosso controle. O que trariam a mais (HLS) dá para fazer depois no próprio R2. |

## Consequências

- **A imagem da API fica maior** com o `ffmpeg` (dezenas de MB) e a VM gasta CPU nas conversões; por isso uma por vez e em prioridade baixa. Um envio grande leva alguns minutos para ficar pronto.
- A API ganha um volume de trabalho (`video-work`) para os originais que esperam conversão; a pasta de cada vídeo é apagada ao terminar, com sucesso ou falha.
- Os vídeos antigos ganham a 480p com `--convert-catalog-videos`, sem sair do ar e sem trocar de id. Para um vídeo que já está pronto, **só a 480p é gerada** (a partir da 720p atual); a 720p **não é recodificada**, para não trocar o arquivo debaixo de quem está assistindo (os pedidos por faixa de bytes de uma reprodução em andamento cairiam em outra codificação). Um vídeo antigo pesado continua pesado na 720p até ser convertido à mão, fora do horário de uso (`deploy/CLOUDFLARE-VM.md`, seção 5).
- **HLS adaptativo fica para depois**, gerado pelo mesmo ffmpeg e guardado no próprio R2, sem mudar o player nem a interface de armazenamento.
- **Antes de ligar o R2 em produção, confirmar nos termos de uso da Cloudflare** que servir vídeo pelo R2 é permitido no plano contratado. Se não for, o plano B (`File`) continua disponível.
