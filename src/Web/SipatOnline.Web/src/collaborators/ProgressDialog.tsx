import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLearningParticipantReport, type LearningParticipantReport, type ParticipantAccount } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { formatReportDate, formatWatchTime, participantReportCsv, reportFileName } from '@/participantReports';
import ParticipantOutcomesPanel from '@/ParticipantOutcomesPanel';
import { downloadCsv } from './csvFile';

/**
 * What one collaborator watched: each day (track) with its videos, and the report to download.
 * `trainingId` is the training chosen on the page; without one, the days come grouped under each training's name.
 */
export default function ProgressDialog({ person, onClose, trainingId = null }: { person: ParticipantAccount; onClose: () => void; trainingId?: string | null }) {
  const [report, setReport] = useState<LearningParticipantReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    getLearningParticipantReport(person.id)
      .then(result => { if (current) setReport(result); })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, [person.id]);

  const tracks = (report?.tracks ?? []).filter(({ track }) => trainingId === null || track.sipatEventId === trainingId);
  const groups = groupByTraining(tracks);

  return <Dialog description={`Login ${person.loginIdentifier}`} onClose={onClose} size="lg" title={`Andamento de ${person.displayName}`}>
    <div className="grid gap-4">
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      {!report && !error && <p className="m-0 text-sm text-muted-foreground" role="status">Carregando o andamento...</p>}
      {report && tracks.length === 0 && <p className="m-0 text-sm text-muted-foreground">{trainingId === null
        ? 'Este colaborador ainda não recebeu nenhum dia de treinamento.'
        : 'Este colaborador ainda não recebeu nenhum dia deste treinamento.'}</p>}
      {groups.map(group => <div className="grid gap-2" key={group.id}>
        {groups.length > 1 && <h3 className="m-0 text-sm font-semibold text-muted-foreground">{group.title}</h3>}
        {group.tracks.map(({ track, lessons }) => <section aria-label={track.dayTitle ?? track.title} className="grid gap-2 rounded-xl border border-border p-3" key={track.id}>
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <strong className="text-sm">{track.dayTitle ?? track.title}</strong>
          <span className="text-xs text-muted-foreground tabular-nums">{track.completedLessonCount} de {track.lessonCount} vídeos · {track.progressPercentage}%</span>
        </header>
        <ul className="m-0 grid list-none gap-1 p-0 text-sm">
          {lessons.map(lesson => <li className="flex items-center gap-2" key={lesson.id}>
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full text-primary-foreground" style={{ backgroundColor: lesson.isCompleted ? 'var(--brand-primary)' : 'var(--muted)' }}>
              {lesson.isCompleted && <Check className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{lesson.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {lesson.isCompleted ? `Concluído em ${formatReportDate(lesson.completedAt) || '—'}` : lesson.watchedPercentage > 0 ? `${lesson.watchedPercentage}% · ${formatWatchTime(lesson.watchedMilliseconds)}` : 'Não iniciado'}
            </span>
          </li>)}
        </ul>
      </section>)}
      </div>)}
      <section aria-label="Atividades e certificados" className="grid gap-2">
        <h3 className="m-0 text-sm font-semibold">Atividades e certificados</h3>
        <ParticipantOutcomesPanel participantId={person.id} />
      </section>
      <div className="flex justify-end">
        <Button disabled={!report} onClick={() => report && downloadCsv(reportFileName(report.displayName), participantReportCsv(report))} variant="outline">Baixar relatório (CSV)</Button>
      </div>
    </div>
  </Dialog>;
}

type ReportTrack = LearningParticipantReport['tracks'][number];

/** The days of each training together, in the order the report brings them, under the training's name. */
function groupByTraining(tracks: readonly ReportTrack[]): { id: string; title: string; tracks: ReportTrack[] }[] {
  const groups = new Map<string, { id: string; title: string; tracks: ReportTrack[] }>();
  for (const item of tracks) {
    const id = item.track.sipatEventId || 'sem-treinamento';
    const group = groups.get(id) ?? { id, title: item.track.sipatTitle || 'Outros vídeos', tracks: [] };
    group.tracks.push(item);
    groups.set(id, group);
  }
  return [...groups.values()];
}
