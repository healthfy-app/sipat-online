import type { PlayerQualitySummary } from '@sipat/video-player';
import { reportFailedRequest } from './telemetry';

export interface TenantBranding {
  tenantKey: string;
  tenantName: string;
  logoReference: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDomain: string | null;
  bannerReference?: string | null;
}

export interface IdentitySession {
  id: string;
  loginIdentifier: string;
  displayName: string;
  roles: string[];
}

export interface PlatformCompany {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  isActive: boolean;
}

/** The plans sold on the site. The company sees its own plan; only the operator changes it. */
export type CompanyPlan = 'Bronze' | 'Prata' | 'Ouro' | 'Diamante';

export interface PlatformCompanyOverview extends PlatformCompany {
  plan?: CompanyPlan;
  employeeCount: number;
  administratorCount: number;
  totalUserCount: number;
  /** The company's portal logo; absent when it has none. */
  logoReference?: string | null;
}

export interface PlatformCompanyEmployee {
  id: string;
  loginIdentifier: string;
  displayName: string;
  isActive: boolean;
  progressPercentage: number;
  completedLessonCount: number;
  lessonCount: number;
}

export interface PlatformCompanyEmployeePage {
  companyId: string;
  companyKey: string;
  companyName: string;
  items: PlatformCompanyEmployee[];
  offset: number;
  limit: number;
  totalCount: number;
}

export type PlatformCourseStatus = 'Draft' | 'Published';
export type GamificationGameType = 'Quiz' | 'RiskSpotting' | 'Puzzle' | 'Memory' | 'Scenario' | 'Ordering' | 'SafeOrRisky';

export interface PlatformCourse {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  status: PlatformCourseStatus;
  gamificationEnabled: boolean;
  gameType: GamificationGameType;
  videos: PlatformCourseVideo[];
  modules: CourseModulePlacement[];
  coverUrl: string | null;
  lessons?: PlatformCourseLesson[];
  categoryId?: string | null;
  /** The company the training belongs to; absent or null for a model of Conteúdo. */
  tenantId?: string | null;
  /** A model offered whole as a ready SIPAT: what a Bronze company picks. */
  isReadySipat?: boolean;
}

export interface PlatformCourseLesson {
  id: string;
  title: string;
  description: string | null;
  videoIds: string[];
}

export interface CourseLessonDraft {
  id: string | null;
  title: string;
  description: string | null;
  videos: { videoId: string; title: string | null }[];
}

export interface CourseModulePlacement {
  moduleId: string;
  afterVideoCount: number;
}

export interface VideoCheckpoint {
  timeMilliseconds: number;
  moduleId: string;
}

export interface GameQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

export interface GameModule {
  id: string;
  title: string;
  gameType: GamificationGameType;
  questions: GameQuestion[];
  createdAt: string;
  usageCount: number;
  content?: GameContent | null;
}

export interface GameContent {
  imageUrl: string | null;
  items: string[] | null;
  pairs: { first: string; second: string }[] | null;
  risks: { label: string; x: number; y: number; width: number; height: number }[] | null;
  columns: number;
  /** Seguro ou arriscado: situations the participant judges. */
  cards?: GameCard[] | null;
}

export interface GameCard { text: string; safe: boolean; explanation: string | null }

export interface GameModuleData {
  title: string;
  gameType: GamificationGameType;
  questions: GameQuestion[];
  content?: GameContent | null;
}

export interface LearningActivity {
  id: string;
  module: GameModule;
  afterVideoCount: number;
  lessonId: string | null;
  timeMilliseconds: number | null;
  outcome: 'completed' | 'skipped' | null;
}

export interface ParticipationCertificate {
  id: string; participantName: string; companyName: string; eventTitle: string;
  startsAt: string; endsAt: string; durationMilliseconds: number; issuedAt: string;
  isDemonstration: boolean;
}

export interface CertificateEligibility {
  sipatEventId: string; eventTitle: string; totalCourses: number; completedCourses: number;
  isEligible: boolean; certificate: ParticipationCertificate | null; hasCompanyLogo: boolean;
  startsAt?: string; endsAt?: string;
}

export function getCompanyCertificateLogo(companyId: string): Promise<{ configured: boolean }> {
  return requestJson(`/api/platform/companies/${companyId}/learning/certificate-logo`);
}

export function saveCompanyCertificateLogo(companyId: string, file: File): Promise<{ configured: boolean }> {
  return requestJson(`/api/platform/companies/${companyId}/learning/certificate-logo`, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: file,
  });
}

export function getLearningActivities(trackId: string): Promise<{ revisionId: string; items: LearningActivity[] }> {
  return requestJson(`/api/learning/tracks/${trackId}/activities`);
}

/** A checkpoint outcome names its lesson: the server refuses it (409 `learning.activity.stale`) when the list changed. */
export function saveLearningActivityOutcome(trackId: string, activityId: string, outcome: string, lessonId?: string): Promise<{ saved: boolean }> {
  return requestJson(`/api/learning/tracks/${trackId}/activities/${activityId}/outcome`, {
    method: 'PUT', body: JSON.stringify(lessonId ? { outcome, lessonId } : { outcome }),
  });
}

export function listCertificates(): Promise<CertificateEligibility[]> {
  return requestJson('/api/learning/certificates');
}

export function issueCertificate(sipatId: string): Promise<ParticipationCertificate> {
  return requestJson(`/api/learning/sipats/${sipatId}/certificate`, { method: 'POST', body: '{}' });
}

export interface CompanyLearningCatalog {
  events: { id: string; title: string }[];
  courses: { trackId: string; sourceCourseId: string | null; title: string; sipatEventId: string }[];
}
export function requestCompanyLearning(companyId: string): Promise<CompanyLearningCatalog> {
  return requestJson(`/api/platform/companies/${companyId}/learning`);
}
/**
 * A day of a SIPAT program, as in the "Seletor de módulos" sheet: a title or slogan, an optional date,
 * a main subject, the videos picked for the day (in order) and its games, quizzes or forms.
 */
export interface ProgramDay {
  /** Stable across edits; absent on a day that was never saved. */
  id?: string;
  title: string;
  /** yyyy-MM-dd */
  date: string | null;
  subject: string | null;
  videoIds: string[];
  gameIds: string[];
}
export interface SipatProgram { id: string; title: string; days: ProgramDay[]; createdAt: string }
export interface SipatProgramData { title: string; days: ProgramDay[] }

