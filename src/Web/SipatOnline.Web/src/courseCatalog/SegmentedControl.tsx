import { cn } from '@/lib/utils';

/** Grupo de botões alternáveis (um ativo por vez). `short` é o rótulo visível em telas estreitas. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string; short?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div aria-label={label} className={cn('inline-flex max-w-full shrink-0 overflow-x-auto rounded-[0.625rem] bg-muted p-[3px] [scrollbar-width:none]', className)} role="group">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            'm-0 h-[1.875rem] min-h-0 shrink-0 cursor-pointer whitespace-nowrap rounded-[0.4375rem] border-0 bg-transparent px-3',
            'text-[0.8125rem] font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground',
            'aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[0_1px_3px_rgb(14_42_34/0.14)]',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-sm:flex-1 max-sm:px-2',
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.short ? (
            <>
              <span className="sm:hidden" aria-hidden="true">{option.short}</span>
              <span className="max-sm:sr-only">{option.label}</span>
            </>
          ) : option.label}
        </button>
      ))}
    </div>
  );
}
