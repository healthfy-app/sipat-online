import type { QualityLevel } from '@/api';

export function levelLabel(level: QualityLevel | null | undefined): string {
  if (level === 'Good') return 'Bom';
  if (level === 'Attention') return 'Atenção';
  if (level === 'Poor') return 'Ruim';
  return 'Sem dados';
}

const connections: Record<string, string> = { 'slow-2g': '2G lenta', '2g': '2G', '3g': '3G', '4g': '4G ou melhor', unknown: 'Desconhecida' };
const devices: Record<string, string> = { phone: 'Celular', tablet: 'Tablet', desktop: 'Computador' };
const qualities: Record<string, string> = { single: 'Única', '720p': '720p', '480p': '480p' };

export const connectionLabel = (key: string | null) => (key ? connections[key] ?? key : 'Desconhecida');
export const deviceLabel = (key: string | null) => (key ? devices[key] ?? key : 'Desconhecido');
export const qualityLabel = (key: string | null) => (key ? qualities[key] ?? key : 'Desconhecida');
export const dayLabel = (key: string | null) => (key === null ? 'Sem dia' : `Dia ${key}`);

const oneDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatPercent = (value: number) => `${oneDecimal.format(value)}%`;
export const formatSeconds = (milliseconds: number) => `${oneDecimal.format(milliseconds / 1000)} s`;
