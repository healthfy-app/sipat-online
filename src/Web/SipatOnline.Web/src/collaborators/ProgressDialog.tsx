import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLearningParticipantReport, type LearningParticipantReport, type ParticipantAccount } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { formatReportDate, formatWatchTime, participantReportCsv, reportFileName } from '@/participantReports';
import ParticipantOutcomesPanel from '@/ParticipantOutcomesPanel';
import { downloadCsv } from './csvFile';

/** What one collaborator watched: each day (track) with its videos, and the report to download. */
export default function ProgressDialog({ person, onClose }: { person: ParticipantAccount; onClose: () => void }) {
  const [report, setReport] = useState<LearningParticipantReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    getLearningParticipantReport(person.id)
      .then(result => { if (current) setReport(result); })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, [person.id]);

  return <Dialog description={`Matrícula ${person.loginIdentifier}`} onClose={onClose} size="lg" title={`Andamento de ${person.displayName}`}>
    <div className="grid gap-4">
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      {!report && !error && <p className="m-0 text-sm text-muted-foreground" role="status">Carregando o andamento...</p>}
      {report && report.tracks.length === 0 && <p className="m-0 text-sm text-muted-foreground">Este colaborador ainda não recebeu nenhum dia de SIPAT.</p>}
      {report?.tracks.map(({ track, lessons }) => <section aria-label={track.dayTitle ?? track.title} className="grid gap-2 rounded-xl border border-border p-3" key={track.id}>
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
