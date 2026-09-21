export type NavTab = 'home' | 'files' | 'notes' | 'projects' | 'settings';

export type ProjectStatus = 'Planning' | 'In Progress' | 'Live' | 'Archived';

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: ProjectStatus;
  updatedAt: string;
  updatedTimestamp: number;
  externalUrl?: string;
  stack?: string[];
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
  deleteToken?: string;
  ownerId?: string;
}

export interface NoteItem {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  updatedAt: string;
  updatedTimestamp: number;
  tags: string[];
  readTime: string;
  pinned?: boolean;
}

// -------------------------------------------------------------
// Versioned API Contracts (v1)
// Base: /v1/files
// -------------------------------------------------------------

export interface UploadResponse {
  success: boolean;
  file: FileItem;
  shareUrl: string;
  deleteToken: string;
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

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  status: number;
}
