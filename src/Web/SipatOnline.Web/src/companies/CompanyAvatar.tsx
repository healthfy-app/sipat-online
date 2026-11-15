import { useState } from 'react';
import { cn } from '@/lib/utils';

const palettes = [
  'bg-accent text-accent-foreground',
  'bg-warning-soft text-warning',
  'bg-[#e6eef6] text-[#2a5e8c]',
  'bg-[#efe9f6] text-[#5b3f8c]',
];

/**
 * The company's logo on a white tile, so it is recognized at a glance among hundreds of companies.
 * Without a logo (or when it fails to load) the initials stand in, on a color that stays the same for the name.
 */
export default function CompanyAvatar({ name, logo, className }: { name: string; logo?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white p-1', className)}>
        <img alt="" className="max-h-full max-w-full object-contain" decoding="async" loading="lazy" onError={() => setFailed(true)} src={logo} />
      </span>
    );
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?';
  const palette = palettes[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length];
  return (
    <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-md text-sm font-bold', palette, className)}>
      {initials}
    </span>
  );
}
