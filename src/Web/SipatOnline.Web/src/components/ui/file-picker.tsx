import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

/**
 * Seletor de arquivo com botão do design system.
 * O <input type="file"> continua sendo o controle real (rotulado pelo próprio botão).
 */
export default function FilePicker({
  id,
  accept,
  buttonLabel,
  file,
  required,
  disabled,
  onChange,
}: {
  id: string;
  accept: string;
  buttonLabel: string;
  file?: File | null;
  required?: boolean;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <input
        accept={accept}
        className="peer sr-only"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
          if (file === undefined) event.target.value = '';
        }}
        required={required}
        type="file"
      />
      <label
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
          disabled && 'pointer-events-none opacity-50',
        )}
        htmlFor={id}
      >
        <Upload /> {buttonLabel}
      </label>
      {file !== undefined && (
        <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : 'Nenhum arquivo selecionado'}</span>
      )}
    </div>
  );
}
