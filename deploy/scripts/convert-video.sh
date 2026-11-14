#!/usr/bin/env bash
# Converte um vídeo para o formato da biblioteca: H.264 High, até 720p, ~2 Mbps, AAC 128 kbps, +faststart.
# Uso: convert-video.sh entrada.mp4 saida.mp4
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Uso: $0 entrada.mp4 saida.mp4" >&2
  exit 2
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg não encontrado. Instale com 'sudo apt install ffmpeg' (Linux) ou 'winget install ffmpeg' (Windows)." >&2
  exit 127
fi

input="$1"
output="$2"

if [ ! -f "$input" ]; then
  echo "Arquivo de entrada não encontrado: $input" >&2
  exit 1
fi

ffmpeg -hide_banner -y -i "$input" \
  -vf "scale=-2:'min(720,ih)'" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -b:v 2M -maxrate 2500k -bufsize 4M \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "$output"

echo "Pronto: $output"
