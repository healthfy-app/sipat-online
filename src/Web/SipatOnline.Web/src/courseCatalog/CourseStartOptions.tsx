import { FolderOpen, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';

export default function CourseStartOptions({
  onReuse,
  onCreate,
}: {
  onReuse: () => void;
  onCreate: () => void;
}) {
  return (
    <section aria-label="Como deseja começar?" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
      <StartOption
        description="Envie os vídeos que você já tem para a biblioteca e monte o curso com eles."
        icon={<FolderOpen className="size-6" />}
        onClick={onReuse}
        title={<>Tenho um <span className="text-primary">treinamento já existente</span></>}
      />
      <StartOption
        description="Comece um curso com uma capa, um título e uma breve descrição."
        icon={<PenLine className="size-6" />}
        onClick={onCreate}
        title={<>Quero <span className="text-primary">criar um treinamento</span></>}
        warm
      />
    </section>
  );
}

function StartOption({ icon, title, description, onClick, warm = false }: {
  icon: ReactNode;
  title: ReactNode;
  description: string;
  onClick: () => void;
  warm?: boolean;
}) {
  return (
    <button
      className="group relative m-0 grid min-h-0 cursor-pointer content-start justify-items-start gap-3 rounded-lg border-0 bg-card p-6 text-left font-[inherit] text-foreground shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0"
      onClick={onClick}
      type="button"
    >
      <span className={warm ? 'grid size-12 place-items-center rounded-lg bg-warning-soft text-warning' : 'grid size-12 place-items-center rounded-lg bg-accent text-accent-foreground'}>
        {icon}
      </span>
      <strong className="text-lg font-semibold leading-snug">{title}</strong>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <span aria-hidden="true" className="absolute right-5 top-6 text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary">→</span>
    </button>
  );
}
