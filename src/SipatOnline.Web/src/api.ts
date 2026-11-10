export interface TenantBranding {
  tenantKey: string;
  tenantName: string;
  logoReference: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDomain: string | null;
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

export interface PlatformCourse {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  videos: PlatformCourseVideo[];
}

export interface PlatformCourseVideo {
  id: string;
  title: string;
  contentType: string;
  sizeBytes: number;
  durationMilliseconds: number;
  createdAt: string;
  fileUrl: string;
}

export interface PlatformCourseData {
  title: string;
  description: string | null;
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
  role: 'Participant' | 'ClientAdmin';
}

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

export function listPlatformCourses(): Promise<PlatformCourse[]> {
  return requestJson<PlatformCourse[]>('/api/platform/catalog/courses');
}

export function createPlatformCourse(data: PlatformCourseData): Promise<PlatformCourse> {
  return requestJson<PlatformCourse>('/api/platform/catalog/courses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function uploadPlatformCourseVideo(
  courseId: string,
  title: string,
  durationMilliseconds: number,
  file: File,
): Promise<PlatformCourseVideo> {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('durationMilliseconds', String(durationMilliseconds));
  formData.append('video', file);
  return requestJson<PlatformCourseVideo>(
    `/api/platform/catalog/courses/${courseId}/videos`,
    { method: 'POST', body: formData },
  );
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
): Promise<PlatformUserDirectoryPage> {
  const tenantFilter = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : '';
  return requestJson<PlatformUserDirectoryPage>(
    `/api/platform/users?offset=${offset}&limit=${limit}${tenantFilter}`,
  );
}

export function createPlatformUser(data: PlatformUserProvisionData): Promise<PlatformUserSummary> {
  return requestJson<PlatformUserSummary>('/api/platform/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listParticipants(): Promise<ParticipantAccountPage> {
  return requestJson<ParticipantAccountPage>('/api/admin/users/participants?offset=0&limit=100');
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
