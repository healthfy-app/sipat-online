import { isExtra, videoProvider, type GameModule, type PlatformCourse, type PlatformLibraryVideo, type ProgramDay, type VideoProvider } from '@/api';

/** Rows shown for videos and games in the planner, as in the sheet (VÍDEO 1 to 5, and the games slots). */
export const defaultVideoRows = 5;
export const maxVideoRows = 10;
export const defaultGameRows = 3;
export const maxGameRows = 5;
export const maxDays = 14;

/** `durationMs` of an extra is only what the operator typed: it never enters a sum. */
export interface CatalogVideo {
  id: string; title: string; durationMs: number; code: string | null; provider?: VideoProvider;
  /** The library video itself, so the planner can play it. */
  source?: PlatformLibraryVideo['video'];
}
export interface Subject { id: string; title: string; videoIds: string[]; totalMs: number; extraCount?: number; coverUrl: string | null; gameIds: string[]; option: string | null }
export interface Catalog {
  videos: Map<string, CatalogVideo>;
  subjects: Subject[];
  games: Map<string, GameModule>;
  /** The assuntos of the videos (a classification): only filters, each with the videos in it. */
  filters?: Subject[];
}

/** "A1V4-Ergonomia e doenças" -> "A1V4". Videos of the catalog carry their code at the start of the title. */
export function videoCode(title: string): string | null {
  return /^\s*([A-Za-z]\d+V\d+)\s*[-–—:]/.exec(title)?.[1].toUpperCase() ?? null;
}

/** Time counts only house videos; extras are counted apart. */
function houseTotals(ids: string[], videos: Map<string, CatalogVideo>) {
  const held = ids.map(id => videos.get(id)!);
  return {
    totalMs: held.filter(video => !isExtra(video)).reduce((sum, video) => sum + video.durationMs, 0),
    extraCount: held.filter(isExtra).length,
  };
}

/** Subjects are the courses of the catalog; videos that belong to no course go to "Sem assunto". */
export function buildCatalog(courses: PlatformCourse[], library: PlatformLibraryVideo[], games: GameModule[], categories: { id: string; name: string }[] = [],
  filterList: { id: string; name: string }[] = [], videoSubjects: { videoId: string; subjectIds: string[] }[] = []): Catalog {
  const categoryNames = new Map(categories.map(item => [item.id, item.name]));
  const gameMap = new Map(games.map(game => [game.id, game]));
  const videos = new Map<string, CatalogVideo>();
  for (const item of library) {
    if (item.video.status !== 'Ready') continue;
    const title = item.video.libraryTitle ?? item.video.title;
    videos.set(item.video.id, { id: item.video.id, title, durationMs: item.video.durationMilliseconds, code: videoCode(title), provider: videoProvider(item.video), source: item.video });
  }
  const used = new Set<string>();
  const subjects: Subject[] = [];
  for (const course of courses) {
    const ids = course.videos.map(video => video.id).filter(id => videos.has(id));
    if (ids.length === 0) continue;
    ids.forEach(id => used.add(id));
    const gameIds = [...new Set([...(course.modules ?? [])].sort((a, b) => a.afterVideoCount - b.afterVideoCount).map(placement => placement.moduleId))].filter(id => gameMap.has(id));
    subjects.push({ id: course.id, title: course.title, coverUrl: course.coverUrl ?? null, gameIds, option: (course.categoryId && categoryNames.get(course.categoryId)) || null, videoIds: ids, ...houseTotals(ids, videos) });
  }
  const loose = [...videos.keys()].filter(id => !used.has(id));
  if (loose.length > 0) {
    subjects.push({ id: 'none', title: 'Sem assunto', coverUrl: null, gameIds: [], option: null, videoIds: loose, ...houseTotals(loose, videos) });
  }
  subjects.sort((a, b) => (a.id === 'none' ? 1 : b.id === 'none' ? -1 : a.title.localeCompare(b.title, 'pt-BR')));
  // the assuntos of the videos (only filters), in the same shape so the day can filter and bring all of one assunto
  const byVideo = new Map(videoSubjects.map(item => [item.videoId, item.subjectIds]));
  const filters: Subject[] = filterList.map(item => {
    const ids = [...videos.keys()].filter(id => byVideo.get(id)?.includes(item.id));
    return { id: item.id, title: item.name, coverUrl: null, gameIds: [], option: null, videoIds: ids, ...houseTotals(ids, videos) };
  }).filter(item => item.videoIds.length > 0).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return { videos, subjects, games: gameMap, filters };
}

/** A Título of a training of Conteúdo, as the planner offers it: it becomes one day. */
export interface TrainingTitle { id: string; title: string; videoIds: string[] }
/** A training of Conteúdo shown in the planner, with its Títulos in order (only the videos ready in the library). */
export interface TrayTraining { id: string; title: string; coverUrl: string | null; titles: TrainingTitle[] }

