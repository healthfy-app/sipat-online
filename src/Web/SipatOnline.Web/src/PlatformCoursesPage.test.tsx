import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderView, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import PlatformCoursesPage from './PlatformCoursesPage';
import * as api from './api';

function render(element: ReactElement, path = '/platform/courses') {
  return renderView(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/platform/courses" element={element} />
    <Route path="/platform/courses/:courseId/edit" element={element} />
  </Routes></MemoryRouter>);
}

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    createGameModule: vi.fn(),
    createPlatformCourse: vi.fn(),
    deleteGameModule: vi.fn(),
    duplicatePlatformCourse: vi.fn(),
    listGameModules: vi.fn(),
    listPlatformCourses: vi.fn(),
    listPlatformLibraryVideos: vi.fn(),
    setPlatformCourseCover: vi.fn(),
    setPlatformCourseVideos: vi.fn(),
    updatePlatformCourse: vi.fn(),
    uploadPlatformVideo: vi.fn(),
  };
});

function makeVideo(id: string, title: string): api.PlatformCourseVideo {
  return {
    id,
    title,
    contentType: 'video/mp4',
    sizeBytes: 1024,
    durationMilliseconds: 90000,
    createdAt: '2026-11-10T12:00:00Z',
    fileUrl: `/videos/${id}`,
    checkpoints: [],
  };
}

const opening = makeVideo('v-1', 'Abertura');
const closing = makeVideo('v-2', 'Encerramento');
const memoryModule: api.GameModule = {
  id: 'g-1',
  title: 'Memória: equipamentos e funções',
  gameType: 'Memory',
  questions: [],
  createdAt: '2026-11-02T12:00:00Z',
  usageCount: 0,
};

const ergonomics: api.PlatformCourse = {
  id: 'c-1',
  title: 'Ergonomia',
  description: 'Postura',
  createdAt: '2026-11-02T12:00:00Z',
  status: 'Published',
  gamificationEnabled: true,
  gameType: 'Quiz',
  videos: [opening, closing],
  modules: [],
  coverUrl: null,
};

const fire: api.PlatformCourse = {
  id: 'c-2',
  title: 'Combate a incêndio',
  description: null,
  createdAt: '2026-11-03T12:00:00Z',
  status: 'Draft',
  gamificationEnabled: false,
  gameType: 'Quiz',
  videos: [],
  modules: [],
  coverUrl: null,
};

