import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Texto editável no próprio lugar: confirma com Enter ou ao sair do campo, Esc desfaz. */
export default function InlineText({
  value,
  label,
  onCommit,
  disabled = false,
  className,
  placeholder,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  }

  return (
    <input
      aria-label={label}
      className={cn(
        'm-0 h-8! min-h-0! w-full min-w-0 truncate rounded-sm! border! border-transparent! bg-transparent! px-1.5! py-0! text-sm leading-snug text-foreground shadow-none!',
        'hover:border-input! focus:border-ring! focus:bg-card! focus:outline-none! focus-visible:outline-none! disabled:opacity-60',
        className,
      )}
      disabled={disabled}
      maxLength={200}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      value={draft}
    />
  );
}