/** Programs saved before days held videos come back without lists; they read as days with nothing in them. */
function tidyProgram(program: SipatProgram): SipatProgram {
  return {
    ...program,
    days: (program.days ?? []).map(day => ({
      ...day, title: day.title ?? '', date: day.date ?? null, subject: day.subject ?? null,
      videoIds: day.videoIds ?? [], gameIds: day.gameIds ?? [],
    })),
  };
}
export async function listSipatPrograms(): Promise<SipatProgram[]> {
  return (await requestJson<SipatProgram[]>('/api/platform/catalog/programs')).map(tidyProgram);
}
export async function createSipatProgram(data: SipatProgramData): Promise<SipatProgram> {
  return tidyProgram(await requestJson<SipatProgram>('/api/platform/catalog/programs', { method: 'POST', body: JSON.stringify(data) }));
}
export async function updateSipatProgram(programId: string, data: SipatProgramData): Promise<SipatProgram> {
  return tidyProgram(await requestJson<SipatProgram>(`/api/platform/catalog/programs/${programId}`, { method: 'PUT', body: JSON.stringify(data) }));
}
export async function deletePlatformCourse(courseId: string): Promise<void> {
  await request(`/api/platform/catalog/courses/${courseId}`, { method: 'DELETE' });
}
export async function deletePlatformVideo(videoId: string): Promise<void> {
  await request(`/api/platform/catalog/videos/${videoId}`, { method: 'DELETE' });
}
/** What a day of a SIPAT can be made of: published themes, library videos and games. Read only, for the company's administrator and the operator. */
export interface SipatCatalog { courses: PlatformCourse[]; videos: PlatformLibraryVideo[]; games: GameModule[]; categories?: CourseCategory[]; subjects?: VideoSubject[]; videoSubjects?: VideoSubjects[] }
export function getSipatCatalog(): Promise<SipatCatalog> {
  return requestJson<SipatCatalog>('/api/admin/sipat-catalog');
}
/** A training as its card shows it: how much it has, how long it runs and its cover (null when it has none). */
export interface SipatPlanSummary { sipatEventId: string; days: number; videos: number; courseId?: string; durationMilliseconds?: number; coverVersion?: number | null; targets?: AudienceTarget[] }
/** Deletes a training that was never delivered; one that was published stays in the history. */
export async function deleteSipat(sipatId: string): Promise<void> {
  await request(`/api/admin/sipats/${sipatId}`, { method: 'DELETE' });
}
export function listSipatPlans(): Promise<SipatPlanSummary[]> {
  return requestJson<SipatPlanSummary[]>('/api/admin/sipat-plans');
}
export async function getSipatPlan(sipatId: string): Promise<ProgramDay[]> {
  return tidyDays(await requestJson<ProgramDay[]>(`/api/admin/sipats/${sipatId}/plan`));
}
export async function saveSipatPlan(sipatId: string, days: ProgramDay[]): Promise<ProgramDay[]> {
  return tidyDays(await requestJson<ProgramDay[]>(`/api/admin/sipats/${sipatId}/plan`, { method: 'PUT', body: JSON.stringify({ days }) }));
}
export async function copySipatPlan(sipatId: string, sourceId: string): Promise<ProgramDay[]> {
  return tidyDays(await requestJson<ProgramDay[]>(`/api/admin/sipats/${sipatId}/plan/copy-from/${sourceId}`, { method: 'POST', body: '{}' }));
}
/** Publishes the SIPAT (one at a time per company) and delivers each day to the participants. */
export function launchSipat(sipatId: string): Promise<ProgramApplication> {
  return requestJson<ProgramApplication>(`/api/admin/sipats/${sipatId}/plan/launch`, { method: 'POST', body: '{}' });
}
function tidyDays(days: ProgramDay[]): ProgramDay[] {
  return (days ?? []).map(day => ({ ...day, title: day.title ?? '', date: day.date ?? null, subject: day.subject ?? null, videoIds: day.videoIds ?? [], gameIds: day.gameIds ?? [] }));
}
export async function deleteSipatProgram(programId: string): Promise<void> {
  await request(`/api/platform/catalog/programs/${programId}`, { method: 'DELETE' });
}
export interface ProgramApplication {
  days: number;
  created: number;
  /** Days nobody had started, refreshed with the program's current content. */
  updated: number;
  /** Days left as they were because participants already have progress in them. */
  kept: number;
}
export function applyProgramToCompany(companyId: string, sipatId: string, programId: string): Promise<ProgramApplication> {
  return requestJson(`/api/platform/companies/${companyId}/learning/sipats/${sipatId}/programs/${programId}`, { method: 'POST', body: '{}' });
}

export function distributeCompanyCourse(companyId: string, sipatId: string, courseId: string): Promise<{ trackId: string }> {
  return requestJson(`/api/platform/companies/${companyId}/learning/sipats/${sipatId}/courses/${courseId}`, {
    method: 'POST', body: '{}',
  });
}

export interface PlatformCourseVideo {
  id: string;
  title: string;
  contentType: string;
  sizeBytes: number;
  durationMilliseconds: number;
  createdAt: string;
  fileUrl: string;
  /** Every upload is converted in the background; only Ready videos can be watched or put in a Day. */
  status: 'Ready' | 'Processing' | 'Failed';
  processingError: string | null;
  hasSd480: boolean;
  /** New uploads whose original is taller than 720 lines also have a 1080p. */
  hasFhd1080?: boolean;
  checkpoints: VideoCheckpoint[];
  lessonId?: string | null;
  libraryTitle?: string | null;
  /** Missing in payloads from before external videos: read it with `videoProvider`. */
  provider?: VideoProvider;
  externalId?: string | null;
  /** The picture chosen for the video; absent or null shows a frame of the video itself. */
  thumbnailUrl?: string | null;
}

export type VideoProvider = 'Sipat' | 'YouTube' | 'Vimeo';

export function videoProvider(video: { provider?: VideoProvider }): VideoProvider {
  return video.provider ?? 'Sipat';
}

/** A YouTube or Vimeo video: no file of ours, played in the provider's player, without questions in the middle. */
export function isExternal(video: { provider?: string }): boolean {
  return (video.provider ?? 'Sipat') !== 'Sipat';
}

/**
 * An external video without a known length: an appendix that never counts for progress or the certificate.
 * A YouTube or Vimeo video with its length counts like ours (the participant watches it in order).
 */
export function isExtra(video: { provider?: string; durationMilliseconds?: number; durationMs?: number }): boolean {
  return isExternal(video) && !((video.durationMilliseconds ?? video.durationMs ?? 0) > 0);
}

export interface PlatformLibraryVideo {
  video: PlatformCourseVideo;
  courseCount: number;
}

export interface PlatformCourseData {
  title: string;
  description: string | null;
  gamificationEnabled: boolean;
}

export interface PlatformCourseUpdate extends PlatformCourseData {
  status: PlatformCourseStatus;
  gameType: GamificationGameType;
}

export interface PlatformCompanyData {
  key: string;
  name: string;
  adminLoginIdentifier: string;
  adminDisplayName: string;
  adminPassword: string;
  plan?: CompanyPlan;
}

export interface PlatformUserSummary {
  id: string;
  tenantId: string;
  tenantKey: string;
  tenantName: string;
  loginIdentifier: string;
  displayName: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
}

export interface PlatformUserDirectoryPage {
  offset: number;
  limit: number;
  totalCount: number;
  items: PlatformUserSummary[];
}

export interface PlatformUserProvisionData {
  tenantId: string;
  loginIdentifier: string;
  displayName: string;
  initialPassword: string;
  role: 'Participant' | 'ClientAdmin' | 'Supervisor';
}

export type PlatformUserRoleFilter = PlatformUserProvisionData['role'] | 'SuperAdmin';

export interface ParticipantAccount {
  id: string;
  loginIdentifier: string;
  displayName: string;
  isActive: boolean;
}

export interface ParticipantAccountPage {
  offset: number;
  limit: number;
  totalCount: number;
  items: ParticipantAccount[];
}

export interface LearningTrackSummary {
  id: string;
  sipatEventId: string;
  title: string;
  description: string | null;
  revisionNumber: number;
  lessonCount: number;
  isPublished: boolean;
}

export interface LearningTrackDraft {
  trackId: string;
  sipatEventId: string;
  title: string;
  description: string | null;
  revisionId: string;
  revisionNumber: number;
  lessons: LearningDraftLesson[];
}

export interface LearningDraftLesson {
  id: string;
  title: string;
  description: string | null;
  providerAssetReference: string;
  position: number;
  durationMilliseconds: number;
}

export interface LearningLessonCreated {
  id: string;
  title: string;
  description: string | null;
  position: number;
  durationMilliseconds: number;
}

export interface LearningTrackData {
  title: string;
  description: string | null;
}

export interface LearningLessonData {
  title: string;
  description: string | null;
  providerAssetReference: string;
  durationMilliseconds: number;
}

export interface CreateParticipantData {
  loginIdentifier: string;
  displayName: string;
  initialPassword: string;
  role: 'Participant';
}

