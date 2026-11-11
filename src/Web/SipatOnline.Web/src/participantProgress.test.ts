import { describe, expect, it } from 'vitest';
import type { LearningParticipantProgress, ParticipantAccount } from './api';
import {
  filterParticipantProgress,
  summarizeCompanyProgress,
  summarizeParticipants,
} from './participantProgress';

const participants: ParticipantAccount[] = [
  { id: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', isActive: true },
  { id: 'p2', displayName: 'Bruno Lima', loginIdentifier: 'MAT-002', isActive: false },
  { id: 'p3', displayName: 'Carla Nunes', loginIdentifier: 'MAT-003', isActive: true },
  { id: 'p4', displayName: 'Davi Rocha', loginIdentifier: 'MAT-004', isActive: true },
  { id: 'p5', displayName: 'Eva Alves', loginIdentifier: 'MAT-005', isActive: true },
  { id: 'p6', displayName: 'Fabio Reis', loginIdentifier: 'MAT-006', isActive: true },
];

const participation: LearningParticipantProgress[] = [
  {
    participantId: 'p1', loginIdentifier: 'MAT-001', displayName: 'Ana Costa',
    trackId: 't1', trackTitle: 'Ergonomia', assignedAt: '2026-01-01T00:00:00Z',
    lessonCount: 4, completedLessonCount: 4, progressPercentage: 100, isCompleted: true,
  },
  {
    participantId: 'p1', loginIdentifier: 'MAT-001', displayName: 'Ana Costa',
    trackId: 't2', trackTitle: 'Segurança', assignedAt: '2026-01-02T00:00:00Z',
    lessonCount: 2, completedLessonCount: 1, progressPercentage: 55, isCompleted: false,
  },
  {
    participantId: 'p2', loginIdentifier: 'MAT-002', displayName: 'Bruno Lima',
    trackId: 't1', trackTitle: 'Ergonomia', assignedAt: '2026-01-03T00:00:00Z',
    lessonCount: 4, completedLessonCount: 4, progressPercentage: 100, isCompleted: true,
  },
  {
    participantId: 'p4', loginIdentifier: 'MAT-004', displayName: 'Davi Rocha',
    trackId: 't2', trackTitle: 'Segurança', assignedAt: '2026-01-04T00:00:00Z',
    lessonCount: 2, completedLessonCount: 0, progressPercentage: 0, isCompleted: false,
  },
  {
    participantId: 'p5', loginIdentifier: 'MAT-005', displayName: 'Eva Alves',
    trackId: 't3', trackTitle: 'Saúde', assignedAt: '2026-01-05T00:00:00Z',
    lessonCount: 0, completedLessonCount: 0, progressPercentage: 0, isCompleted: false,
  },
  {
    participantId: 'p6', loginIdentifier: 'MAT-006', displayName: 'Fabio Reis',
    trackId: 't4', trackTitle: 'Alimentação', assignedAt: '2026-01-06T00:00:00Z',
    lessonCount: 1, completedLessonCount: 1, progressPercentage: 100, isCompleted: true,
  },
];

describe('participant progress aggregation', () => {
  it('creates one summary per participant and weights overall progress by completed lessons', () => {
    const summaries = summarizeParticipants(participants, participation);

    expect(summaries).toHaveLength(6);
    expect(summaries[0]).toMatchObject({
      participant: participants[0],
      assignedTrackCount: 2,
      completedTrackCount: 1,
      lessonCount: 6,
      completedLessonCount: 5,
      overallProgressPercentage: 83,
      status: 'in-progress',
    });
    expect(summaries[2]).toMatchObject({
      participant: participants[2],
      assignedTrackCount: 0,
      lessonCount: 0,
      overallProgressPercentage: 0,
      status: 'no-tracks',
    });
    expect(summaries.map((summary) => summary.participant.id)).toEqual([
      'p1', 'p2', 'p3', 'p4', 'p5', 'p6',
    ]);
  });

  it('counts inactive, unassigned, completed, in-progress, and not-started accounts once each', () => {
    const overview = summarizeCompanyProgress(participants, participation);

    expect(overview.participantCount).toBe(6);
    expect(overview.activeParticipantCount).toBe(5);
    expect(overview.participantDistribution).toEqual([
      { status: 'completed', count: 1 },
      { status: 'in-progress', count: 1 },
      { status: 'not-started', count: 2 },
      { status: 'no-tracks', count: 1 },
      { status: 'inactive', count: 1 },
    ]);
    expect(overview.participantDistribution.reduce((total, item) => total + item.count, 0)).toBe(6);
    expect(overview.assignedTrackCount).toBe(6);
    expect(overview.completedTrackCount).toBe(3);
    expect(overview.completedLessonCount).toBe(10);
    expect(overview.lessonCount).toBe(13);
    expect(overview.overallProgressPercentage).toBe(77);
  });

  it('aggregates progress per track across assigned participants', () => {
    const overview = summarizeCompanyProgress(participants, participation);

    expect(overview.trackProgress).toEqual([
      { trackId: 't4', trackTitle: 'Alimentação', participantCount: 1, completedParticipantCount: 1, averageProgressPercentage: 100 },
      { trackId: 't1', trackTitle: 'Ergonomia', participantCount: 2, completedParticipantCount: 2, averageProgressPercentage: 100 },
      { trackId: 't3', trackTitle: 'Saúde', participantCount: 1, completedParticipantCount: 0, averageProgressPercentage: 0 },
      { trackId: 't2', trackTitle: 'Segurança', participantCount: 2, completedParticipantCount: 0, averageProgressPercentage: 28 },
    ]);
  });

  it('filters by normalized name or employee number and by progress status', () => {
    const summaries = summarizeParticipants(participants, participation);

    expect(filterParticipantProgress(summaries, '  mat-004 ', 'all').map((item) => item.participant.id))
      .toEqual(['p4']);
    expect(filterParticipantProgress(summaries, 'ana', 'in-progress').map((item) => item.participant.id))
      .toEqual(['p1']);
    expect(filterParticipantProgress(summaries, '', 'no-tracks').map((item) => item.participant.id))
      .toEqual(['p3']);
  });

  it('returns a zeroed chart summary for a company with no participants', () => {
    const overview = summarizeCompanyProgress([], []);

    expect(overview.participantCount).toBe(0);
    expect(overview.overallProgressPercentage).toBe(0);
    expect(overview.participantDistribution.every((item) => item.count === 0)).toBe(true);
    expect(overview.trackProgress).toEqual([]);
  });
});
