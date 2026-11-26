import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderView, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import PlatformCoursesPage from './PlatformCoursesPage';
import * as api from './api';

function render(element: ReactElement, path = '/platform/courses') {
  return renderView(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/platform/videos" element={<p>Biblioteca de vídeos aberta</p>} />
    <Route path="/platform/courses" element={element} />
    <Route path="/platform/courses/:courseId" element={<p>Tela de dias aberta</p>} />
    <Route path="/platform/courses/:courseId/edit" element={element} />
  </Routes></MemoryRouter>);
}

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    createGameModule: vi.fn(),
    createCourseCategory: vi.fn(),
    deleteCourseCategory: vi.fn(),
    listCourseCategories: vi.fn(),
    renameCourseCategory: vi.fn(),
    setCourseCategory: vi.fn(),
    createSipatProgram: vi.fn(),
    deleteSipatProgram: vi.fn(),
    deletePlatformCourse: vi.fn(),
    deletePlatformVideo: vi.fn(),
    listSipatPrograms: vi.fn(),
    updateSipatProgram: vi.fn(),
    createPlatformCourse: vi.fn(),
    deleteGameModule: vi.fn(),
    duplicatePlatformCourse: vi.fn(),
    listGameModules: vi.fn(),
    listPlatformCourses: vi.fn(),
    listPlatformLibraryVideos: vi.fn(),
    setPlatformCourseCover: vi.fn(),
    setPlatformCourseModules: vi.fn(),
    setPlatformCourseStructure: vi.fn(),
    setPlatformCourseVideos: vi.fn(),
    updatePlatformCourse: vi.fn(),
    uploadPlatformVideo: vi.fn(),
    createExternalPlatformVideo: vi.fn(),
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
    status: 'Ready',
    processingError: null,
    hasSd480: true,
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
  sessionStorage.clear();
  vi.mocked(api.createPlatformCourse).mockReset();
  vi.mocked(api.setPlatformCourseCover).mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:course-cover') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(api.listGameModules).mockReset().mockResolvedValue([]);
  vi.mocked(api.listCourseCategories).mockReset().mockResolvedValue([
    { id: 'cat-food', name: 'Alimentação', courseCount: 0 },
    { id: 'cat-safe', name: 'Segurança no trabalho', courseCount: 0 },
  ]);
  vi.mocked(api.createCourseCategory).mockReset();
  vi.mocked(api.setCourseCategory).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.renameCourseCategory).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.deleteCourseCategory).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.listSipatPrograms).mockReset().mockResolvedValue([]);
  vi.mocked(api.createSipatProgram).mockReset();
  vi.mocked(api.updateSipatProgram).mockReset();
  vi.mocked(api.deleteSipatProgram).mockReset();
  vi.mocked(api.deletePlatformCourse).mockReset();
  vi.mocked(api.deletePlatformVideo).mockReset();
  vi.mocked(api.listPlatformCourses).mockReset().mockResolvedValue([ergonomics, fire]);
  vi.mocked(api.listPlatformLibraryVideos).mockReset().mockResolvedValue([
    { video: opening, courseCount: 1 },
    { video: closing, courseCount: 1 },
  ]);
  vi.mocked(api.uploadPlatformVideo).mockReset();
  vi.mocked(api.createExternalPlatformVideo).mockReset();
  vi.mocked(api.duplicatePlatformCourse).mockReset();
  vi.mocked(api.setPlatformCourseVideos).mockReset();
  vi.mocked(api.setPlatformCourseStructure).mockReset();
  vi.mocked(api.setPlatformCourseModules).mockReset();
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
    expect(screen.queryByRole('heading', { name: 'Ergonomia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('opens the details popup, traps keyboard focus and restores the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    const trigger = screen.getByRole('button', { name: 'Criar treinamento' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Detalhes do treinamento' });
    expect(within(dialog).getByLabelText('Título (obrigatório)')).toHaveFocus();
    within(dialog).getByRole('button', { name: 'Fechar detalhes do treinamento' }).focus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Criar' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Fechar detalhes do treinamento' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(api.createPlatformCourse).not.toHaveBeenCalled();
  });

  it('cancels course creation without saving a draft', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Treinamento não salvo');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createPlatformCourse).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Criar treinamento' })).toHaveFocus();
  });

  it('prevents closing the popup while course creation is pending', async () => {
    const user = userEvent.setup();
    let finish!: (course: api.PlatformCourse) => void;
    vi.mocked(api.createPlatformCourse).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Combate a incêndio');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fechar detalhes do treinamento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    finish(fire);
    // a new template opens on its days
    expect(await screen.findByText('Tela de dias aberta')).toBeVisible();
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

    expect(await screen.findByRole('link', { name: 'Abrir Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.listPlatformCourses).toHaveBeenCalledTimes(2);
  });

  it('creates a course with its cover and opens the focused content editor', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    vi.mocked(api.setPlatformCourseCover).mockResolvedValue({ ...fire, coverUrl: '/new-cover.png' });
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    const photo = new File(['cover'], 'capa.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Adicionar capa'), photo);
    expect(await screen.findByAltText('Prévia da capa do treinamento')).toHaveAttribute('src', 'blob:course-cover');
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Combate a incêndio');
    await user.type(screen.getByLabelText('Descrição'), 'Treinamento inicial');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(api.createPlatformCourse).toHaveBeenCalledWith({
      title: 'Combate a incêndio', description: 'Treinamento inicial', gamificationEnabled: false,
    });

    expect(api.setPlatformCourseCover).toHaveBeenCalledWith('c-2', photo);
    expect(await screen.findByText('Tela de dias aberta')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do treinamento')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Título do vídeo')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:course-cover');
  });

  it('creates a course inside the chosen category', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.selectOptions(await screen.findByLabelText('Categoria'), 'cat-food');
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Qualidade do sono');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(api.createPlatformCourse).toHaveBeenCalledWith({
      title: 'Qualidade do sono', description: null, gamificationEnabled: false,
    });
    expect(api.setCourseCategory).toHaveBeenCalledWith('c-2', 'cat-food');
  });

  it('creates a new category right from the subject form, without leaving it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createCourseCategory).mockResolvedValue({ id: 'cat-new', name: 'Ergonomia', courseCount: 0 });
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.selectOptions(await screen.findByLabelText('Categoria'), '__create__');
    await user.type(screen.getByLabelText('Nome da nova categoria'), 'Ergonomia{Enter}');

    expect(api.createCourseCategory).toHaveBeenCalledWith('Ergonomia');
    expect(await screen.findByRole('option', { name: 'Ergonomia' })).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toHaveValue('cat-new');
  });

  it('manages the categories in a dialog over the library: rename and delete', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PlatformCoursesPage />);
    await user.click(await screen.findByRole('button', { name: 'Gerenciar categorias' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Alimentação')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Renomear Alimentação' }));
    const field = within(dialog).getByLabelText('Novo nome de Alimentação');
    await user.clear(field);
    await user.type(field, 'Nutrição');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar nome' }));
    expect(api.renameCourseCategory).toHaveBeenCalledWith('cat-food', 'Nutrição');

    await user.click(within(dialog).getByRole('button', { name: 'Excluir Segurança no trabalho' }));
    expect(api.deleteCourseCategory).toHaveBeenCalledWith('cat-safe');
  });

  it('filters catalog records by category', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPlatformCourses).mockResolvedValue([
      { ...ergonomics, categoryId: 'cat-food' },
      { ...fire, categoryId: 'cat-safe' },
    ]);
    render(<PlatformCoursesPage />);
    expect(await screen.findByRole('link', { name: 'Abrir Ergonomia' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir Combate a incêndio' })).toBeVisible();

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Filtrar por categoria' }), 'cat-food');
    expect(screen.getByRole('link', { name: 'Abrir Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Abrir Combate a incêndio' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por categoria' }), 'cat-safe');
    expect(screen.queryByRole('link', { name: 'Abrir Ergonomia' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Combate a incêndio' })).toBeVisible();
  });

  it('shows creation errors inside the popup and preserves the entered title', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockRejectedValue(new Error('Não foi possível criar o treinamento.'));
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Segurança');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    const dialog = screen.getByRole('dialog', { name: 'Detalhes do treinamento' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível criar o treinamento.');
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
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.upload(screen.getByLabelText('Adicionar capa'), new File(['cover'], 'capa.png', { type: 'image/png' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Combate a incêndio');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O treinamento foi criado, mas não foi possível salvar a capa.');
    await user.click(screen.getByRole('button', { name: 'Tentar salvar capa' }));

    expect(await screen.findByText('Tela de dias aberta')).toBeVisible();
    expect(api.createPlatformCourse).toHaveBeenCalledOnce();
    expect(api.setPlatformCourseCover).toHaveBeenCalledTimes(2);
  });

  it('rejects a cover larger than two megabytes before uploading', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.upload(screen.getByLabelText('Adicionar capa'),
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.');
    expect(screen.queryByAltText('Prévia da capa do treinamento')).not.toBeInTheDocument();
    expect(api.setPlatformCourseCover).not.toHaveBeenCalled();
  });

  it('sends people with an existing training to the video library', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPlatformCourses).mockResolvedValue([]);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: /Tenho um treinamento já existente/ }));
    expect(await screen.findByText('Biblioteca de vídeos aberta')).toBeVisible();
  });

  it('creates a game from the games tab dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createGameModule).mockResolvedValue(memoryModule);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('tab', { name: /Jogos e perguntas/ }));
    await user.click(screen.getByRole('button', { name: 'Novo jogo' }));
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
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('2 treinamentos'));
    expect(api.deleteGameModule).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: `Remover jogo ${memoryModule.title}` }));
    expect(api.deleteGameModule).toHaveBeenCalledWith('g-1');
    confirm.mockRestore();
  });

  it('keeps the search when moving between the tabs and filters each list by it', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);
    await screen.findByRole('heading', { name: 'Ergonomia' });
    await user.type(screen.getByLabelText('Buscar treinamento'), 'Enc');

    await user.click(screen.getByRole('tab', { name: /Jogos e perguntas/ }));
    // the same text still filters, now the games
    expect(screen.getByLabelText('Buscar jogo')).toHaveValue('Enc');

    await user.click(screen.getByRole('tab', { name: /Treinamentos/ }));
    expect(screen.getByLabelText('Buscar treinamento')).toHaveValue('Enc');
  });

  it('opens the library the way it was left after leaving to another screen', async () => {
    const user = userEvent.setup();
    const first = render(<PlatformCoursesPage />);
    await screen.findByRole('heading', { name: 'Ergonomia' });
    await user.type(screen.getByLabelText('Buscar treinamento'), 'incêndio');
    await user.selectOptions(screen.getByLabelText('Filtrar por categoria'), 'cat-safe');
    first.unmount();

    render(<PlatformCoursesPage />);
    expect(await screen.findByLabelText('Buscar treinamento')).toHaveValue('incêndio');
    expect(screen.getByLabelText('Filtrar por categoria')).toHaveValue('cat-safe');
  });

  it('does not repeat in the header the numbers the tabs already show', async () => {
    render(<PlatformCoursesPage />);
    await screen.findByRole('heading', { name: 'Ergonomia' });
    expect(screen.queryByRole('list', { name: 'Resumo do acervo' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Treinamentos/ })).toHaveTextContent('2');
  });

  it('filters courses by name and status', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);

    await screen.findByRole('heading', { name: 'Ergonomia' });
    await user.type(screen.getByLabelText('Buscar treinamento'), 'incêndio');
    expect(screen.queryByRole('heading', { name: 'Ergonomia' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Combate a incêndio' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar treinamento'));
    await user.selectOptions(screen.getByLabelText('Fase'), 'published');
    expect(screen.getByRole('heading', { name: 'Ergonomia' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Combate a incêndio' })).not.toBeInTheDocument();
  });

  it('duplicates a course and opens the copy', async () => {
    const user = userEvent.setup();
    const copy = { ...ergonomics, id: 'c-3', title: 'Ergonomia (cópia)', status: 'Draft' as const };
    vi.mocked(api.duplicatePlatformCourse).mockResolvedValue(copy);
    vi.mocked(api.listPlatformCourses)
      .mockResolvedValueOnce([ergonomics, fire])
      .mockResolvedValueOnce([ergonomics, fire, copy]);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Duplicar Ergonomia' }));

    expect(api.duplicatePlatformCourse).toHaveBeenCalledWith('c-1');
    expect(await screen.findByRole('heading', { name: 'Ergonomia (cópia)', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('foi criado como rascunho');
  });

  it('uploads a course cover as soon as a photo is chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setPlatformCourseCover).mockResolvedValue({ ...ergonomics, coverUrl: '/cover?v=1' });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar treinamento: Ergonomia' }));
    await user.click(screen.getByRole('button', { name: 'Configurar' }));
    expect(screen.getByRole('heading', { name: 'Detalhes do treinamento' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Informações e preferências' })).toBeVisible();
    expect(screen.getByText('PRÉVIA DA CAPA')).toBeVisible();
    const photo = new File(['img'], 'capa.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Escolher foto'), photo);

    expect(api.setPlatformCourseCover).toHaveBeenCalledWith('c-1', photo);
    expect(await screen.findByRole('status')).toHaveTextContent('A foto do treinamento foi atualizada.');
  });

  it('reorders the videos of a course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setPlatformCourseStructure).mockResolvedValue({
      ...ergonomics,
      videos: [closing, opening],
    });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar treinamento: Ergonomia' }));
    await user.click(screen.getByRole('button', { name: 'Mover Abertura para baixo' }));

    expect(api.setPlatformCourseStructure).toHaveBeenCalledWith('c-1', [
      expect.objectContaining({
        title: 'Título 1',
        videos: [{ videoId: 'v-2', title: null }, { videoId: 'v-1', title: null }],
      }),
    ]);
    expect(screen.getByRole('button', { name: 'Mover Abertura para cima' })).toBeDisabled();
  });

  it('edits course-only video titles straight from the flat list of videos', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setPlatformCourseStructure).mockResolvedValue(ergonomics);
    render(<PlatformCoursesPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar treinamento: Ergonomia' }));

    const videoTitle = screen.getByLabelText('Título do vídeo 1');
    await user.clear(videoTitle);
    await user.type(videoTitle, 'Boas-vindas{Enter}');
    expect(api.setPlatformCourseStructure).toHaveBeenLastCalledWith('c-1', [
      expect.objectContaining({ videos: [{ videoId: 'v-1', title: 'Boas-vindas' }, { videoId: 'v-2', title: null }] }),
    ]);

    // the theme is a flat list of videos: there is no lesson level to edit
    expect(screen.queryByRole('button', { name: 'Adicionar aula' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome da aula 1')).not.toBeInTheDocument();
  });

  it('adds an activity right after a video with one click from the track', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listGameModules).mockResolvedValue([memoryModule]);
    vi.mocked(api.setPlatformCourseModules).mockResolvedValue(ergonomics);
    render(<PlatformCoursesPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar treinamento: Ergonomia' }));

    const buttons = screen.getAllByRole('button', { name: 'Atividade depois deste vídeo' });
    await user.click(buttons[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar atividade' });
    await user.click(within(dialog).getByRole('button', { name: new RegExp(memoryModule.title) }));

    expect(api.setPlatformCourseModules).toHaveBeenCalledWith('c-1', [
      ...ergonomics.modules,
      { moduleId: memoryModule.id, afterVideoCount: 1 },
    ]);
  });

  it('creates a game right inside the activity dialog and puts it in the sequence', async () => {
    const user = userEvent.setup();
    const created = { ...memoryModule, id: 'm-new', title: 'Quiz de postura' };
    vi.mocked(api.createGameModule).mockResolvedValue(created);
    vi.mocked(api.setPlatformCourseModules).mockResolvedValue(ergonomics);
    render(<PlatformCoursesPage />);
    await user.click(await screen.findByRole('button', { name: 'Editar treinamento: Ergonomia' }));

    await user.click(screen.getAllByRole('button', { name: 'Atividade depois deste vídeo' })[0]);
    await user.click(within(await screen.findByRole('dialog', { name: 'Adicionar atividade' })).getByRole('button', { name: 'Criar jogo' }));
    const form = await screen.findByRole('dialog', { name: 'Novo jogo' });
    await user.type(within(form).getByLabelText('Nome do jogo'), 'Quiz de postura');
    await user.type(within(form).getByLabelText('Texto da pergunta 1'), 'Qual a postura certa?');
    await user.type(within(form).getByLabelText('Alternativas da pergunta 1'), 'Reta{Enter}Curvada');
    await user.click(within(form).getByRole('button', { name: 'Criar jogo' }));

    expect(api.createGameModule).toHaveBeenCalled();
    expect(api.setPlatformCourseModules).toHaveBeenCalledWith('c-1', [
      ...ergonomics.modules,
      { moduleId: 'm-new', afterVideoCount: 1 },
    ]);
  });

  it('saves gamification and status changes of a course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockResolvedValue({ ...fire, gamificationEnabled: true, gameType: 'Puzzle' });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar treinamento: Combate a incêndio' }));
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
    expect(await screen.findByRole('heading', { name: 'Conteúdos', level: 1 })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /Vídeos/ })).not.toBeInTheDocument();
    expect(screen.getByText('2 treinamentos, entre templates e os das empresas')).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Abrir Ergonomia' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir Combate a incêndio' })).toBeVisible();
    expect(screen.getByText('2 vídeos · 3 min')).toBeVisible();
    expect(screen.queryByText('Postura')).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Filtrar por categoria' })).toHaveValue('all');
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
    await user.type(await screen.findByLabelText('Buscar treinamento'), 'inexistente');
    expect(screen.getByText('Nenhum treinamento corresponde aos filtros.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar treinamento'));
    expect(screen.getByRole('link', { name: 'Abrir Ergonomia' })).toBeVisible();
  });

  it('opens the dedicated editor route and previews the selected video', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    expect(await screen.findByRole('heading', { name: 'Ergonomia' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText('Prévia de Abertura')).toHaveAttribute('src', '/videos/v-1');
    await user.click(screen.getByLabelText('Título do vídeo 2'));
    expect(screen.getByLabelText('Prévia de Encerramento')).toHaveAttribute('src', '/videos/v-2');
    await user.click(screen.getByRole('button', { name: 'Desktop' }));
    expect(screen.getByRole('button', { name: 'Desktop' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Próximo: Configurar →' }));
    expect(screen.getByRole('button', { name: 'Configurar' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveTextContent('1');
    expect(screen.getByLabelText('Nome do treinamento')).toHaveValue('Ergonomia');
    await user.click(screen.getByRole('button', { name: 'Próximo: Publicar →' }));
    const review = screen.getByRole('region', { name: 'Revisar e publicar' });
    expect(review).toBeVisible();
    expect(within(review).getByRole('heading', { name: 'Detalhes do treinamento' })).toBeVisible();
    expect(within(review).getByRole('heading', { name: 'Publicação no catálogo' })).toBeVisible();
    expect(within(review).getByText('Título').parentElement).toHaveTextContent('Ergonomia');
    expect(within(review).getByText('2 vídeos')).toBeVisible();
    expect(within(review).getByText('Ativada após os vídeos')).toBeVisible();
    expect(within(review).getByText('No catálogo')).toBeVisible();
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  describe('extras (YouTube and Vimeo)', () => {
    const extra: api.PlatformCourseVideo = {
      ...makeVideo('v-9', 'Dicas de postura'), provider: 'YouTube', externalId: 'dQw4w9WgXcQ',
      fileUrl: '', durationMilliseconds: 0, contentType: 'video/external',
    };

    async function openAddVideo(user: ReturnType<typeof userEvent.setup>) {
      render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
      await user.click((await screen.findAllByRole('button', { name: 'Adicionar vídeo' }))[0]);
      return screen.findByRole('dialog', { name: 'Adicionar vídeo' });
    }

    it('swaps the library for the link form when YouTube is chosen', async () => {
      const user = userEvent.setup();
      vi.mocked(api.listPlatformLibraryVideos).mockResolvedValue([{ video: opening, courseCount: 1 }, { video: closing, courseCount: 1 }, { video: makeVideo('v-7', 'Pronto'), courseCount: 0 }]);
      const dialog = await openAddVideo(user);
      expect(within(dialog).getByRole('button', { name: 'Nosso vídeo' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(dialog).getByLabelText('Vincular da biblioteca')).toBeVisible();

      await user.click(within(dialog).getByRole('button', { name: 'YouTube' }));

      expect(within(dialog).getByLabelText('Link do vídeo')).toBeVisible();
      expect(within(dialog).getByLabelText('Título')).toBeVisible();
      expect(within(dialog).getByLabelText('Duração (min)')).toBeVisible();
      expect(within(dialog).queryByLabelText('Vincular da biblioteca')).not.toBeInTheDocument();
      expect(within(dialog).getByText('Conta no progresso e no certificado: o participante assiste em sequência, sem pular.')).toBeVisible();
    });

    it('keeps Adicionar disabled while the link does not parse and previews it once it does', async () => {
      const user = userEvent.setup();
      const dialog = await openAddVideo(user);
      await user.click(within(dialog).getByRole('button', { name: 'YouTube' }));
      await user.type(within(dialog).getByLabelText('Título'), 'Dicas de postura');
      await user.type(within(dialog).getByLabelText('Link do vídeo'), 'https://example.com/abc');
      expect(within(dialog).getByRole('button', { name: 'Adicionar' })).toBeDisabled();
      expect(dialog.querySelector('iframe')).toBeNull();

      await user.clear(within(dialog).getByLabelText('Link do vídeo'));
      await user.type(within(dialog).getByLabelText('Link do vídeo'), 'https://youtu.be/dQw4w9WgXcQ');
      await user.type(within(dialog).getByLabelText('Duração (min)'), '10');
      expect(within(dialog).getByRole('button', { name: 'Adicionar' })).toBeEnabled();
      expect(dialog.querySelector('iframe')).toHaveAttribute('src', expect.stringContaining('/embed/dQw4w9WgXcQ'));
      expect(within(dialog).getByText(/Não abriu\?/)).toBeVisible();
    });

    it('creates the external video and links it to the Treinamento', async () => {
      const user = userEvent.setup();
      vi.mocked(api.createExternalPlatformVideo).mockResolvedValue(extra);
      vi.mocked(api.setPlatformCourseStructure).mockResolvedValue({ ...ergonomics, videos: [opening, closing, extra] });
      const dialog = await openAddVideo(user);
      await user.click(within(dialog).getByRole('button', { name: 'YouTube' }));
      await user.type(within(dialog).getByLabelText('Link do vídeo'), 'https://youtu.be/dQw4w9WgXcQ');
      await user.type(within(dialog).getByLabelText('Título'), 'Dicas de postura');
      await user.type(within(dialog).getByLabelText('Duração (min)'), '10');
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

      await waitFor(() => expect(api.createExternalPlatformVideo).toHaveBeenCalledWith({
        provider: 'YouTube', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Dicas de postura', durationMilliseconds: 600000,
      }));
      await waitFor(() => expect(api.setPlatformCourseStructure).toHaveBeenCalledWith('c-1', [
        expect.objectContaining({ videos: [{ videoId: 'v-1', title: null }, { videoId: 'v-2', title: null }, { videoId: 'v-9', title: null }] }),
      ]));
    });

    it('creates the external video once when submitted twice in the same tick', async () => {
      const user = userEvent.setup();
      vi.mocked(api.createExternalPlatformVideo).mockReturnValue(new Promise(() => {}));
      const dialog = await openAddVideo(user);
      await user.click(within(dialog).getByRole('button', { name: 'YouTube' }));
      await user.type(within(dialog).getByLabelText('Link do vídeo'), 'https://youtu.be/dQw4w9WgXcQ');
      await user.type(within(dialog).getByLabelText('Título'), 'Dicas');
      await user.type(within(dialog).getByLabelText('Duração (min)'), '10');
      const form = within(dialog).getByLabelText('Título').closest('form') as HTMLFormElement;
      fireEvent.submit(form);
      fireEvent.submit(form);
      expect(api.createExternalPlatformVideo).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'YouTube' })).toBeDisabled());
    });

    it('does not let an Treinamento with only an extra pass the video checklist or publish', async () => {
      const user = userEvent.setup();
      vi.mocked(api.listPlatformCourses).mockResolvedValue([{ ...ergonomics, status: 'Draft', videos: [extra] }, fire]);
      render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
      await user.click(await screen.findByRole('button', { name: 'Publicar' }));
      expect(screen.getByText('Adicione ao menos um vídeo antes de publicar.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Publicar agora' })).toBeDisabled();
      expect(api.updatePlatformCourse).not.toHaveBeenCalled();
    });

    it('lets an Treinamento with a house video and an extra pass the checklist as before', async () => {
      const user = userEvent.setup();
      vi.mocked(api.listPlatformCourses).mockResolvedValue([{ ...ergonomics, status: 'Draft', videos: [opening, extra] }, fire]);
      render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
      await user.click(await screen.findByRole('button', { name: 'Publicar' }));
      expect(screen.queryByText('Adicione ao menos um vídeo antes de publicar.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Publicar agora' })).toBeEnabled();
    });

    it('sends whole minutes as milliseconds', async () => {
      const user = userEvent.setup();
      vi.mocked(api.createExternalPlatformVideo).mockResolvedValue({ ...extra, provider: 'Vimeo', externalId: '123456789' });
      vi.mocked(api.setPlatformCourseStructure).mockResolvedValue(ergonomics);
      const dialog = await openAddVideo(user);
      await user.click(within(dialog).getByRole('button', { name: 'Vimeo' }));
      await user.type(within(dialog).getByLabelText('Link do vídeo'), 'https://vimeo.com/123456789');
      await user.type(within(dialog).getByLabelText('Título'), 'Ergonomia no escritório');
      await user.type(within(dialog).getByLabelText('Duração (min)'), '12');
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

      await waitFor(() => expect(api.createExternalPlatformVideo).toHaveBeenCalledWith({
        provider: 'Vimeo', url: 'https://vimeo.com/123456789', title: 'Ergonomia no escritório', durationMilliseconds: 720000,
      }));
    });

    it('shows the server refusal under the link field and does not link anything', async () => {
      const user = userEvent.setup();
      vi.mocked(api.createExternalPlatformVideo).mockRejectedValue(new Error('Esse vídeo não permite incorporação.'));
      const dialog = await openAddVideo(user);
      await user.click(within(dialog).getByRole('button', { name: 'YouTube' }));
      await user.type(within(dialog).getByLabelText('Link do vídeo'), 'https://youtu.be/dQw4w9WgXcQ');
      await user.type(within(dialog).getByLabelText('Título'), 'Dicas');
      await user.type(within(dialog).getByLabelText('Duração (min)'), '10');
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

      expect(await within(dialog).findByText('Esse vídeo não permite incorporação.')).toBeVisible();
      expect(api.setPlatformCourseStructure).not.toHaveBeenCalled();
    });

    it('marks an extra in the outline, previews it in the provider frame and hides the question controls', async () => {
      const user = userEvent.setup();
      vi.mocked(api.listPlatformCourses).mockResolvedValue([{ ...ergonomics, videos: [opening, extra] }, fire]);
      render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');

      const outline = await screen.findByRole('list', { name: /^Vídeos de / });
      expect(within(outline).getAllByText('Extra')).toHaveLength(1);
      expect(within(outline).getByText('YouTube')).toBeVisible();

      await user.click(screen.getByLabelText('Título do vídeo 2'));
      expect(document.querySelector('iframe')).toHaveAttribute('src', expect.stringContaining('/embed/dQw4w9WgXcQ'));
      const properties = screen.getByRole('complementary', { name: 'Propriedades do conteúdo' });
      expect(within(properties).queryByRole('button', { name: 'Editar perguntas do vídeo' })).not.toBeInTheDocument();
      expect(within(properties).getByText('Vídeo extra: sem duração, não conta no progresso nem no certificado.')).toBeVisible();
    });

    it('offers question moments only for house videos', async () => {
      const user = userEvent.setup();
      vi.mocked(api.listGameModules).mockResolvedValue([memoryModule]);
      vi.mocked(api.listPlatformCourses).mockResolvedValue([{ ...ergonomics, videos: [opening, extra] }, fire]);
      render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');

      await user.click((await screen.findAllByRole('button', { name: 'Configurar atividades' }))[0]);
      const dialog = await screen.findByRole('dialog', { name: 'Atividades e perguntas' });
      expect(within(dialog).getByText('Vídeo 1 · Abertura')).toBeVisible();
      expect(within(dialog).queryByText(/Dicas de postura/, { selector: 'strong' })).not.toBeInTheDocument();
    });

    it('counts only house videos in the summary and appends the extras', async () => {
      vi.mocked(api.listPlatformCourses).mockResolvedValue([{ ...ergonomics, videos: [opening, closing, extra] }, fire]);
      render(<PlatformCoursesPage />);
      expect(await screen.findByText('2 vídeos · 3 min + 1 extra')).toBeVisible();
    });

  });

  it('offers only ready library videos when adding a video to a course', async () => {
    const user = userEvent.setup();
    const processing = { ...makeVideo('v-5', 'Ainda convertendo'), status: 'Processing' as const, hasSd480: false };
    const failed = { ...makeVideo('v-6', 'Conversão com falha'), status: 'Failed' as const, processingError: 'Arquivo inválido.' };
    const ready = makeVideo('v-7', 'Pronto para usar');
    vi.mocked(api.listPlatformLibraryVideos).mockResolvedValue([
      { video: opening, courseCount: 1 }, { video: processing, courseCount: 0 }, { video: failed, courseCount: 0 }, { video: ready, courseCount: 0 },
    ]);
    render(<PlatformCoursesPage />, '/platform/courses/c-2/edit');

    await user.click((await screen.findAllByRole('button', { name: 'Adicionar vídeo' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar vídeo' });
    const options = within(within(dialog).getByLabelText('Vincular da biblioteca')).getAllByRole('option').map(option => option.getAttribute('aria-label'));
    expect(options).toEqual(['Abertura', 'Pronto para usar']);
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
    expect(within(dialog).getByRole('button', { name: 'Adicionar ao treinamento' })).toBeDisabled();

    await user.selectOptions(within(dialog).getByLabelText('Atividade'), 'g-1');
    expect(within(dialog).getByRole('button', { name: 'Adicionar ao treinamento' })).toBeEnabled();
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
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByLabelText('Prévia de Abertura')).toHaveAttribute('src', '/videos/v-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  it('shows missing course rather than the empty catalog', async () => {
    render(<PlatformCoursesPage />, '/platform/courses/missing/edit');
    expect(await screen.findByText('Treinamento não encontrado.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Como deseja começar?' })).not.toBeInTheDocument();
  });

  it('keeps unsaved settings on failure and asks before leaving', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockRejectedValue(new Error('Falha ao salvar.'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    await user.clear(screen.getByLabelText('Nome do treinamento'));
    await user.type(screen.getByLabelText('Nome do treinamento'), 'Ergonomia revisada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar.');
    expect(screen.getByLabelText('Nome do treinamento')).toHaveValue('Ergonomia revisada');
    expect(screen.getByText('Alterações não salvas')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '← Voltar ao conteúdo' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Nome do treinamento')).toBeVisible();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '← Voltar ao conteúdo' }));
    expect(await screen.findByRole('link', { name: 'Abrir Ergonomia' })).toBeVisible();
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
    await user.clear(screen.getByLabelText('Nome do treinamento'));
    await user.type(screen.getByLabelText('Nome do treinamento'), 'Revisado');
    await user.click(screen.getByLabelText(/Gamificação após os vídeos/));
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Publicar agora' }));
    await waitFor(() => expect(api.updatePlatformCourse).toHaveBeenCalledWith('c-1', {
      title: 'Revisado', description: 'Postura', status: 'Published', gamificationEnabled: false, gameType: 'Quiz',
    }));
    // the status and the publish button both say Publicado once nothing is pending
    expect((await screen.findAllByText('Publicado'))[0]).toBeVisible();
    view.unmount();
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    expect(screen.getByLabelText('Nome do treinamento')).toHaveValue('Revisado');
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
    await user.clear(screen.getByLabelText('Nome do treinamento'));
    await user.type(screen.getByLabelText('Nome do treinamento'), 'Revisado');
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
    await user.clear(screen.getByLabelText('Nome do treinamento'));
    await user.type(screen.getByLabelText('Nome do treinamento'), '   ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome do treinamento antes de salvar.');
    expect(api.updatePlatformCourse).not.toHaveBeenCalled();
  });

  it('uses the saved server values and allows retry when refreshing after a save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockResolvedValue({ ...ergonomics, title: 'Revisado' });
    render(<PlatformCoursesPage />, '/platform/courses/c-1/edit');
    await user.click(await screen.findByRole('button', { name: 'Configurar' }));
    await user.clear(screen.getByLabelText('Nome do treinamento'));
    await user.type(screen.getByLabelText('Nome do treinamento'), ' Revisado ');
    vi.mocked(api.listPlatformCourses).mockRejectedValueOnce(new Error('Falha ao atualizar catálogo.'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao atualizar catálogo.');
    expect(screen.getByLabelText('Nome do treinamento')).toHaveValue('Revisado');
    expect(screen.queryByText('As alterações do treinamento foram salvas.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('status')).toHaveTextContent('As alterações do treinamento foram salvas.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can enable gamification during course creation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCourse).mockResolvedValue(fire);
    render(<PlatformCoursesPage />);
    await user.click(screen.getByRole('button', { name: 'Criar treinamento' }));
    await user.type(screen.getByLabelText('Título (obrigatório)'), 'Novo treinamento');
    await user.click(screen.getByLabelText('Gamificação após os vídeos'));
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(api.createPlatformCourse).toHaveBeenCalledWith({
      title: 'Novo treinamento', description: null, gamificationEnabled: true,
    });
  });

  it('deletes a theme only after asking', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deletePlatformCourse).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Mais ações de Ergonomia' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    expect(api.deletePlatformCourse).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Mais ações de Ergonomia' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    expect(api.deletePlatformCourse).toHaveBeenCalledWith('c-1');
    expect(await screen.findByText('O treinamento "Ergonomia" foi excluído.')).toBeVisible();
    confirm.mockRestore();
  });

});