export interface SipatEvent {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: 'Draft' | 'Published' | 'Cancelled';
  createdAt: string;
}

export interface SipatEventPage {
  offset: number;
  limit: number;
  totalCount: number;
  items: SipatEvent[];
}

export interface SipatEventData {
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
}

export interface LearningTrackCard {
  id: string;
  sipatEventId: string;
  title: string;
  description: string | null;
  revisionNumber: number;
  lessonCount: number;
  completedLessonCount: number;
  progressPercentage: number;
  coverUrl?: string | null;
  /** Day of the SIPAT program this course belongs to; absent when it was distributed on its own. */
  dayTitle?: string | null;
  dayPosition?: number | null;
  coursePosition?: number | null;
  /** yyyy-MM-dd, when the program gave the day a date. */
  dayDate?: string | null;
  /** Total length of the videos of the track. */
  durationMilliseconds?: number;
  /** The SIPAT (the year's week of training) the track belongs to. */
  sipatTitle?: string | null;
  sipatStartsAt?: string | null;
  sipatStatus?: 'Draft' | 'Published' | 'Cancelled' | null;
  sipatEndsAt?: string | null;
}

export interface ParticipantOutcomes {
  completedActivities: number; skippedActivities: number;
  certificates: { id: string; eventTitle: string; issuedAt: string; isDemonstration: boolean }[];
}
export function getParticipantOutcomes(participantId: string, companyId?: string): Promise<ParticipantOutcomes> {
  return requestJson(companyId
    ? `/api/platform/companies/${companyId}/learning/participants/${participantId}/outcomes`
    : `/api/admin/learning/participants/${participantId}/outcomes`);
}

export interface LearningParticipantProgress {
  participantId: string;
  loginIdentifier: string;
  displayName: string;
  trackId: string;
  trackTitle: string;
  assignedAt: string;
  lessonCount: number;
  completedLessonCount: number;
  progressPercentage: number;
  isCompleted: boolean;
  watchedMilliseconds?: number;
  completedAt?: string | null;
  lastAccessedAt?: string | null;
  /** The training the day belongs to. */
  sipatEventId?: string | null;
  sipatTitle?: string | null;
  sipatStartsAt?: string | null;
  sipatEndsAt?: string | null;
  sipatStatus?: string | null;
}

export interface LearningLessonProgress {
  id: string;
  title: string;
  description: string | null;
  position: number;
  durationMilliseconds: number;
  lastPlaybackPositionMilliseconds: number;
  watchedPercentage: number;
  isCompleted: boolean;
  completedAt: string | null;
  sectionTitle?: string | null;
  watchedMilliseconds?: number;
  /** An extra (YouTube or Vimeo): never counts for progress. Missing in payloads from before external videos. */
  isBonus?: boolean;
  provider?: 'YouTube' | 'Vimeo' | null;
  externalId?: string | null;
}

export interface LearningExperience {
  track: LearningTrackCard;
  lessons: LearningLessonProgress[];
}

export interface LearningPlaybackSession {
  url: string;
  contentType: string | null;
  expiresAt: string;
  sessionId: string;
  isDevelopmentDemo: boolean;
  sources?: { url: string; quality: '1080p' | '720p' | '480p' | null }[];
}

