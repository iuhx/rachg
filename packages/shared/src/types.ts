export type NavTab = 'home' | 'projects' | 'notes' | 'files' | 'mail' | 'tools' | 'settings';

export const TODO_LIMITS = { text: 300, perDay: 100 } as const;
export interface TodoItem {
  id: string;
  date: string;
  text: string;
  completed: boolean;
  revision: number;
  createdTimestamp: number;
  updatedTimestamp: number;
}
export interface TodoDaySummary { date: string; total: number; completed: number }

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'Completed', 'Archived'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export const PROJECT_LIMITS = { name: 120, tagline: 200, descriptionBytes: 10_000, externalUrl: 2048, count: 200 } as const;

export interface ProjectInput {
  name: string;
  tagline: string;
  description: string;
  status: ProjectStatus;
  externalUrl: string;
}

export interface Project extends ProjectInput {
  id: string;
  revision: number;
  createdTimestamp: number;
  updatedAt: string;
  updatedTimestamp: number;
}

export interface ProjectListResponse { success: boolean; projects: Project[]; limit: number }
export interface ProjectResponse { success: boolean; project: Project }

export type FileCategory = 'image' | 'pdf' | 'archive' | 'video' | 'text' | 'keynote' | 'code';

export interface FileItem {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  updatedAt: string;
  expiresIn?: string;
  expiresTimestamp?: number;
  shareUrl?: string;
  type: FileCategory;
  downloads?: number;
  status: 'active' | 'expired' | 'deleted';
  ownerId?: string; // extensible for Cloudflare Access / user identity
}

export interface NoteItem {
  categoryId?: string | null;
  categoryName?: string | null;
  pinned?: boolean;
  organizationRevision?: number;
  id: string;
  title: string;
  excerpt: string;
  content: string;
  updatedAt: string;
  updatedTimestamp: number;
}

// -------------------------------------------------------------
// Versioned API Contracts (v1)
// Base: /v1/files
// -------------------------------------------------------------

export interface AuthContext {
  userId?: string;
  userEmail?: string;
  authType: 'anonymous' | 'token' | 'cf_access' | 'bearer';
}

export interface UploadResponse {
  success: boolean;
  file: FileItem;
  shareUrl: string;
}

export interface FileListResponse {
  success: boolean;
  files: FileItem[];
  totalSizeBytes: number;
  maxSizeBytes: number; // 4GB max quota
  usagePercent: number;
}

export interface FileDetailResponse {
  success: boolean;
  file: FileItem;
}

export interface FileDeleteResponse {
  success: boolean;
  message: string;
  id: string;
}

export interface NoteListResponse {
  success: boolean;
  notes: NoteItem[];
}

export interface NoteResponse {
  success: boolean;
  note: NoteItem;
}

export interface NoteDeleteResponse {
  success: boolean;
  message: string;
  id: string;
}

export interface MailItem {
  id: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: number;
  preview: string;
}

export interface MailMessage extends MailItem {
  replyTo?: string;
  text: string;
  messageId?: string;
  references?: string;
}

export interface MailListResponse {
  success: boolean;
  messages: MailItem[];
}

export interface MailResponse {
  success: boolean;
  message: MailMessage;
}

export interface MailDeleteResponse {
  success: boolean;
  message: string;
  id: string;
}

export interface MailQuote {
  from: string;
  subject: string;
  receivedAt: number;
  text: string;
}

export interface MailSendRequest {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  quote?: MailQuote;
}

export interface MailSendResponse {
  success: boolean;
  id: string;
  resendId: string;
}

export interface SentMailItem {
  id: string;
  resendId: string | null;
  to: string;
  subject: string;
  sentAt: number;
  preview: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
}

export interface SentMailMessage extends SentMailItem {
  text: string;
  inReplyTo?: string;
  references?: string;
}

export interface SentMailListResponse {
  success: boolean;
  messages: SentMailItem[];
}

export interface SentMailResponse {
  success: boolean;
  message: SentMailMessage;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  status: number;
}