beforeEach(() => {
  vi.mocked(api.createPlatformCourse).mockReset();
  vi.mocked(api.setPlatformCourseCover).mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:course-cover') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(api.listGameModules).mockReset().mockResolvedValue([]);
  vi.mocked(api.listPlatformCourses).mockReset().mockResolvedValue([ergonomics, fire]);
  vi.mocked(api.listPlatformLibraryVideos).mockReset().mockResolvedValue([
    { video: opening, courseCount: 1 },
    { video: closing, courseCount: 1 },
  ]);
  vi.mocked(api.uploadPlatformVideo).mockReset();
  vi.mocked(api.duplicatePlatformCourse).mockReset();
  vi.mocked(api.setPlatformCourseVideos).mockReset();
  vi.mocked(api.updatePlatformCourse).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Platform course catalog', () => {
  it('shows two choices only when the catalog is empty', async () => {
    vi.mocked(api.listPlatformCourses).mockResolvedValue([]);
    render(<PlatformCoursesPage />);

    const choices = await screen.findByRole('region', { name: 'Como deseja começar?' });
    expect(within(choices).getAllByRole('button')).toHaveLength(2);
    expect(within(choices).getByRole('button', { name: /Tenho um treinamento já existente/ })).toBeVisible();
    expect(within(choices).getByRole('button', { name: /Quero criar um treinamento/ })).toBeVisible();
    await waitFor(() => expect(api.listPlatformCourses).toHaveBeenCalledOnce());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Ergonomia')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('opens the details popup, traps keyboard focus and restores the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    const trigger = screen.getByRole('button', { name: '+ Criar curso' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Detalhes do curso' });
    expect(within(dialog).getByLabelText('Título (obrigatório)')).toHaveFocus();
    within(dialog).getByRole('button', { name: 'Fechar detalhes do curso' }).focus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Criar' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Fechar detalhes do curso' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(api.createPlatformCourse).not.toHaveBeenCalled();
  });

  it('cancels course creation without saving a draft', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Curso não salvo');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createPlatformCourse).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '+ Criar curso' })).toHaveFocus();
  });

  it('prevents closing the popup while course creation is pending', async () => {
    const user = userEvent.setup();
    let finish!: (course: api.PlatformCourse) => void;
    vi.mocked(api.createPlatformCourse).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Combate a incêndio');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fechar detalhes do curso' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    finish(fire);
    expect(await screen.findByRole('heading', { name: 'Combate a incêndio', level: 1 })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows catalog load errors without empty choices and allows a retry', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPlatformCourses)
      .mockRejectedValueOnce(new Error('Catálogo indisponível.'))
      .mockResolvedValueOnce([ergonomics, fire]);
    render(<PlatformCoursesPage />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Catálogo indisponível.');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.listPlatformCourses).toHaveBeenCalledTimes(2);
  });

  it('creates a course with its cover and opens the focused content editor', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    vi.mocked(api.setPlatformCourseCover).mockResolvedValue({ ...fire, coverUrl: '/new-cover.png' });
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    const photo = new File(['cover'], 'capa.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Adicionar capa'), photo);
    expect(await screen.findByAltText('Prévia da capa do curso')).toHaveAttribute('src', 'blob:course-cover');
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Combate a incêndio');
    await user.type(screen.getByLabelText('Descrição'), 'Treinamento inicial');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(api.createPlatformCourse).toHaveBeenCalledWith({
      title: 'Combate a incêndio', description: 'Opção 1\nTreinamento inicial', gamificationEnabled: false,
    });

    expect(api.setPlatformCourseCover).toHaveBeenCalledWith('c-2', photo);
    expect(await screen.findByRole('heading', { name: 'Combate a incêndio', level: 1 })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do curso')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Título do vídeo')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:course-cover');
  });

  it('creates a course inside the selected reference grade', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.selectOptions(screen.getByLabelText('Opção da grade'), '3');
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Qualidade do sono');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(api.createPlatformCourse).toHaveBeenCalledWith({
      title: 'Qualidade do sono', description: 'Opção 3', gamificationEnabled: false,
    });
  });

  it('filters catalog records by the three reference grade options', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPlatformCourses).mockResolvedValue([
      { ...ergonomics, description: 'Opção 1 · 4 aulas\nPostura' },
      { ...fire, description: 'Opção 3 · 4 aulas\nSegurança' },
    ]);
    render(<PlatformCoursesPage />);
    expect(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Abrir curso Combate a incêndio' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Opção 1' }));
    expect(screen.getByRole('button', { name: 'Abrir curso Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Abrir curso Combate a incêndio' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Opção 3' }));
    expect(screen.queryByRole('button', { name: 'Abrir curso Ergonomia' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir curso Combate a incêndio' })).toBeVisible();
  });

  it('shows creation errors inside the popup and preserves the entered title', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockRejectedValue(new Error('Não foi possível criar o curso.'));
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Segurança');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    const dialog = screen.getByRole('dialog', { name: 'Detalhes do curso' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível criar o curso.');
    expect(within(dialog).getByLabelText('Título (obrigatório)')).toHaveValue('Segurança');
    expect(within(dialog).getByRole('button', { name: 'Criar' })).toBeEnabled();
  });

  it('retries a failed cover upload without creating a duplicate course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    vi.mocked(api.setPlatformCourseCover)
      .mockRejectedValueOnce(new Error('Falha no envio.'))
      .mockResolvedValueOnce({ ...fire, coverUrl: '/cover.png' });
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.upload(screen.getByLabelText('Adicionar capa'), new File(['cover'], 'capa.png', { type: 'image/png' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Combate a incêndio');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O curso foi criado, mas não foi possível salvar a capa.');
    await user.click(screen.getByRole('button', { name: 'Tentar salvar capa' }));

    expect(await screen.findByRole('heading', { name: 'Combate a incêndio', level: 1 })).toBeVisible();
    expect(api.createPlatformCourse).toHaveBeenCalledOnce();
    expect(api.setPlatformCourseCover).toHaveBeenCalledTimes(2);
  });

  it('rejects a cover larger than two megabytes before uploading', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.upload(screen.getByLabelText('Adicionar capa'),
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.');
    expect(screen.queryByAltText('Prévia da capa do curso')).not.toBeInTheDocument();
    expect(api.setPlatformCourseCover).not.toHaveBeenCalled();
  });

  it('uploads a library video from the videos tab, closes the dialog and refreshes', async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPlatformVideo).mockResolvedValue(makeVideo('v-3', 'Boas-vindas'));
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('tab', { name: /Vídeos/ }));
    await user.click(screen.getByRole('button', { name: '+ Enviar vídeo' }));
    await user.type(screen.getByLabelText('Título do vídeo'), 'Boas-vindas');
    await user.type(screen.getByLabelText('Duração (segundos)'), '90');
    await user.upload(
      screen.getByLabelText('Arquivo de vídeo'),
      new File(['video'], 'boas-vindas.mp4', { type: 'video/mp4' }),
    );
    const submit = screen.getByRole('button', { name: 'Enviar vídeo' });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest('form')!);

    expect(await screen.findByRole('status')).toHaveTextContent('O vídeo "Boas-vindas" foi enviado ao catálogo.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Enviar vídeo' })).not.toBeInTheDocument();
    expect(api.uploadPlatformVideo).toHaveBeenCalledWith('Boas-vindas', 90000, expect.any(File), undefined);
    await waitFor(() => expect(api.listPlatformCourses).toHaveBeenCalledTimes(2));
  });

  it('suggests the video title from the chosen file name', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('tab', { name: /Vídeos/ }));
    await user.click(screen.getByRole('button', { name: '+ Enviar vídeo' }));
    await user.upload(
      screen.getByLabelText('Arquivo de vídeo'),
      new File(['video'], 'uso_de-epi.mp4', { type: 'video/mp4' }),
    );

    expect(screen.getByLabelText('Título do vídeo')).toHaveValue('Uso de epi');
  });

  it('sends people with an existing training to the video library', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPlatformCourses).mockResolvedValue([]);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: /Tenho um treinamento já existente/ }));
    expect(screen.getByRole('tab', { name: /Vídeos/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Abertura')).toBeVisible();
  });

  it('creates a game from the games tab dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createGameModule).mockResolvedValue(memoryModule);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('tab', { name: /Jogos e perguntas/ }));
    await user.click(screen.getByRole('button', { name: '+ Novo jogo' }));
    const dialog = screen.getByRole('dialog', { name: 'Novo jogo' });
    await user.type(within(dialog).getByLabelText('Nome do jogo'), 'Quiz de EPI');
    await user.type(within(dialog).getByLabelText('Texto da pergunta 1'), 'Qual EPI protege a cabeça?');
    await user.type(within(dialog).getByLabelText('Alternativas da pergunta 1'), 'Capacete{Enter}Luva');
    await user.click(within(dialog).getByRole('button', { name: 'Criar jogo' }));

    expect(api.createGameModule).toHaveBeenCalledWith({
      title: 'Quiz de EPI',
      gameType: 'Quiz',
      questions: [{ text: 'Qual EPI protege a cabeça?', options: ['Capacete', 'Luva'], correctIndex: 0 }],
      content: null,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('O jogo "Quiz de EPI" foi criado.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before removing a game that courses use', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listGameModules).mockResolvedValue([{ ...memoryModule, usageCount: 2 }]);
    vi.mocked(api.deleteGameModule).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('tab', { name: /Jogos e perguntas/ }));
    await user.click(screen.getByRole('button', { name: `Remover jogo ${memoryModule.title}` }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('2 cursos'));
    expect(api.deleteGameModule).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: `Remover jogo ${memoryModule.title}` }));
    expect(api.deleteGameModule).toHaveBeenCalledWith('g-1');
    confirm.mockRestore();
  });

  it('filters courses by name and status', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);

    await screen.findByText('Ergonomia');
    await user.type(screen.getByLabelText('Buscar curso'), 'incêndio');
    expect(screen.queryByText('Ergonomia')).not.toBeInTheDocument();
    expect(screen.getByText('Combate a incêndio')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar curso'));
    await user.selectOptions(screen.getByLabelText('Status'), 'Published');
    expect(screen.getByText('Ergonomia')).toBeInTheDocument();
    expect(screen.queryByText('Combate a incêndio')).not.toBeInTheDocument();
  });

  it('duplicates a course and opens the copy', async () => {
    const user = userEvent.setup();
    const copy = { ...ergonomics, id: 'c-3', title: 'Ergonomia (cópia)', status: 'Draft' as const };
    vi.mocked(api.duplicatePlatformCourse).mockResolvedValue(copy);
    vi.mocked(api.listPlatformCourses)
      .mockResolvedValueOnce([ergonomics, fire])
      .mockResolvedValueOnce([ergonomics, fire, copy]);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Duplicar curso Ergonomia' }));

    expect(api.duplicatePlatformCourse).toHaveBeenCalledWith('c-1');
    expect(await screen.findByRole('heading', { name: 'Ergonomia (cópia)', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('foi criado como rascunho');
  });

  it('uploads a course cover as soon as a photo is chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setPlatformCourseCover).mockResolvedValue({ ...ergonomics, coverUrl: '/cover?v=1' });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' }));
    await user.click(screen.getByRole('button', { name: 'Configurar' }));
    expect(screen.getByRole('heading', { name: 'Detalhes do curso' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Informações e preferências' })).toBeVisible();
    expect(screen.getByText('PRÉVIA DA CAPA')).toBeVisible();
    const photo = new File(['img'], 'capa.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Escolher foto'), photo);

    expect(api.setPlatformCourseCover).toHaveBeenCalledWith('c-1', photo);
    expect(await screen.findByRole('status')).toHaveTextContent('A foto do curso foi atualizada.');
  });

  it('reorders the videos of a course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setPlatformCourseVideos).mockResolvedValue({
      ...ergonomics,
      videos: [closing, opening],
    });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' }));
    await user.click(screen.getByRole('button', { name: 'Mover Abertura para baixo' }));

    expect(api.setPlatformCourseVideos).toHaveBeenCalledWith('c-1', ['v-2', 'v-1']);
    expect(screen.getByRole('button', { name: 'Mover Abertura para cima' })).toBeDisabled();
  });

  it('saves gamification and status changes of a course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockResolvedValue({ ...fire, gamificationEnabled: true, gameType: 'Puzzle' });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Abrir curso Combate a incêndio' }));
    await user.click(screen.getByRole('button', { name: 'Configurar' }));
    await user.click(screen.getByLabelText(/Gamificação após os vídeos/));
    await user.click(screen.getByLabelText(/Quebra-cabeça/));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(api.updatePlatformCourse).toHaveBeenCalledWith('c-2', {
      title: 'Combate a incêndio',
      description: null,
      status: 'Draft',
      gamificationEnabled: true,
      gameType: 'Puzzle',
    });
  });

  it('shows existing courses directly without opening a popup', async () => {
    render(<PlatformCoursesPage />);
    expect(await screen.findByRole('heading', { name: 'Cursos', level: 1 })).toBeVisible();
    expect(screen.getByText('2 cursos no catálogo da plataforma')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Abrir curso Combate a incêndio' })).toBeVisible();
    expect(screen.getByText('2 vídeos · 3:00')).toBeVisible();
    expect(screen.queryByText('Postura')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas as opções' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show empty choices while loading', () => {
    vi.mocked(api.listPlatformCourses).mockReturnValue(new Promise(() => {}));
    render(<PlatformCoursesPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando catálogo');
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
  });

  it('distinguishes a filtered empty result from an empty catalog', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    await user.type(await screen.findByLabelText('Buscar curso'), 'inexistente');
    expect(screen.getByText('Nenhum curso corresponde aos filtros.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar curso'));
    expect(screen.getByRole('button', { name: 'Abrir curso Ergonomia' })).toBeVisible();
  });

  it('opens the dedicated editor route and previews the selected video', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    expect(await screen.findByRole('heading', { name: 'Ergonomia' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText('Prévia de Abertura')).toHaveAttribute('src', '/videos/v-1');
    await user.click(screen.getByRole('button', { name: 'Encerramento' }));
    expect(screen.getByLabelText('Prévia de Encerramento')).toHaveAttribute('src', '/videos/v-2');
    await user.click(screen.getByRole('button', { name: 'Desktop' }));
    expect(screen.getByRole('button', { name: 'Desktop' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Próximo: Configurar →' }));
    expect(screen.getByRole('button', { name: 'Configurar' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveTextContent('1');
    expect(screen.getByLabelText('Nome do curso')).toHaveValue('Ergonomia');
    await user.click(screen.getByRole('button', { name: 'Próximo: Publicar →' }));
    const review = screen.getByRole('region', { name: 'Revisar e publicar' });
    expect(review).toBeVisible();
    expect(within(review).getByRole('heading', { name: 'Detalhes do curso' })).toBeVisible();
    expect(within(review).getByRole('heading', { name: 'Publicação no catálogo' })).toBeVisible();
    expect(within(review).getByText('Título').parentElement).toHaveTextContent('Ergonomia');
    expect(within(review).getByText('2 vídeos')).toBeVisible();
    expect(within(review).getByText('Ativada após os vídeos')).toBeVisible();
    expect(within(review).getByText('No catálogo')).toBeVisible();
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  it('explains where optional activities appear and how to configure a video question', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listGameModules).mockResolvedValue([memoryModule]);
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');

    await user.click(await screen.findByRole('button', { name: 'Configurar atividades' }));
    const dialog = screen.getByRole('dialog', { name: 'Atividades e perguntas' });
    expect(within(dialog).getByRole('heading', { name: 'Atividade entre vídeos' })).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: 'Atividade durante o vídeo' })).toBeVisible();
    expect(within(dialog).getByText('Sem pontos · nunca bloqueia o progresso')).toBeVisible();
    expect(within(dialog).getByLabelText('Atividade')).toBeVisible();
    expect(within(dialog).getByLabelText('Quando exibir')).toHaveValue('2');
    expect(within(dialog).getByRole('button', { name: 'Adicionar à trilha' })).toBeDisabled();

    await user.selectOptions(within(dialog).getByLabelText('Atividade'), 'g-1');
    expect(within(dialog).getByRole('button', { name: 'Adicionar à trilha' })).toBeEnabled();
    const firstVideo = within(dialog).getByText('Vídeo 1 · Abertura').closest('details')!;
    expect(firstVideo).not.toHaveAttribute('open');
    await user.click(within(dialog).getByText('Vídeo 1 · Abertura'));
    expect(firstVideo).toHaveAttribute('open');
    expect(within(firstVideo).getByLabelText('Prévia de Abertura')).toBeVisible();
    expect(within(firstVideo).getByLabelText('Momento do vídeo (segundos)')).toBeVisible();
    expect(within(firstVideo).getByLabelText('Atividade a exibir')).toBeVisible();
  });

  it('recovers from a media failure in the editor preview', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    const video = await screen.findByLabelText('Prévia de Abertura');
    fireEvent.error(video);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o vídeo.');
    expect(screen.queryByLabelText('Prévia de Abertura')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar reproduzir novamente' }));
    expect(screen.getByLabelText('Prévia de Abertura')).toHaveAttribute('src', '/videos/v-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  it('shows missing course rather than the empty catalog', async () => {
    render(<PlatformCoursesPage />, '/platform/courses/missing/edit');
    expect(await screen.findByText('Curso não encontrado.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
  });

  it('keeps unsaved settings on failure and asks before leaving', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockRejectedValue(new Error('Falha ao salvar.'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    await user.clear(screen.getByLabelText('Nome do curso'));
    await user.type(screen.getByLabelText('Nome do curso'), 'Ergonomia revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar.');
    expect(screen.getByLabelText('Nome do curso')).toHaveValue('Ergonomia revisada');
    expect(screen.getByText('Alterações não salvas')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '← Voltar ao conteúdo' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Nome do curso')).toBeVisible();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '← Voltar ao conteúdo' }));
    expect(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' })).toBeVisible();
    confirm.mockRestore();
  });

  it('publishes the reviewed settings only on explicit publication and reloads them', async () => {
    const user = userEvent.setup();
    const draft = { ...ergonomics, status: 'Draft' as const };
    vi.mocked(api.listPlatformCourses).mockResolvedValue([draft]);
    vi.mocked(api.updatePlatformCourse).mockImplementation(async (_id, request) => {
      const saved = { ...ergonomics, ...request };
      vi.mocked(api.listPlatformCourses).mockResolvedValue([saved]);
      return saved;
    });
    const view = render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    await user.clear(screen.getByLabelText('Nome do curso'));
    await user.type(screen.getByLabelText('Nome do curso'), 'Revisado');
    await user.click(screen.getByLabelText(/Gamificação após os vídeos/));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Publicar agora' }));
    await waitFor(() => expect(api.updatePlatformCourse).toHaveBeenCalledWith('c-1', {
      title: 'Revisado', description: 'Postura', status: 'Published', gamificationEnabled: false, gameType: 'Quiz',
    }));
    expect(await screen.findByText('Publicado')).toBeVisible();
    view.unmount();
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    expect(screen.getByLabelText('Nome do curso')).toHaveValue('Revisado');
    expect(screen.getByLabelText(/Gamificação após os vídeos/)).not.toBeChecked();
  });

  it('blocks publishing a course without videos', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />, '/platform/courses/c-2/edit');
    await user.click(await screen.findByRole('button', { name: 'Publicar' }));
    expect(screen.getByText('Adicione ao menos um vídeo antes de publicar.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publicar agora' })).toBeDisabled();
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  it('protects browser reload only while settings are unsaved', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockResolvedValue({ ...ergonomics, title: 'Revisado' });
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await user.clear(screen.getByLabelText('Nome do curso'));
    await user.type(screen.getByLabelText('Nome do curso'), 'Revisado');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Salvo')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });

  it('rejects a whitespace title without sending an update', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    await user.clear(screen.getByLabelText('Nome do curso'));
    await user.type(screen.getByLabelText('Nome do curso'), '   ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome do curso antes de salvar.');
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  it('uses the saved server values and allows retry when refreshing after a save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockResolvedValue({ ...ergonomics, title: 'Revisado' });
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    await user.clear(screen.getByLabelText('Nome do curso'));
    await user.type(screen.getByLabelText('Nome do curso'), ' Revisado ');
    vi.mocked(api.listPlatformCourses).mockRejectedValueOnce(new Error('Falha ao atualizar catálogo.'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao atualizar catálogo.');
    expect(screen.getByLabelText('Nome do curso')).toHaveValue('Revisado');
    expect(screen.queryByText('As alterações do curso foram salvas.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('status')).toHaveTextContent('As alterações do curso foram salvas.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can enable gamification during course creation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: '+ Criar curso' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Novo curso');
    await user.click(screen.getByLabelText('Gamificação após os vídeos'));
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(api.createPlatformCourse).toHaveBeenCalledWith({
      title: 'Novo curso', description: 'Opção 1', gamificationEnabled: true,
    });
  });
});