export interface LearningProgress {
  lessonId: string;
  lastPlaybackPositionMilliseconds: number;
  durationMilliseconds: number;
  watchedPercentage: number;
  isCompleted: boolean;
  firstStartedAt: string;
  lastAccessedAt: string;
  completedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let companyAdministrationId: string | null = null;

export function configureCompanyAdministration(companyId: string | null): void {
  companyAdministrationId = companyId;
}

export function getCompanyAdministrationId(): string | null {
  return companyAdministrationId;
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Não foi possível concluir a solicitação (HTTP ${response.status}).`;

  let code: string | undefined;
  try {
    const problem = (await response.json()) as { detail?: string; title?: string; code?: string };
    message = problem.detail ?? problem.title ?? message;
    code = problem.code;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return new ApiError(message, response.status, code);
}

async function getAntiforgeryToken(): Promise<string> {
  const response = await fetch('/api/identity/antiforgery', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const payload = (await response.json()) as { requestToken?: string };
  if (!payload.requestToken) {
    throw new Error('A API não retornou o token antifalsificação.');
  }

  return payload.requestToken;
}

/** Reused across writes: one GET /antiforgery per session instead of one per save. */
let cachedAntiforgeryToken: string | null = null;

/** The next write fetches a fresh token (the signed-in person changed or the session ended). */
export function forgetAntiforgeryToken(): void {
  cachedAntiforgeryToken = null;
}

async function currentAntiforgeryToken(): Promise<string> {
  return cachedAntiforgeryToken ?? (cachedAntiforgeryToken = await getAntiforgeryToken());
}

const antiforgeryRejectionTitle = 'Token antifalsificação inválido.';

async function isAntiforgeryRejection(response: Response): Promise<boolean> {
  if (response.status !== 400 || typeof response.clone !== 'function') return false;
  try {
    const problem = (await response.clone().json()) as { title?: string };
    return problem?.title === antiforgeryRejectionTitle;
  } catch {
    return false;
  }
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (companyAdministrationId &&
      (path.startsWith('/api/admin/') || path.startsWith('/api/tenant/branding'))) {
    headers.set('X-Sipat-Company', companyAdministrationId);
  }

  const writes = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (writes) {
    headers.set('X-CSRF-TOKEN', await currentAntiforgeryToken());
  }

  if (
    init.body &&
    !headers.has('Content-Type') &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const send = async (): Promise<Response> => {
    try {
      return await fetch(path, {
        ...init,
        method,
        credentials: 'include',
        headers: new Headers(headers),
      });
    } catch (error) {
      reportFailedRequest(method, path, error);
      throw error;
    }
  };
  let response = await send();

  // The token is tied to the signed-in person: after a login, logout or expired session it is stale.
  // Fetch a fresh one and send once more.
  if (writes && await isAntiforgeryRejection(response)) {
    cachedAntiforgeryToken = null;
    headers.set('X-CSRF-TOKEN', await currentAntiforgeryToken());
    response = await send();
  }

  if (response.status >= 500) reportFailedRequest(method, path, response.status);
  if (!response.ok) {
    throw await readError(response);
  }

  return response;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const value = await (await request(path, init)).json() as T;
  // in a company's editor the links the server gives (cover, video file) go to the company's own routes
  return path.startsWith(`${trainingEditor}/`)
    ? JSON.parse(JSON.stringify(value).replaceAll(`${platformCatalog}/`, `${trainingEditor}/`)) as T
    : value;
}

const platformCatalog = '/api/platform/catalog';
const trainingEditor = '/api/admin/training-editor';
let editorBase = platformCatalog;
/**
 * Where the video editor's calls go: the operation's catalog (Conteúdo), or the company's own training, which its
 * administrator edits inside what the plan allows. The page that opens the editor sets it and puts it back on leaving.
 */
export function setEditorScope(scope: 'platform' | 'company'): void {
  editorBase = scope === 'company' ? trainingEditor : platformCatalog;
}

/** The links of the operation's catalog (cover, video file) as the company's own routes. */
export function companyEditorLinks<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll(`${platformCatalog}/`, `${trainingEditor}/`)) as T;
}

const companyVideos = '/api/admin/company-videos';
let uploadBase = `${platformCatalog}/videos`;
/**
 * Where videos are sent: the operation's library, or the company's own videos (private to it, inside its room).
 * It follows who is signed in, so the app sets it once and the upload queue sends to the right place.
 */
export function setUploadScope(scope: 'platform' | 'company'): void {
  uploadBase = scope === 'company' ? companyVideos : `${platformCatalog}/videos`;
}

/** A video the company sent, and the company's trainings that have it. */
export interface CompanyVideo { video: PlatformCourseVideo; trainings: string[] }
export interface CompanyVideos { videos: CompanyVideo[]; usedBytes: number; quotaBytes: number; termsAccepted: boolean; canSend: boolean }
export async function listCompanyVideos(): Promise<CompanyVideos> {
  return companyEditorLinks(await requestJson<CompanyVideos>(`${companyVideos}/`));
}
/** The company says, once, that what it sends is its own to use. */
export async function acceptCompanyVideoTerms(): Promise<void> {
  await request(`${companyVideos}/terms`, { method: 'POST', body: '{}' });
}
export async function renameCompanyVideo(videoId: string, title: string): Promise<void> {
  await request(`${companyVideos}/${videoId}`, { method: 'PUT', body: JSON.stringify({ title }) });
}
/** Changes the name of a video: any of the library for the operation, its own for a company. */
export async function renameVideo(videoId: string, title: string, company: boolean): Promise<void> {
  await request(company ? `${companyVideos}/${videoId}` : `${platformCatalog}/videos/${videoId}/title`, { method: 'PUT', body: JSON.stringify({ title }) });
}
/** The picture shown for a video instead of a frame of it: PNG, JPEG or WebP, up to 2 MB. */
export async function setVideoThumbnail(videoId: string, image: File, company: boolean): Promise<void> {
  const form = new FormData();
  form.append('image', image);
  await request(company ? `${companyVideos}/${videoId}/thumbnail` : `${platformCatalog}/videos/${videoId}/thumbnail`, { method: 'PUT', body: form });
}
export async function removeVideoThumbnail(videoId: string, company: boolean): Promise<void> {
  await request(company ? `${companyVideos}/${videoId}/thumbnail` : `${platformCatalog}/videos/${videoId}/thumbnail`, { method: 'DELETE' });
}
export async function deleteCompanyVideo(videoId: string): Promise<void> {
  await request(`${companyVideos}/${videoId}`, { method: 'DELETE' });
}

/** What the company's plan lets it change in one of its trainings. */
export interface TrainingAccess { editDetails: boolean; editGrid: boolean; editActivities: boolean; uploadVideo: boolean; plan: string }
export interface TrainingEditorData { course: PlatformCourse; access: TrainingAccess; sipatId: string; sipatTitle: string; sipatStatus: string; unavailableVideoIds?: string[] }
/**
 * The cover of a company's training (PNG, JPEG or WebP, up to 2 MB), from its card or its page. It goes by the
 * company's own route, which the operation also uses while inside the company.
 */
export async function setTrainingCover(courseId: string, image: File): Promise<void> {
  const form = new FormData();
  form.append('cover', image);
  await request(`${trainingEditor}/courses/${courseId}/cover`, { method: 'PUT', body: form });
}
export async function removeTrainingCover(courseId: string): Promise<void> {
  await request(`${trainingEditor}/courses/${courseId}/cover`, { method: 'DELETE' });
}

/** A company's training as its editor needs it: the content, and what the plan allows. */
export function getTrainingEditor(sipatId: string): Promise<TrainingEditorData> {
  return requestJson<TrainingEditorData>(`${trainingEditor}/sipats/${sipatId}`);
}

export function getTenantBranding(): Promise<TenantBranding> {
  return requestJson<TenantBranding>('/api/tenant/branding');
}

export interface TenantAppearanceData {
  primaryColor: string;
  secondaryColor: string;
  logoBase64?: string | null;
  removeLogo?: boolean;
  bannerBase64?: string | null;
  removeBanner?: boolean;
}

export function saveTenantAppearance(data: TenantAppearanceData): Promise<TenantBranding> {
  return requestJson<TenantBranding>('/api/tenant/branding/appearance', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
export async function getSession(platform = false): Promise<IdentitySession | null> {
  try {
    return await requestJson<IdentitySession>(
      platform ? '/api/platform/identity/session' : '/api/identity/session',
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function signIn(
  loginIdentifier: string,
  password: string,
  platform = false,
): Promise<void> {
  await request(platform ? '/api/platform/identity/login' : '/api/identity/login', {
    method: 'POST',
    body: JSON.stringify({ loginIdentifier, password }),
  });
  // the token is tied to who is signed in
  cachedAntiforgeryToken = null;
}

export async function signOut(platform = false): Promise<void> {
  try {
    await request(platform ? '/api/platform/identity/logout' : '/api/identity/logout', {
      method: 'POST',
    });
  } finally {
    cachedAntiforgeryToken = null;
  }
}

export function listPlatformCompanies(): Promise<PlatformCompany[]> {
  return requestJson<PlatformCompany[]>('/api/platform/companies');
}

export function getPlatformDashboard(): Promise<PlatformCompanyOverview[]> {
  return requestJson<PlatformCompanyOverview[]>('/api/platform/dashboard');
}

export interface PlatformEmployeeStatusChange { requested: number; changed: number }

/** The operator activates or deactivates participants of one company, one or many at a time. */
export function changePlatformCompanyEmployeesStatus(companyId: string, userIds: string[], isActive: boolean): Promise<PlatformEmployeeStatusChange> {
  return requestJson<PlatformEmployeeStatusChange>(`/api/platform/companies/${encodeURIComponent(companyId)}/employees/status`, {
    method: 'PUT', body: JSON.stringify({ userIds, isActive }),
  });
}

export function getPlatformCompanyEmployees(
  companyId: string,
  options: { offset?: number; limit?: number; search?: string; includeInactive?: boolean } = {},
): Promise<PlatformCompanyEmployeePage> {
  const query = new URLSearchParams({
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 50),
  });
  if (options.search?.trim()) query.set('search', options.search.trim());
  if (options.includeInactive) query.set('includeInactive', 'true');
  return requestJson<PlatformCompanyEmployeePage>(
    `/api/platform/companies/${encodeURIComponent(companyId)}/employees?${query.toString()}`,
  );
}

/** The assuntos (a classification, like a genre) each library video is in. */
export interface VideoSubjects { videoId: string; subjectIds: string[] }
/** The fixed list of assuntos (a classification of the videos, only a filter). */
export interface VideoSubject { id: string; name: string }
export function listSubjects(): Promise<VideoSubject[]> {
  return requestJson<VideoSubject[]>('/api/platform/catalog/subjects');
}
export function createSubject(name: string): Promise<VideoSubject> {
  return requestJson<VideoSubject>('/api/platform/catalog/subjects', { method: 'POST', body: JSON.stringify({ name }) });
}
export function deleteSubject(subjectId: string): Promise<void> {
  return request(`/api/platform/catalog/subjects/${subjectId}`, { method: 'DELETE' }).then(() => undefined);
}
export function listVideoSubjects(): Promise<VideoSubjects[]> {
  return requestJson<VideoSubjects[]>('/api/platform/catalog/video-subjects');
}
export function setVideoSubjects(videoId: string, subjectIds: string[]): Promise<VideoSubjects> {
  return requestJson<VideoSubjects>(`/api/platform/catalog/videos/${videoId}/subjects`, { method: 'PUT', body: JSON.stringify({ subjectIds }) });
}

/** Many videos at once: `add` is put on every one, `remove` taken from every one, the rest stays. */
export interface BulkVideoChange { videoIds: string[]; add: string[]; remove: string[] }
export function changeVideosSubjects(change: BulkVideoChange): Promise<void> {
  return request('/api/platform/catalog/videos/subjects', { method: 'PUT', body: JSON.stringify(change) }).then(() => undefined);
}
/** The companies a video is private to; a video that is not listed is public. */
export interface VideoCompanies { videoId: string; companyIds: string[] }
export function listVideoCompanies(): Promise<VideoCompanies[]> {
  return requestJson<VideoCompanies[]>('/api/platform/catalog/video-companies');
}
export function changeVideosCompanies(change: BulkVideoChange): Promise<void> {
  return request('/api/platform/catalog/videos/companies', { method: 'PUT', body: JSON.stringify(change) }).then(() => undefined);
}

/** A SIPAT's week opened in the video editor: a copy training whose Títulos are the days of that SIPAT. */
export interface SipatWeek { courseId: string; sipatEventId: string; tenantId: string; sipatTitle: string; companyName: string; sipatStatus?: 'Draft' | 'Published' | 'Cancelled' }
export function listSipatWeeks(): Promise<SipatWeek[]> {
  return requestJson<SipatWeek[]>('/api/platform/catalog/sipat-weeks');
}
/** Writes the SIPAT's days into its week copy (made the first time) and gives the training to open in the editor. */
export function openSipatWeek(sipatId: string): Promise<{ courseId: string }> {
  return requestJson<{ courseId: string }>(`/api/admin/sipats/${sipatId}/week`, { method: 'POST' });
}

export function listPlatformCourses(): Promise<PlatformCourse[]> {
  return requestJson<PlatformCourse[]>('/api/platform/catalog/courses');
}

export function createPlatformCourse(data: PlatformCourseData): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>('/api/platform/catalog/courses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updatePlatformCourse(
  courseId: string,
  data: PlatformCourseUpdate,
): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`${editorBase}/courses/${courseId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function duplicatePlatformCourse(courseId: string): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}/duplicate`, {
    method: 'POST',
  });
}

export function setPlatformCourseVideos(
  courseId: string,
  videoIds: string[],
): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}/videos`, {
    method: 'PUT',
    body: JSON.stringify({ videoIds }),
  });
}