/** A name the operator never typed ("Dia 3", "Módulo 3"): it follows the word and the position of the day. */
export const isGenericDayTitle = (title: string) => !title.trim() || /^(Dia|Módulo) [0-9]+$/.test(title.trim());

/** Untyped day names said with the word the board uses ("Dia" with dates, "Módulo" without) and renumbered by position. */
export function withDayWord<T extends { title: string }>(days: T[], word: string): T[] {
  return days.map((day, index) => (isGenericDayTitle(day.title) ? { ...day, title: `${word} ${index + 1}` } : day));
}

/** A day while it is being edited: empty slots are kept so the grid keeps its shape. */
export interface DaySlots {
  key: string;
  id?: string;
  title: string;
  /** yyyy-MM-dd or empty */
  date: string;
  subject: string;
  videos: (string | null)[];
  games: (string | null)[];
}

let keyCounter = 0;
const nextKey = () => `day-${++keyCounter}`;

function pad<T>(items: (T | null)[], rows: number): (T | null)[] {
  return items.length >= rows ? items : [...items, ...Array.from({ length: rows - items.length }, () => null)];
}

/** A day made from a Título of a training of Conteúdo: its name and its videos, in order. */
export function dayFromTitle(index: number, date: string, title: string, videoIds: string[]): DaySlots {
  const videos = videoIds.slice(0, maxVideoRows);
  return { ...newDay(index, date), title: title.trim() || `Dia ${index + 1}`, videos: pad(videos, Math.max(defaultVideoRows, videos.length)) };
}

export function newDay(index: number, date = ''): DaySlots {
  return {
    key: nextKey(), title: `Dia ${index + 1}`, date, subject: '',
    videos: pad([], defaultVideoRows), games: pad([], defaultGameRows),
  };
}

export function fromProgramDay(day: ProgramDay): DaySlots {
  return {
    key: nextKey(), id: day.id, title: day.title, date: day.date ?? '', subject: day.subject ?? '',
    videos: pad(day.videoIds, defaultVideoRows), games: pad(day.gameIds, defaultGameRows),
  };
}

export function toProgramDay(day: DaySlots): ProgramDay {
  const filled = (items: (string | null)[]) => items.filter((id): id is string => !!id);
  return {
    ...(day.id ? { id: day.id } : {}),
    title: day.title.trim(), date: day.date || null, subject: day.subject.trim() || null,
    videoIds: filled(day.videos), gameIds: filled(day.games),
  };
}

export function dayDuration(day: DaySlots, catalog: Catalog): number {
  return day.videos.reduce((sum, id) => { const video = id ? catalog.videos.get(id) : undefined; return sum + (video && !isExtra(video) ? video.durationMs : 0); }, 0);
}

/** h:mm:ss, the way the sheet shows times. */
export function formatClock(milliseconds: number): string {
  const total = Math.round(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** "22 min" or "1 h 28 min", for sentences; under half a minute, the seconds ("5 s"), never "0 min". */
export function formatSpan(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 30_000) return `${Math.max(1, Math.round(milliseconds / 1000))} s`;
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

/** yyyy-MM-dd plus n days (UTC, so daylight saving never shifts the date). */
export function addDays(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + count));
  return moved.toISOString().slice(0, 10);
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // 31/02 would roll over to March, so the parts must survive the round trip
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "seg., 09/11" for the header of a day. */
export function shortDate(date: string): string {
  if (!isValidDate(date)) return '';
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${weekday} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const palette = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0d9488', '#db2777', '#4f46e5'];

/** Each Título of a training by its place: Título 1, 2, 3… never share a color side by side. */
export function titleColor(index: number): string {
  return palette[index % palette.length];
}

/** The same theme always gets the same color, like the colored blocks of the sheet. */
export function subjectColor(subject: string): string {
  if (!subject.trim()) return '#94a3b8';
  let hash = 0;
  for (const char of normalize(subject)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/** Themes may share a title (the same subject in two categories): the label tells them apart. */
export function themeLabel(subject: Subject): string {
  return subject.option ? `${subject.title} · ${subject.option}` : subject.title;
}

/**
 * The theme a day was built from. A day stores only the subject title, so when several themes share it the one
 * whose videos the day actually holds wins.
 */
export function themeOfDay(themes: Subject[], day: Pick<DaySlots, 'subject' | 'videos'>): Subject | undefined {
  const candidates = themes.filter(item => normalize(item.title) === normalize(day.subject));
  if (candidates.length <= 1) return candidates[0];
  const held = new Set(day.videos.filter(Boolean));
  const overlap = (item: Subject) => item.videoIds.filter(id => held.has(id)).length;
  return candidates.reduce((best, item) => (overlap(item) > overlap(best) ? item : best));
}

/** The videos of a day that count (house) and the extras, for "5 vídeos + 1 extra". */
export function dayVideoCounts(videoIds: string[], catalog: Catalog): { house: number; extras: number } {
  const extras = videoIds.filter(id => { const video = catalog.videos.get(id); return video && isExtra(video); }).length;
  return { house: videoIds.length - extras, extras };
}
