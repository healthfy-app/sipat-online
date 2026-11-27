import { useMemo } from 'react';
import { coursePhase, type CourseOwner } from './catalogFilters';
import type { CourseCategory, PlatformCourse } from '@/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { extrasSuffix, houseVideos, pluralize } from '@/courseEditor/courseFormat';
import { phaseLabel } from '@/sipatBuilder/sipatPhase';
import TrainingCard from '@/trainings/TrainingCard';
import { periodLabel, runtime } from '@/trainings/trainingFormat';

/** What the list does with a training. The ones about where it stands (publish, end, bring back, the link) are of a company's training. */
export interface CourseActions {
  onEdit: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
  onDelete: (course: PlatformCourse) => void;
  onPublish: (course: PlatformCourse, owner: CourseOwner) => void;
  onEnd: (course: PlatformCourse, owner: CourseOwner) => void;
  onReactivate: (course: PlatformCourse, owner: CourseOwner) => void;
  onShare: (course: PlatformCourse, owner: CourseOwner) => void;
}

/**
 * The trainings as cards, the same card a company sees: the operation's templates and every company's trainings. The
 * list arrives already filtered by the toolbar above the tabs.
 */
export default function CoursesPanel({
  courses,
  owners,
  categories,
  onClearFilters,
  busy,
  actions,
}: {
  courses: PlatformCourse[];
  owners?: Map<string, CourseOwner>;
  categories: CourseCategory[];
  onClearFilters: () => void;
  busy: boolean;
  actions: CourseActions;
}) {
  const categoryNames = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);

  return (
    <section aria-label="Treinamentos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {courses.length === 0 ? (
        <EmptyState
          action={<Button onClick={onClearFilters} variant="outline">Ver todos os treinamentos</Button>}
          title="Nenhum treinamento corresponde aos filtros."
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const owner = owners?.get(course.id);
            const phase = coursePhase(course, owner);
            const house = houseVideos(course.videos);
            const duration = house.reduce((sum, video) => sum + video.durationMilliseconds, 0);
            const days = owner?.days ?? course.lessons?.length ?? 0;
            const category = course.categoryId ? categoryNames.get(course.categoryId) : null;
            const videos = `${pluralize(house.length, 'vídeo', 'vídeos')}${house.length > 0 ? ` · ${runtime(duration)}` : ''}${extrasSuffix(course.videos.length - house.length)}`;
            return <li key={course.id}>
              <TrainingCard
                busy={busy}
                cover={course.coverUrl}
                ended={phase === 'cancelled'}
                live={phase === 'published' || phase === 'running'}
                onDelete={() => actions.onDelete(course)}
                onDuplicate={() => actions.onDuplicate(course)}
                onEdit={() => actions.onEdit(course)}
                onEnd={owner && phase !== 'cancelled' ? () => actions.onEnd(course, owner) : undefined}
                onPublish={owner && phase === 'created' ? () => actions.onPublish(course, owner) : undefined}
                onReactivate={owner && phase === 'cancelled' ? () => actions.onReactivate(course, owner) : undefined}
                onShare={owner?.status === 'Published' ? () => actions.onShare(course, owner) : undefined}
                // the card opens the days: a company's training in that company, a template on the same board without dates
                openTo={owner ? `/platform/companies/${owner.tenantId}/treinamentos/${owner.sipatEventId}` : `/platform/courses/${course.id}`}
                owner={owner?.companyName ?? 'Template'}
                period={owner?.startsAt && owner.endsAt ? periodLabel(owner.startsAt, owner.endsAt) : null}
                phase={phaseLabel[phase]}
                stats={days > 0 ? `${pluralize(days, 'dia', 'dias')} · ${videos}` : videos}
                title={course.title}
              >
                {category && <span className="text-[0.75rem] font-bold uppercase tracking-[0.06em] text-[#3d514b]">{category}</span>}
              </TrainingCard>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
