import type { ReactNode, Ref } from 'react';
import type { PlatformCourseStatus } from '@/api';
import { Badge } from '@/components/ui/badge';
import { statusLabels } from './courseFormat';

export default function CourseStepHeading({
  eyebrow,
  title,
  status,
  headingRef,
  children,
}: {
  eyebrow: string;
  title: string;
  status: PlatformCourseStatus;
  headingRef: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <header className="mb-6 grid gap-1.5">
      <div className="flex items-center gap-2.5">
        <p className="m-0 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
        <Badge variant={status === 'Published' ? 'default' : 'warning'}>{statusLabels[status]}</Badge>
      </div>
      <h1 className="m-0 text-[clamp(1.375rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.02em] [text-wrap:balance] focus:outline-none"
        ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      <p className="m-0 max-w-2xl leading-relaxed text-muted-foreground">{children}</p>
    </header>
  );
}

/** Área rolável das etapas Configurar e Publicar, centralizada com largura máxima. */
export function StepPage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="min-h-0 overflow-y-auto px-[max(1rem,calc((100%-68rem)/2))] pb-12 pt-8 max-[1180px]:min-h-auto max-[1180px]:overflow-visible">
      {children}
    </section>
  );
}