export function setPlatformCourseStructure(
  courseId: string,
  lessons: CourseLessonDraft[],
): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`${editorBase}/courses/${courseId}/structure`, {
    method: "PUT",
    body: JSON.stringify({ lessons }),
  });
}

export function listPlatformLibraryVideos(): Promise<PlatformLibraryVideo[]> {
  return requestJson<PlatformLibraryVideo[]>('/api/platform/catalog/videos');
}

export type VideoUploadStart =
  | {
      mode: 'direct';
      videoId: string;
      uploadUrl: string;
      method: 'PUT';
      headers: Record<string, string>;
      expiresAt: string;
      maxSizeBytes: number;
    }
  | { mode: 'multipart'; maxSizeBytes: number };

async function startVideoUpload(file: File): Promise<VideoUploadStart> {
  try {
    return await requestJson<VideoUploadStart>(`${uploadBase}/uploads`, {
      method: 'POST',
      body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
    });
  } catch (error) {
    // An API older than this web build has no /uploads route: keep using the multipart upload.
    if (error instanceof ApiError && error.status === 404) {
      return { mode: 'multipart', maxSizeBytes: 0 };
    }

    throw error;
  }
}

/** What a long upload reports while the file goes out, and how it is stopped. */
export interface UploadProgressOptions {
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException('O envio foi cancelado.', 'AbortError');
}

/**
 * Sends a body and reports how much of it went out. fetch has no upload progress, so with
 * onProgress the request goes through XMLHttpRequest and comes back as a Response.
 */
function sendBody(
  url: string,
  init: { method: string; body: Blob | FormData; headers: Headers; credentials: RequestCredentials },
  options: UploadProgressOptions,
): Promise<Response> {
  if (!options.onProgress || typeof XMLHttpRequest === 'undefined') {
    return fetch(url, { ...init, signal: options.signal });
  }

  const onProgress = options.onProgress;
  return new Promise<Response>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(init.method, url);
    xhr.withCredentials = init.credentials === 'include';
    init.headers.forEach((value, name) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    const abort = () => xhr.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const settle = () => options.signal?.removeEventListener('abort', abort);
    xhr.onload = () => {
      settle();
      resolve(new Response(xhr.status === 204 ? null : xhr.responseText, {
        status: xhr.status,
        headers: { 'Content-Type': xhr.getResponseHeader('Content-Type') ?? 'text/plain' },
      }));
    };
    xhr.onerror = () => { settle(); reject(new TypeError('Failed to fetch')); };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => { settle(); reject(abortError()); };
    xhr.send(init.body);
  });
}

async function uploadVideoMultipart(
  title: string,
  durationMilliseconds: number,
  file: File,
  courseId: string | undefined,
  options: UploadProgressOptions,
): Promise<PlatformCourseVideo> {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('durationMilliseconds', String(durationMilliseconds));
  formData.append('video', file);
  const path = courseId
    ? `/api/platform/catalog/courses/${courseId}/videos`
    : uploadBase;
  if (!options.onProgress) {
    return requestJson<PlatformCourseVideo>(path, { method: 'POST', body: formData, signal: options.signal });
  }

  const headers = new Headers({ Accept: 'application/json', 'X-CSRF-TOKEN': await currentAntiforgeryToken() });
  let response: Response;
  try {
    response = await sendBody(path, { method: 'POST', body: formData, headers, credentials: 'include' }, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    reportFailedRequest('POST', path, error);
    throw new ApiError('Não foi possível enviar o vídeo. Verifique a conexão e tente de novo.', 0);
  }
  if (response.status >= 500) reportFailedRequest('POST', path, response.status);
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<PlatformCourseVideo>;
}

export async function uploadPlatformVideo(
  title: string,
  durationMilliseconds: number,
  file: File,
  courseId?: string,
  options: UploadProgressOptions = {},
): Promise<PlatformCourseVideo> {
  const start = await startVideoUpload(file);
  if (options.signal?.aborted) throw abortError();
  if (start.mode !== 'direct') {
    return uploadVideoMultipart(title, durationMilliseconds, file, courseId, options);
  }

  // The bucket is another origin: no cookies and no CSRF header, only what the signed URL asks for.
  let put: Response;
  try {
    put = await sendBody(start.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: new Headers(start.headers),
      credentials: 'omit',
    }, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // network failure or a CORS refusal: the browser only says "Failed to fetch"
    throw new ApiError('Não foi possível enviar o vídeo. Verifique a conexão e tente de novo.', 0);
  }
  if (!put.ok) {
    throw new ApiError('Não foi possível enviar o vídeo. Verifique a conexão e tente de novo.', put.status);
  }

  return requestJson<PlatformCourseVideo>(
    `${uploadBase}/uploads/${start.videoId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ title, durationMilliseconds, courseId: courseId ?? null }),
    },
  );
}

/** A chunked upload: the file goes to the bucket in parts, and resumes from the parts already there. */
export interface ChunkedVideoUpload {
  mode: 'chunked';
  videoId: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
  maxPartsPerRequest: number;
  maxSizeBytes: number;
}

/** Null: this environment has no direct upload (or the API is older), send with uploadPlatformVideo. */
export async function startChunkedVideoUpload(contentType: string, sizeBytes: number): Promise<ChunkedVideoUpload | null> {
  try {
    const start = await requestJson<ChunkedVideoUpload | { mode: 'multipart' }>(`${uploadBase}/uploads/chunked`, {
      method: 'POST',
      body: JSON.stringify({ contentType, sizeBytes }),
    });
    return start.mode === 'chunked' ? start : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function signChunkedUploadParts(
  videoId: string,
  uploadId: string,
  partNumbers: number[],
): Promise<{ partNumber: number; url: string }[]> {
  const response = await requestJson<{ parts: { partNumber: number; url: string }[] }>(
    `${uploadBase}/uploads/${videoId}/parts`,
    { method: 'POST', body: JSON.stringify({ uploadId, partNumbers }) },
  );
  return response.parts;
}

export async function listChunkedUploadParts(
  videoId: string,
  uploadId: string,
): Promise<{ partNumber: number; sizeBytes: number }[]> {
  const response = await requestJson<{ parts: { partNumber: number; sizeBytes: number }[] }>(
    `${uploadBase}/uploads/${videoId}/parts/list`,
    { method: 'POST', body: JSON.stringify({ uploadId }) },
  );
  return response.parts;
}

export async function finishChunkedUpload(videoId: string, uploadId: string): Promise<void> {
  await request(`${uploadBase}/uploads/${videoId}/finish`, {
    method: 'POST',
    body: JSON.stringify({ uploadId }),
  });
}

export async function abortChunkedUpload(videoId: string, uploadId: string): Promise<void> {
  await request(`${uploadBase}/uploads/${videoId}/abort`, {
    method: 'POST',
    body: JSON.stringify({ uploadId }),
  });
}

export function completeUploadedVideo(
  videoId: string,
  title: string,
  durationMilliseconds: number,
  courseId?: string,
): Promise<PlatformCourseVideo> {
  return requestJson<PlatformCourseVideo>(`${uploadBase}/uploads/${videoId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ title, durationMilliseconds, courseId: courseId ?? null }),
  });
}

