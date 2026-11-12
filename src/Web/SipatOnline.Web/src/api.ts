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

export interface PlatformCompanyOverview extends PlatformCompany {
  employeeCount: number;
  administratorCount: number;
  totalUserCount: number;
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
export type GamificationGameType = 'Quiz' | 'RiskSpotting' | 'Puzzle' | 'Memory' | 'Scenario' | 'Ordering';

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
}

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

export function saveLearningActivityOutcome(trackId: string, activityId: string, outcome: string): Promise<{ saved: boolean }> {
  return requestJson(`/api/learning/tracks/${trackId}/activities/${activityId}/outcome`, {
    method: 'PUT', body: JSON.stringify({ outcome }),
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
  checkpoints: VideoCheckpoint[];
  lessonId?: string | null;
  libraryTitle?: string | null;
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

  try {
    const problem = (await response.json()) as { detail?: string; title?: string };
    message = problem.detail ?? problem.title ?? message;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return new ApiError(message, response.status);
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

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('X-CSRF-TOKEN', await getAntiforgeryToken());
  }

  if (
    init.body &&
    !headers.has('Content-Type') &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    method,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw await readError(response);
  }

  return response;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json() as Promise<T>;
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
}

export async function signOut(platform = false): Promise<void> {
  await request(platform ? '/api/platform/identity/logout' : '/api/identity/logout', {
    method: 'POST',
  });
}

export function listPlatformCompanies(): Promise<PlatformCompany[]> {
  return requestJson<PlatformCompany[]>('/api/platform/companies');
}

export function getPlatformDashboard(): Promise<PlatformCompanyOverview[]> {
  return requestJson<PlatformCompanyOverview[]>('/api/platform/dashboard');
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
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}`, {
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
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}/structure`, {
    method: "PUT",
    body: JSON.stringify({ lessons }),
  });
}

export function listPlatformLibraryVideos(): Promise<PlatformLibraryVideo[]> {
  return requestJson<PlatformLibraryVideo[]>('/api/platform/catalog/videos');
}

export function uploadPlatformVideo(
  title: string,
  durationMilliseconds: number,
  file: File,
  courseId?: string,
): Promise<PlatformCourseVideo> {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('durationMilliseconds', String(durationMilliseconds));
  formData.append('video', file);
  return requestJson<PlatformCourseVideo>(
    courseId
      ? `/api/platform/catalog/courses/${courseId}/videos`
      : '/api/platform/catalog/videos',
    { method: 'POST', body: formData },
  );
}

export function setPlatformCourseCover(courseId: string, file: File): Promise<PlatformCourse> {
  const formData = new FormData();
  formData.append('cover', file);
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}/cover`, {
    method: 'PUT',
    body: formData,
  });
}

export function removePlatformCourseCover(courseId: string): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}/cover`, {
    method: 'DELETE',
  });
}

export function listGameModules(): Promise<GameModule[]> {
  return requestJson<GameModule[]>('/api/platform/catalog/modules');
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
  return requestJson<PlatformCourse>(`/api/platform/catalog/courses/${courseId}/modules`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export function setVideoCheckpoints(
  videoId: string,
  items: VideoCheckpoint[],
): Promise<PlatformCourseVideo> {
  return requestJson<PlatformCourseVideo>(`/api/platform/catalog/videos/${videoId}/checkpoints`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
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

export function listParticipants(offset = 0, limit = 100): Promise<ParticipantAccountPage> {
  return requestJson<ParticipantAccountPage>(
    `/api/admin/users/participants?offset=${offset}&limit=${limit}`,
  );
}

export async function listAllParticipants(): Promise<ParticipantAccount[]> {
  const participants: ParticipantAccount[] = [];
  let offset = 0;
  let totalCount = 1;

  while (offset < totalCount) {
    const page = await listParticipants(offset, 100);
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

export function listLearningParticipation(): Promise<LearningParticipantProgress[]> {
  return requestJson<LearningParticipantProgress[]>('/api/admin/learning/participation');
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
