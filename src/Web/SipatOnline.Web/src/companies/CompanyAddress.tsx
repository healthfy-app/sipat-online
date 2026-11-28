import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The address where the company's people sign in: its key under the domain of the operation portal
 * (ops.exemplo.com.br -> damare.exemplo.com.br).
 */
export function companyAddress(key: string, host = window.location.host): string {
  const base = host.replace(/^ops\./, '');
  return `https://${key}.${base}`;
}

/** The company's address as a link, with a discreet copy, for the operator to hand to the client. */
export default function CompanyAddress({ companyKey, className, inactive = false }: { companyKey: string; className?: string; inactive?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = companyAddress(companyKey);
  const shown = url.replace(/^https:\/\//, '');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* no clipboard: the link is still there */ }
  };
  // an inactive company's address answers nobody: it is shown as what it was, not as a door to open
  if (inactive) {
    return <span className={cn('inline-flex min-w-0 max-w-full items-center text-xs text-muted-foreground line-through decoration-muted-foreground/50', className)}
      title="O endereço não abre enquanto a empresa está inativa"><span className="min-w-0 truncate">{shown}</span></span>;
  }
  return (
    <span className={cn('group/address inline-flex min-w-0 max-w-full items-center gap-0.5 align-middle text-xs', className)}>
      <a className="inline-flex min-w-0 items-center gap-1 font-medium text-primary decoration-primary/40 underline-offset-[3px] hover:underline"
        href={url} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank" title={`Abrir ${shown} em nova aba`}>
        <span className="min-w-0 truncate">{shown}</span>
        <ExternalLink aria-hidden="true" className="size-3 shrink-0 opacity-60 transition-opacity group-hover/address:opacity-100" />
      </a>
      <button aria-label={copied ? 'Endereço copiado' : `Copiar o endereço ${shown}`}
        className="grid size-6 min-h-0 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent p-0 text-muted-foreground opacity-0 transition-opacity group-hover/address:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 max-[640px]:size-9 max-[640px]:opacity-100"
        onClick={(event) => { event.stopPropagation(); void copy(); }} title={copied ? 'Copiado' : 'Copiar endereço'} type="button">
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}