/**
 * Sends one part straight to the bucket (another origin: no cookies, no headers). Resolves with the
 * HTTP status; a network failure or a CORS refusal rejects with a TypeError.
 */
export async function putUploadPart(url: string, part: Blob, options: UploadProgressOptions): Promise<number> {
  const response = await sendBody(url, { method: 'PUT', body: part, headers: new Headers(), credentials: 'omit' }, options);
  return response.status;
}

export function createExternalPlatformVideo(data: {
  provider: 'YouTube' | 'Vimeo';
  url: string;
  title: string;
  durationMilliseconds: number | null;
}): Promise<PlatformCourseVideo> {
  return requestJson<PlatformCourseVideo>('/api/platform/catalog/videos/external', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function setPlatformCourseCover(courseId: string, file: File): Promise<PlatformCourse> {
  const formData = new FormData();
  formData.append('cover', file);
  return requestJson<PlatformCourse>(`${editorBase}/courses/${courseId}/cover`, {
    method: 'PUT',
    body: formData,
  });
}

export function removePlatformCourseCover(courseId: string): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`${editorBase}/courses/${courseId}/cover`, {
    method: 'DELETE',
  });
}

export function listGameModules(): Promise<GameModule[]> {
  return requestJson<GameModule[]>(`${editorBase}/modules`);
}

