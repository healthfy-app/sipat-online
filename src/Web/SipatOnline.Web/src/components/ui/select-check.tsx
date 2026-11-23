import { Check, Minus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * A round-cornered check for picking items in bulk. `tone="dark"` sits over a video thumbnail; `mixed` shows a dash
 * when only part of a list is picked.
 */
export default function SelectCheck({ checked, mixed = false, label, onChange, tone = 'light', className }: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed && !checked; }, [mixed, checked]);
  const Icon = mixed && !checked ? Minus : Check;
  return (
    <span className={cn('relative inline-grid size-5 shrink-0 place-items-center', className)}>
      <input
        aria-label={label}
        checked={checked}
        className={cn(
          'peer m-0 size-5 cursor-pointer appearance-none rounded-md border-2 transition-[background-color,border-color,box-shadow] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary',
          tone === 'dark'
            ? 'border-white/90 bg-black/35 shadow-[0_1px_4px_rgb(0_0_0/0.4)] hover:bg-black/55'
            : 'border-input bg-card hover:border-primary',
        )}
        onChange={(event) => onChange(event.target.checked)}
        ref={ref}
        type="checkbox"
      />
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute size-3.5 scale-50 text-primary-foreground opacity-0 transition-[opacity,scale] duration-150 peer-checked:scale-100 peer-checked:opacity-100 peer-indeterminate:scale-100 peer-indeterminate:opacity-100"
        strokeWidth={3.5}
      />
    </span>
  );
}
