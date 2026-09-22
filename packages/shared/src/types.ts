export type NavTab = 'home' | 'projects' | 'notes' | 'files' | 'settings';

export type ProjectStatus = 'In Progress' | 'Planning' | 'Exploring' | 'Live' | 'Prototype' | 'Idea';

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: ProjectStatus;
  updatedAt: string;
  updatedTimestamp: number;
  thumbnailGradient: string;
  thumbnailStyle?: 'gradient' | 'plant' | 'minimal' | 'monochrome';
  externalUrl?: string;
  workerUrl?: string;
  stack: string[];
  stars?: number;
  category: 'core' | 'experiment' | 'utility';
}

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

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  status: number;
}