export function createGameModule(data: GameModuleData): Promise<GameModule> {
  return requestJson<GameModule>('/api/platform/catalog/modules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateGameModule(moduleId: string, data: GameModuleData): Promise<GameModule> {
  return requestJson<GameModule>(`/api/platform/catalog/modules/${moduleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGameModule(moduleId: string): Promise<void> {
  await request(`/api/platform/catalog/modules/${moduleId}`, { method: 'DELETE' });
}

export function setPlatformCourseModules(
  courseId: string,
  items: CourseModulePlacement[],
): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`${editorBase}/courses/${courseId}/modules`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

/** The games in the middle of a video, in one training: the same video in another training keeps its own. */
export function setVideoCheckpoints(
  courseId: string,
  videoId: string,
  items: VideoCheckpoint[],
): Promise<PlatformCourseVideo> {
  return requestJson<PlatformCourseVideo>(`${editorBase}/courses/${courseId}/videos/${videoId}/checkpoints`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export function changeCompanyPlan(companyId: string, plan: CompanyPlan): Promise<{ plan: CompanyPlan }> {
  return requestJson<{ plan: CompanyPlan }>(`/api/platform/companies/${companyId}/plan`, { method: 'PUT', body: JSON.stringify({ plan }) });
}

/** What the company can do, and the plan that grants it. */
export interface CompanyCapabilities {
  customizeGrid: boolean; customBranding: boolean; customCertificate: boolean; quizzes: boolean; internalVideos: boolean; plan?: CompanyPlan | null;
}
/** Which assuntos each plan cannot use (everything not listed is available). */
export interface PlanSubjects {
  /** companyId is set on an assunto with one company's internal videos: only that company sees it, and only on Diamante. */
  courses: { id: string; title: string; description: string | null; videoCount: number; categoryId?: string | null; companyId?: string | null }[];
  excluded: Record<string, string[]>;
}
export function getPlanSubjects(): Promise<PlanSubjects> {
  return requestJson<PlanSubjects>('/api/platform/catalog/plan-subjects');
}
export async function setPlanSubjects(plan: CompanyPlan, excludedCourseIds: string[]): Promise<void> {
  await request(`/api/platform/catalog/plan-subjects/${plan}`, { method: 'PUT', body: JSON.stringify({ excludedCourseIds }) });
}
/** Makes an assunto the internal videos of one company (Diamante), or gives it back to every company (null). */
export async function setSubjectCompany(courseId: string, companyId: string | null): Promise<void> {
  await request(`/api/platform/catalog/plan-subjects/courses/${courseId}/company`, { method: 'PUT', body: JSON.stringify({ companyId }) });
}

export function getCompanyCapabilities(): Promise<CompanyCapabilities> {
  return requestJson<CompanyCapabilities>('/api/admin/capabilities');
}

export function createPlatformCompany(data: PlatformCompanyData): Promise<PlatformCompany> {
  return requestJson<PlatformCompany>('/api/platform/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listPlatformUsers(
  offset = 0,
  limit = 50,
  tenantId?: string,
  search?: string,
  role?: PlatformUserRoleFilter,
): Promise<PlatformUserDirectoryPage> {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (tenantId) query.set('tenantId', tenantId);
  if (search?.trim()) query.set('search', search.trim());
  if (role) query.set('role', role);
  return requestJson<PlatformUserDirectoryPage>(
    `/api/platform/users?${query.toString()}`,
  );
}

export function createPlatformUser(data: PlatformUserProvisionData): Promise<PlatformUserSummary> {
  return requestJson<PlatformUserSummary>('/api/platform/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** With `unitId`, the server sends the people of that unit only (the pages of a company with a unit chosen at the top). */
const unitQuery = (unitId: string | null | undefined, first: boolean) => unitId ? `${first ? '?' : '&'}unitId=${encodeURIComponent(unitId)}` : '';

export function listParticipants(offset = 0, limit = 100, unitId?: string | null): Promise<ParticipantAccountPage> {
  return requestJson<ParticipantAccountPage>(
    `/api/admin/users/participants?offset=${offset}&limit=${limit}${unitQuery(unitId, false)}`,
  );
}

export async function listAllParticipants(unitId?: string | null): Promise<ParticipantAccount[]> {
  const participants: ParticipantAccount[] = [];
  let offset = 0;
  let totalCount = 1;

  while (offset < totalCount) {
    const page = await (unitId ? listParticipants(offset, 100, unitId) : listParticipants(offset, 100));
    participants.push(...page.items);
    totalCount = page.totalCount;
    if (page.items.length === 0) break;
    offset += page.items.length;
  }

  return participants;
}

export function createParticipant(data: CreateParticipantData): Promise<ParticipantAccount> {
  return requestJson<ParticipantAccount>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listTenantLearningTracks(): Promise<LearningTrackSummary[]> {
  return requestJson<LearningTrackSummary[]>('/api/admin/learning/tracks');
}

export interface LearningParticipantReport {
  participantId: string;
  loginIdentifier: string;
  displayName: string;
  tracks: LearningExperience[];
}

export function getLearningParticipantReport(participantId: string): Promise<LearningParticipantReport> {
  return requestJson<LearningParticipantReport>(`/api/admin/learning/participants/${participantId}/report`);
}

/** The administrator corrects the name of a collaborator of the company. */
export function renameUser(userId: string, displayName: string): Promise<ParticipantAccount> {
  return requestJson<ParticipantAccount>(`/api/admin/users/${userId}/display-name`, {
    method: 'PUT',
    body: JSON.stringify({ displayName }),
  });
}

/** The administrator changes the registration (login) a collaborator signs in with. */
export function changeEmployeeLogin(userId: string, loginIdentifier: string): Promise<{ loginIdentifier: string }> {
  return requestJson<{ loginIdentifier: string }>(`/api/admin/users/${userId}/login`, { method: 'PUT', body: JSON.stringify({ loginIdentifier }) });
}

/** The administrator sets a new password for a collaborator. */
export async function resetEmployeePassword(userId: string, newPassword: string): Promise<void> {
  await request(`/api/admin/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
}

export function changeUserStatus(userId: string, isActive: boolean): Promise<ParticipantAccount> {
  return requestJson<ParticipantAccount>(`/api/admin/users/${userId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ isActive }),
  });
}

export function listLearningParticipation(unitId?: string | null): Promise<LearningParticipantProgress[]> {
  return requestJson<LearningParticipantProgress[]>(`/api/admin/learning/participation${unitQuery(unitId, true)}`);
}

export function getLearningTrackDraft(trackId: string): Promise<LearningTrackDraft> {
  return requestJson<LearningTrackDraft>(`/api/admin/learning/tracks/${trackId}/draft`);
}

export function createLearningTrack(
  sipatEventId: string,
  data: LearningTrackData,
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`/api/admin/sipats/${sipatEventId}/tracks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function addLearningLesson(
  trackId: string,
  data: LearningLessonData,
): Promise<LearningLessonCreated> {
  return requestJson<LearningLessonCreated>(`/api/admin/learning/tracks/${trackId}/lessons`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function publishLearningTrack(trackId: string): Promise<void> {
  return requestJson<void>(`/api/admin/learning/tracks/${trackId}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function assignLearningTrack(
  trackId: string,
  participantId: string,
): Promise<void> {
  return requestJson<void>(`/api/admin/learning/tracks/${trackId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ participantId }),
  });
}

export function listSipatEvents(offset = 0, limit = 20): Promise<SipatEventPage> {
  return requestJson<SipatEventPage>(
    `/api/admin/sipats?offset=${offset}&limit=${limit}`,
  );
}

export async function createSipatEvent(data: SipatEventData): Promise<SipatEvent> {
  return requestJson<SipatEvent>('/api/admin/sipats', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSipatEvent(
  id: string,
  data: SipatEventData,
): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function publishSipatEvent(id: string): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function reactivateSipatEvent(id: string): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}/reactivate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function cancelSipatEvent(id: string): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function listAssignedLearningTracks(): Promise<LearningTrackCard[]> {
  return requestJson<LearningTrackCard[]>('/api/learning/tracks');
}

export function getAssignedLearningTrack(trackId: string): Promise<LearningExperience> {
  return requestJson<LearningExperience>(`/api/learning/tracks/${trackId}`);
}

export function startLearningPlayback(
  trackId: string,
  lessonId: string,
): Promise<LearningPlaybackSession> {
  return requestJson<LearningPlaybackSession>(
    `/api/learning/tracks/${trackId}/lessons/${lessonId}/playback`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function primeAntiforgeryToken(): Promise<void> {
  try {
    await currentAntiforgeryToken();
  } catch {
    // The measurement must never disturb the video.
  }
}

/** The player's quality summary plus the lesson and the API playback session it belongs to. */
export interface PlaybackQualitySummary extends PlayerQualitySummary { lessonId: string; playbackSessionId: string }

export async function sendPlaybackQuality(
  trackId: string,
  summary: PlaybackQualitySummary,
): Promise<void> {
  const token = await currentAntiforgeryToken();
  const response = await fetch(`/api/learning/tracks/${trackId}/playback-quality`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
    body: JSON.stringify(summary),
  });
  // A rejected send may mean a stale token: the next send fetches a fresh one. No retry here.
  if (!response.ok) cachedAntiforgeryToken = null;
}

export function saveLearningPosition(
  trackId: string,
  lessonId: string,
  positionMilliseconds: number,
): Promise<LearningProgress> {
  return requestJson<LearningProgress>(
    `/api/learning/tracks/${trackId}/lessons/${lessonId}/position`,
    {
      method: 'PUT',
      body: JSON.stringify({ positionMilliseconds }),
    },
  );
}

export function recordLearningPlaybackRange(
  trackId: string,
  lessonId: string,
  sessionId: string,
  startMilliseconds: number,
  endMilliseconds: number,
  positionMilliseconds: number,
): Promise<LearningProgress> {
  return requestJson<LearningProgress>(
    `/api/learning/tracks/${trackId}/lessons/${lessonId}/ranges`,
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        startMilliseconds,
        endMilliseconds,
        positionMilliseconds,
      }),
    },
  );
}

export interface CourseCategory { id: string; name: string; courseCount: number }

export function listCourseCategories(): Promise<CourseCategory[]> {
  return requestJson<CourseCategory[]>('/api/platform/catalog/categories');
}

export function createCourseCategory(name: string): Promise<CourseCategory> {
  return requestJson<CourseCategory>('/api/platform/catalog/categories', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function renameCourseCategory(id: string, name: string): Promise<void> {
  await request(`/api/platform/catalog/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
}

export async function deleteCourseCategory(id: string): Promise<void> {
  await request(`/api/platform/catalog/categories/${id}`, { method: 'DELETE' });
}

export async function setCourseReadySipat(courseId: string, ready: boolean): Promise<void> {
  await request(`/api/platform/catalog/courses/${courseId}/ready-sipat`, { method: 'PUT', body: JSON.stringify({ ready }) });
}

export async function setCourseCategory(courseId: string, categoryId: string | null): Promise<void> {
  await request(`/api/platform/catalog/courses/${courseId}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) });
}

export type QualityLevel = 'Good' | 'Attention' | 'Poor';
export interface QualityIndicator { value: number | null; level: QualityLevel | null }
export interface QualityIndicators {
  sessions: number; startedSessions: number; neverStartedPercent: QualityIndicator;
  stalledSessionsPercent: QualityIndicator; averageStartupMilliseconds: QualityIndicator; stalledTimePercent: QualityIndicator;
}
export interface QualityBreakdownItem { key: string | null; indicators: QualityIndicators }
export interface CompanyPlaybackQuality {
  companyId: string; companyName: string; companyKey: string;
  sipats: { id: string; title: string; startsAt: string }[]; sipatId: string | null; day: number | null; days: number[];
  indicators: QualityIndicators; byHour: { hour: number; sessions: number; stalledSessions: number }[];
  byConnection: QualityBreakdownItem[]; byDevice: QualityBreakdownItem[]; byQuality: QualityBreakdownItem[]; byDay: QualityBreakdownItem[];
  videos: { videoId: string | null; title: string; indicators: QualityIndicators }[];
  people: { participantId: string; displayName: string; loginIdentifier: string; sessions: number; neverStarted: number; stalledTimePercent: number }[];
}
export interface QualityFilter { sipatId?: string | null; day?: number | null }

function qualityQuery(filter: QualityFilter = {}): string {
  const query = new URLSearchParams();
  if (filter.sipatId) query.set('sipatId', filter.sipatId);
  if (filter.day !== null && filter.day !== undefined) query.set('day', String(filter.day));
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function getCompanyPlaybackQuality(companyId: string, filter: QualityFilter = {}): Promise<CompanyPlaybackQuality> {
  return requestJson<CompanyPlaybackQuality>(`/api/platform/companies/${encodeURIComponent(companyId)}/playback-quality${qualityQuery(filter)}`);
}

export function playbackQualitySummaryUrl(companyId: string, filter: QualityFilter = {}): string {
  return `/api/platform/companies/${encodeURIComponent(companyId)}/playback-quality/summary.pdf${qualityQuery(filter)}`;
}

export interface PlaybackQualityComparison {
  from: string; to: string;
  companies: { companyId: string; name: string; indicators: QualityIndicators }[];
}

export function getPlaybackQualityComparison(period: { from?: string; to?: string } = {}): Promise<PlaybackQualityComparison> {
  const query = new URLSearchParams();
  if (period.from) query.set('from', period.from);
  if (period.to) query.set('to', period.to);
  const text = query.toString();
  return requestJson<PlaybackQualityComparison>(`/api/platform/playback-quality${text ? `?${text}` : ''}`);
}

export interface RegistryItem { id: string; name: string; isActive: boolean; peopleCount: number }
export interface ProfileRules {
  requireRegistration: boolean; requireEmail: boolean; requirePhone: boolean; requireUnit: boolean; requireSector: boolean;
}
/** A sector that exists inside a unit (the HR of Minas), and how many people of that unit are in it. */
export interface UnitSector { unitId: string; sectorId: string; peopleCount: number }
export interface CompanyRegistry { units: RegistryItem[]; sectors: RegistryItem[]; rules: ProfileRules; unitSectors?: UnitSector[] }
export type RegistryKind = 'units' | 'sectors';

/**
 * The header that runs one company-administration call for the company the platform operator is looking at, without
 * switching the whole portal into that company (the server accepts it only from the operator, on the platform host).
 */
const forCompany = (companyId?: string): HeadersInit | undefined =>
  companyId ? { 'X-Sipat-Company': companyId } : undefined;

export function getCompanyRegistry(companyId?: string): Promise<CompanyRegistry> {
  return requestJson<CompanyRegistry>('/api/admin/registry', { headers: forCompany(companyId) });
}

/** Tells the unit switcher at the top that the lists changed (see trainings/unitScope). */
const registryChanged = <T,>(value: T): T => { try { window.dispatchEvent(new Event('sipat:registry-changed')); } catch { /* no window: nothing to tell */ } return value; };

export async function addRegistryItems(kind: RegistryKind, names: string[]): Promise<CompanyRegistry> {
  return registryChanged(await requestJson<CompanyRegistry>(`/api/admin/registry/${kind}`, { method: 'POST', body: JSON.stringify({ names }) }));
}

export async function updateRegistryItem(kind: RegistryKind, id: string, change: { name?: string; isActive?: boolean }): Promise<RegistryItem> {
  return registryChanged(await requestJson<RegistryItem>(`/api/admin/registry/${kind}/${id}`, { method: 'PUT', body: JSON.stringify(change) }));
}

/** Makes sectors inside a unit; a name the company already has is that same sector, brought into the unit. */
export async function addUnitSectors(unitId: string, names: string[]): Promise<CompanyRegistry> {
  return registryChanged(await requestJson<CompanyRegistry>(`/api/admin/registry/units/${unitId}/sectors`, { method: 'POST', body: JSON.stringify({ names }) }));
}
/** Takes a sector out of a unit (refused while someone of the unit is in it); it stays in the company's list. */
export async function removeUnitSector(unitId: string, sectorId: string): Promise<CompanyRegistry> {
  return registryChanged(await requestJson<CompanyRegistry>(`/api/admin/registry/units/${unitId}/sectors/${sectorId}`, { method: 'DELETE' }));
}

/** Takes a unit or sector off the list: deleted when nobody uses it, only put away (`deleted: false`) when in use. */
export async function removeRegistryItem(kind: RegistryKind, id: string): Promise<{ deleted: boolean }> {
  return registryChanged(await requestJson<{ deleted: boolean }>(`/api/admin/registry/${kind}/${id}`, { method: 'DELETE' }));
}

/**
 * One group a training is for: a unit (`sectorId` null: all of it), a sector of a unit, or (`unitId` null) a sector in
 * every unit. A training with no group is for the whole company.
 */
export interface AudienceTarget { unitId: string | null; sectorId: string | null }
export interface TrainingAudience { targets: AudienceTarget[] }
const tidyAudience = (audience: Partial<TrainingAudience> | null | undefined): TrainingAudience => ({
  targets: (audience?.targets ?? []).map(target => ({ unitId: target.unitId ?? null, sectorId: target.sectorId ?? null })),
});
export async function getTrainingAudience(sipatId: string): Promise<TrainingAudience> {
  return tidyAudience(await requestJson<TrainingAudience>(`/api/admin/sipats/${sipatId}/audience`));
}
export async function saveTrainingAudience(sipatId: string, audience: TrainingAudience): Promise<TrainingAudience> {
  return tidyAudience(await requestJson<TrainingAudience>(`/api/admin/sipats/${sipatId}/audience`, { method: 'PUT', body: JSON.stringify(audience) }));
}
/** How many active participants an audience reaches, and how many it leaves out only for having no unit or sector. */
export function countAudience(audience: TrainingAudience): Promise<{ receiving: number; leftOutUnplaced: number }> {
  return requestJson<{ receiving: number; leftOutUnplaced: number }>('/api/admin/registry/audience-count', { method: 'POST', body: JSON.stringify(audience) });
}

export function saveProfileRules(rules: ProfileRules): Promise<ProfileRules> {
  return requestJson<ProfileRules>('/api/admin/registry/rules', { method: 'PUT', body: JSON.stringify(rules) });
}

export interface ParticipantProfile {
  id: string; registrationNumber: string | null; email: string | null; phone: string | null; unitId: string | null; sectorId: string | null;
}
export type ProfileChange = Omit<ParticipantProfile, 'id'>;

export function listParticipantProfiles(unitId?: string | null): Promise<ParticipantProfile[]> {
  return requestJson<ParticipantProfile[]>(`/api/admin/users/participants/profiles${unitQuery(unitId, true)}`);
}

export function saveParticipantProfile(userId: string, data: ProfileChange): Promise<ParticipantProfile> {
  return requestJson<ParticipantProfile>(`/api/admin/users/${userId}/profile`, { method: 'PUT', body: JSON.stringify(data) });
}

/** Moves many collaborators to one unit or sector at once; a null `valueId` takes them out of it. */
/** What moving people did: how many moved, the days of trainings they received and lost, and the trainings received. */
export interface PlacementResult { changed: number; added: number; removed: number; receivedTrainings: string[] }
export function changePlacement(userIds: string[], field: 'unit' | 'sector', valueId: string | null): Promise<PlacementResult> {
  return requestJson<PlacementResult>('/api/admin/users/placement', { method: 'PUT', body: JSON.stringify({ userIds, field, valueId }) });
}

export interface ImportRow {
  row: number; name?: string | null; login?: string | null; registrationNumber?: string | null; email?: string | null;
  phone?: string | null; unit?: string | null; sector?: string | null; password?: string | null;
}
export interface ImportResult {
  created: number; updated: number; unchanged: number;
  rejected: { row: number; login: string | null; message: string }[];
  credentials: { row: number; name: string; login: string }[];
  /** Units and sectors the sheet brings that the company did not have: the import adds them. */
  newUnits?: string[] | null; newSectors?: string[] | null;
}

/**
 * Reads the HR sheet on the server; with `dryRun` nothing is written. With `createOnly` (the form of one person) a line that
 * names someone who already exists is refused instead of updating them.
 */
export function importParticipants(dryRun: boolean, rows: ImportRow[], options?: { createOnly?: boolean; companyId?: string }): Promise<ImportResult> {
  return requestJson<ImportResult>('/api/admin/users/import', {
    method: 'POST', body: JSON.stringify({ dryRun, rows, createOnly: options?.createOnly ?? false }), headers: forCompany(options?.companyId),
  });
}
