import { useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import './LearningCatalog.css';
import LearningHomePage from './learning/LearningHomePage';
import LearningTrackPage from './learning/LearningTrackPage';
import type { LearningSummary } from './learning/learningHelpers';

export type { LearningSummary } from './learning/learningHelpers';

export default function LearningPage({
  participantName,
}: {
  participantName?: string;
  tenantName?: string;
}) {
  const { trackId } = useParams();
  const [searchParams] = useSearchParams();
  const setSummary = useOutletContext<((summary: LearningSummary | null) => void) | undefined>();
  return trackId ? (
    <LearningTrackPage
      resumeLessonId={searchParams.get('lesson')}
      setSummary={setSummary}
      trackId={trackId}
    />
  ) : (
    <LearningHomePage participantName={participantName} setSummary={setSummary} />
  );
}
