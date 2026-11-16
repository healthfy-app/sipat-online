import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Small and muted: an extra is clearly an appendix, but not shouting. */
export default function ExtraBadge({ className }: { className?: string }) {
  return <Badge className={cn('px-1.5 py-0 text-[0.6875rem] font-medium', className)} variant="neutral">Extra</Badge>;
}
