import type { LearningParticipantProgress, ParticipantAccount } from './api';

export type ParticipantProgressStatus =
  | 'completed'
  | 'in-progress'
  | 'not-started'
  | 'no-tracks'
  | 'inactive';

export type ParticipantProgressFilter = 'all' | ParticipantProgressStatus;

export const participantProgressStatuses: readonly ParticipantProgressStatus[] = [
  'completed',
  'in-progress',
  'not-started',
  'no-tracks',
  'inactive',
];

export interface ParticipantProgressSummary {
  participant: ParticipantAccount;
  tracks: LearningParticipantProgress[];
  assignedTrackCount: number;
  completedTrackCount: number;
  lessonCount: number;
  completedLessonCount: number;
  overallProgressPercentage: number;
  status: ParticipantProgressStatus;
}

export interface CompanyLearningOverview {
  participantCount: number;
  activeParticipantCount: number;
  assignedTrackCount: number;
  completedTrackCount: number;
  lessonCount: number;
  completedLessonCount: number;
  overallProgressPercentage: number;
  participantDistribution: { status: ParticipantProgressStatus; count: number }[];
  trackProgress: {
    trackId: string;
    trackTitle: string;
    participantCount: number;
    completedParticipantCount: number;
    averageProgressPercentage: number;
  }[];
}

export function summarizeParticipants(
  participants: readonly ParticipantAccount[],
  participation: readonly LearningParticipantProgress[],
): ParticipantProgressSummary[] {
  const tracksByParticipant = new Map<string, LearningParticipantProgress[]>();
  for (const track of participation) {
    const assigned = tracksByParticipant.get(track.participantId) ?? [];
    assigned.push(track);
    tracksByParticipant.set(track.participantId, assigned);
  }

  return participants.map((participant) => {
    const tracks = tracksByParticipant.get(participant.id) ?? [];
    const lessonCount = tracks.reduce((total, track) => total + count(track.lessonCount), 0);
    const completedLessonCount = tracks.reduce(
      (total, track) => total + Math.min(count(track.lessonCount), count(track.completedLessonCount)),
      0,
    );
    const completedTrackCount = tracks.filter((track) => track.isCompleted).length;
    const hasProgress = tracks.some(
      (track) => track.completedLessonCount > 0 || track.progressPercentage > 0,
    );
    const status: ParticipantProgressStatus = !participant.isActive
      ? 'inactive'
      : tracks.length === 0
        ? 'no-tracks'
        : completedTrackCount === tracks.length
          ? 'completed'
          : hasProgress
            ? 'in-progress'
            : 'not-started';

    return {
      participant,
      tracks: [...tracks].sort((left, right) => left.trackTitle.localeCompare(right.trackTitle, 'pt-BR')),
      assignedTrackCount: tracks.length,
      completedTrackCount,
      lessonCount,
      completedLessonCount,
      overallProgressPercentage: lessonCount === 0 ? 0 : Math.round(completedLessonCount * 100 / lessonCount),
      status,
    };
  }).sort((left, right) =>
    left.participant.displayName.localeCompare(right.participant.displayName, 'pt-BR'),
  );
}

export function filterParticipantProgress(
  participants: readonly ParticipantProgressSummary[],
  query: string,
  status: ParticipantProgressFilter,
): ParticipantProgressSummary[] {
  const normalizedQuery = normalize(query);
  return participants.filter((summary) => {
    const matchesStatus = status === 'all' || summary.status === status;
    if (!matchesStatus) return false;
    if (!normalizedQuery) return true;
    return normalize(summary.participant.displayName).includes(normalizedQuery)
      || normalize(summary.participant.loginIdentifier).includes(normalizedQuery);
  });
}

export function summarizeCompanyProgress(
  participants: readonly ParticipantAccount[],
  participation: readonly LearningParticipantProgress[],
): CompanyLearningOverview {
  const summaries = summarizeParticipants(participants, participation);
  const distribution = participantProgressStatuses.map((status) => ({
    status,
    count: summaries.filter((summary) => summary.status === status).length,
  }));
  const assignedTracks = summaries.flatMap((summary) => summary.tracks);
  const lessonCount = summaries.reduce((total, summary) => total + summary.lessonCount, 0);
  const completedLessonCount = summaries.reduce((total, summary) => total + summary.completedLessonCount, 0);
  const tracksById = new Map<string, LearningParticipantProgress[]>();

  for (const track of assignedTracks) {
    const assigned = tracksById.get(track.trackId) ?? [];
    assigned.push(track);
    tracksById.set(track.trackId, assigned);
  }

  return {
    participantCount: summaries.length,
    activeParticipantCount: summaries.filter((summary) => summary.participant.isActive).length,
    assignedTrackCount: assignedTracks.length,
    completedTrackCount: assignedTracks.filter((track) => track.isCompleted).length,
    lessonCount,
    completedLessonCount,
    overallProgressPercentage: lessonCount === 0 ? 0 : Math.round(completedLessonCount * 100 / lessonCount),
    participantDistribution: distribution,
    trackProgress: [...tracksById.entries()]
      .map(([trackId, tracks]) => ({
        trackId,
        trackTitle: tracks[0].trackTitle,
        participantCount: tracks.length,
        completedParticipantCount: tracks.filter((track) => track.isCompleted).length,
        averageProgressPercentage: Math.round(
          tracks.reduce((total, track) => total + Math.min(100, Math.max(0, track.progressPercentage)), 0)
            / tracks.length,
        ),
      }))
      .sort((left, right) => left.trackTitle.localeCompare(right.trackTitle, 'pt-BR')),
  };
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalize(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
