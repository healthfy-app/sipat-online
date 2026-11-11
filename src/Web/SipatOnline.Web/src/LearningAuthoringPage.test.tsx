import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningAuthoringPage from './LearningAuthoringPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('learning content authoring', () => {
  it('creates a track, adds a video, and publishes it for assignment', async () => {
    const eventId = 'event-1';
    const trackId = 'track-1';
    let trackCreated = false;
    let isPublished = false;
    let lessons: Array<{
      id: string;
      title: string;
      description: string | null;
      providerAssetReference: string;
      position: number;
      durationMilliseconds: number;
    }> = [];
    const eventPage = {
      offset: 0,
      limit: 100,
      totalCount: 1,
      items: [{
        id: eventId,
        tenantId: 'tenant-1',
        title: 'SIPAT 2026',
        description: null,
        startsAt: '2026-11-01T12:00:00Z',
        endsAt: '2026-11-05T12:00:00Z',
        status: 'Published',
        createdAt: '2026-10-01T12:00:00Z',
      }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/admin/sipats?offset=0&limit=100') {
        return Response.json(eventPage);
      }
      if (path === '/api/admin/learning/tracks') {
        return Response.json(trackCreated ? [{
          id: trackId,
          sipatEventId: eventId,
          title: 'Ergonomia no trabalho',
          description: null,
          revisionNumber: isPublished ? 1 : 0,
          lessonCount: lessons.length,
          isPublished,
        }] : []);
      }
      if (path === '/api/identity/antiforgery') {
        return Response.json({ requestToken: 'csrf-token' });
      }
      if (path === `/api/admin/sipats/${eventId}/tracks`) {
        trackCreated = true;
        return Response.json({ id: trackId }, { status: 201 });
      }
      if (path === `/api/admin/learning/tracks/${trackId}/draft`) {
        return Response.json({
          trackId,
          sipatEventId: eventId,
          title: 'Ergonomia no trabalho',
          description: null,
          revisionId: 'revision-1',
          revisionNumber: 1,
          lessons,
        });
      }
      if (path === `/api/admin/learning/tracks/${trackId}/lessons`) {
        const request = JSON.parse(String(init?.body)) as {
          title: string;
          description: string | null;
          providerAssetReference: string;
          durationMilliseconds: number;
        };
        lessons = [{
          ...request,
          id: 'lesson-1',
          position: 1,
        }];
        return Response.json({
          id: 'lesson-1',
          title: request.title,
          description: request.description,
          position: 1,
          durationMilliseconds: request.durationMilliseconds,
        }, { status: 201 });
      }
      if (path === `/api/admin/learning/tracks/${trackId}/publish`) {
        isPublished = true;
        return Response.json({
          id: 'revision-1',
          trackId,
          revisionNumber: 1,
          status: 'Published',
          lessonCount: lessons.length,
          publishedAt: '2026-10-21T12:00:00Z',
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<LearningAuthoringPage />);

    await user.type(await screen.findByLabelText('Nome da trilha'), 'Ergonomia no trabalho');
    await user.click(screen.getByRole('button', { name: 'Criar trilha' }));

    await user.type(await screen.findByLabelText('Título do vídeo'), 'Postura no escritório');
    await user.type(screen.getByLabelText('Referência do vídeo no provedor'), 'provider-asset-123');
    await user.type(screen.getByLabelText('Duração em segundos'), '120');
    await user.click(screen.getByRole('button', { name: 'Adicionar vídeo' }));

    expect(await screen.findByText('1. Postura no escritório')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Publicar trilha' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '"Ergonomia no trabalho" foi publicada e está disponível para atribuição.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/learning/tracks/${trackId}/lessons`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Postura no escritório',
          description: null,
          providerAssetReference: 'provider-asset-123',
          durationMilliseconds: 120000,
        }),
      }),
    );
    await waitFor(() => expect(screen.getByText('1 trilha publicada')).toBeVisible());
  });
});
