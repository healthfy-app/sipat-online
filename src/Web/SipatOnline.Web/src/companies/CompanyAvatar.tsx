import { cn } from '@/lib/utils';

const palettes = [
  'bg-accent text-accent-foreground',
  'bg-warning-soft text-warning',
  'bg-[#e6eef6] text-[#2a5e8c]',
  'bg-[#efe9f6] text-[#5b3f8c]',
];

/** Iniciais da empresa num quadrado colorido (cor estável pelo nome). */
export default function CompanyAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?';
  const palette = palettes[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length];
  return (
    <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-md text-sm font-bold', palette, className)}>
      {initials}
    </span>
  );
}
