import { PROJECT_STATUSES, type Project, type ProjectInput, type ProjectListResponse, type ProjectResponse } from '@rachg/shared';
import { AuthenticationRequiredError } from './fileService';
import { API_BASE_URL } from '../config/api';

const API = `${API_BASE_URL}/v1/projects`;
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (response.status === 401 || response.status === 403 || response.redirected || response.url.includes('/cdn-cgi/access/login')) throw new AuthenticationRequiredError();
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Unable to save or load projects (HTTP ${response.status}).`);
  if (!data || data.success !== true) throw new Error('The server returned an invalid project response. Please refresh and try again.');
  return data as T;
}
function validProject(value: Project): boolean {
  return Boolean(value && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.tagline === 'string' &&
    typeof value.description === 'string' && typeof value.externalUrl === 'string' && PROJECT_STATUSES.includes(value.status) &&
    Number.isSafeInteger(value.revision) && value.revision > 0 && Number.isFinite(value.updatedTimestamp) && typeof value.updatedAt === 'string');
}
function savedProject(data: ProjectResponse): Project {
  if (!validProject(data.project)) throw new Error('The server returned an invalid project. Refresh before trying again.');
  return data.project;
}
export async function fetchProjects(): Promise<Project[]> {
  const data = await request<ProjectListResponse>('');
  if (!Array.isArray(data.projects) || !data.projects.every(validProject)) throw new Error('Unable to read the project list.');
  return data.projects;
}
export async function saveProject(id: string, input: ProjectInput, revision?: number): Promise<Project> {
  const data = revision === undefined
    ? await request<ProjectResponse>('', { method: 'POST', body: JSON.stringify({ ...input, id }) })
    : await request<ProjectResponse>(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...input, revision }) });
  return savedProject(data);
}
export async function deleteProject(id: string, revision: number): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ revision }) });
}
