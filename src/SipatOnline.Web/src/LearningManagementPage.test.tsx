import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningManagementPage from './LearningManagementPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('learning administration', () => {
  it('shows a participant assigned tracks and only offers other published tracks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        offset: 0,
        limit: 100,
        totalCount: 1,
        items: [{
          id: 'participant-1',
          loginIdentifier: 'employee-1',
          displayName: 'Alex Participante',
          isActive: true,
        }],
      }))
      .mockResolvedValueOnce(Response.json([
        {
          id: 'track-published',
          sipatEventId: 'sipat-1',
          title: 'Ergonomia',
          description: null,
          revisionNumber: 1,
          lessonCount: 3,
          isPublished: true,
        },
        {
          id: 'track-available',
          sipatEventId: 'sipat-1',
          title: 'Segurança',
          description: null,
          revisionNumber: 1,
          lessonCount: 4,
          isPublished: true,
        },
        {
          id: 'track-draft',
          sipatEventId: 'sipat-1',
          title: 'Trilha em rascunho',
          description: null,
          revisionNumber: 0,
          lessonCount: 0,
          isPublished: false,
        },
      ]))
      .mockResolvedValueOnce(Response.json([{
        participantId: 'participant-1',
        loginIdentifier: 'employee-1',
        displayName: 'Alex Participante',
        trackId: 'track-published',
        trackTitle: 'Ergonomia',
        assignedAt: '2026-10-21T00:00:00Z',
        lessonCount: 3,
        completedLessonCount: 1,
        progressPercentage: 40,
        isCompleted: false,
      }]))
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-token' }))
      .mockResolvedValueOnce(Response.json({
        id: 'assignment-1',
        trackId: 'track-available',
        participantId: 'participant-1',
        assignedAt: '2026-10-21T00:00:00Z',
      }, { status: 201 }));
    fetchMock
      .mockResolvedValueOnce(Response.json({
        offset: 0,
        limit: 100,
        totalCount: 1,
        items: [{
          id: 'participant-1',
          loginIdentifier: 'employee-1',
          displayName: 'Alex Participante',
          isActive: true,
        }],
      }))
      .mockResolvedValueOnce(Response.json([
        {
          id: 'track-published',
          sipatEventId: 'sipat-1',
          title: 'Ergonomia',
          description: null,
          revisionNumber: 1,
          lessonCount: 3,
          isPublished: true,
        },
        {
          id: 'track-available',
          sipatEventId: 'sipat-1',
          title: 'Segurança',
          description: null,
          revisionNumber: 1,
          lessonCount: 4,
          isPublished: true,
        },
      ]))
      .mockResolvedValueOnce(Response.json([
        {
          participantId: 'participant-1',
          loginIdentifier: 'employee-1',
          displayName: 'Alex Participante',
          trackId: 'track-published',
          trackTitle: 'Ergonomia',
          assignedAt: '2026-10-21T00:00:00Z',
          lessonCount: 3,
          completedLessonCount: 1,
          progressPercentage: 40,
          isCompleted: false,
        },
        {
          participantId: 'participant-1',
          loginIdentifier: 'employee-1',
          displayName: 'Alex Participante',
          trackId: 'track-available',
          trackTitle: 'Segurança',
          assignedAt: '2026-10-21T00:00:00Z',
          lessonCount: 4,
          completedLessonCount: 0,
          progressPercentage: 0,
          isCompleted: false,
        },
      ]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<LearningManagementPage />);

    const trackSelect = await screen.findByLabelText('Nova trilha disponível');
    expect(await screen.findByRole('heading', {
      name: 'Trilhas de Alex Participante',
    })).toBeVisible();
    expect(screen.getAllByText('Ergonomia')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Ergonomia: 40% concluído' })).toBeVisible();
    expect(screen.getByRole('option', { name: /Segurança/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Ergonomia/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /rascunho/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atribuir trilha' }));

    expect(await screen.findByText('"Segurança" foi atribuída a Alex Participante.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/learning/tracks/track-available/assignments',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(screen.getByText('Todas as trilhas publicadas já foram atribuídas a este participante.'))
      .toBeVisible());
    expect(trackSelect).not.toBeInTheDocument();
  });
});
