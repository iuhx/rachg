export type NavTab = 'home' | 'projects' | 'notes' | 'files' | 'tools' | 'settings';

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

export interface FileItem {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  updatedAt: string;
  expiresIn?: string;
  expiresTimestamp?: number;
  shareUrl?: string;
  type: 'image' | 'pdf' | 'archive' | 'video' | 'text' | 'keynote' | 'code';
  downloads?: number;
  status: 'active' | 'expired';
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

export interface ToolItem {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: ProjectStatus;
  updatedAt: string;
  workerEndpoint: string;
  isExternal: boolean;
  category: 'utility' | 'experiment' | 'ai' | 'infra';
  thumbnailGradient: string;
}

export interface ActivityItem {
  id: string;
  type: 'project' | 'file' | 'note' | 'tool';
  action: string;
  target: string;
  timestamp: string;
}

export interface CloudflareBinding {
  service: string;
  bindingName: string;
  status: 'connected' | 'configured' | 'pending';
  details: string;
}
