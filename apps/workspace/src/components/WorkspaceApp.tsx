import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DashboardView } from './DashboardView';
import { ProjectsView } from './ProjectsView';
import { NotesView } from './NotesView';
import { FilesView } from './FilesView';
import { ToolsView } from './ToolsView';
import { SettingsView } from './SettingsView';
import { CommandPalette } from './CommandPalette';
import { NewItemModal } from './NewItemModal';
import { DetailDrawer } from './DetailDrawer';
import {
  INITIAL_PROJECTS,
  INITIAL_FILES,
  INITIAL_TRANSFERS,
  INITIAL_NOTES,
  INITIAL_EXPERIMENTS,
} from '../data/mockData';
import {
  fetchActiveFiles,
  uploadFileService,
  deleteFileService,
} from '../services/fileService';
import type { NavTab, Project, FileItem, NoteItem, ToolItem } from '../types';

export const WorkspaceApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false); // default Studio Duo mode matching mockup

  // Data states
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>(INITIAL_FILES);
  const [transfers, setTransfers] = useState<FileItem[]>(INITIAL_TRANSFERS);
  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  const [experiments, setExperiments] = useState<ToolItem[]>(INITIAL_EXPERIMENTS);
  const [isUploading, setIsUploading] = useState(false);

  // Command palette and modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [newModalType, setNewModalType] = useState<'project' | 'note' | 'transfer' | 'experiment' | null>(null);

  // Detail drawer
  const [detailItem, setDetailItem] = useState<Project | NoteItem | ToolItem | null>(null);
  const [detailType, setDetailType] = useState<'project' | 'note' | 'tool' | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sync dark mode class to html element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Load active transfers from Worker on mount
  useEffect(() => {
    fetchActiveFiles().then((liveFiles) => {
      if (liveFiles && liveFiles.length > 0) {
        setTransfers(liveFiles);
      }
    });
  }, []);

  // Handlers for creating items
  const handleCreateProject = (p: Partial<Project>) => {
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: p.name || 'Untitled Project',
      tagline: p.tagline || 'New software initiative',
      description: p.description || '',
      status: p.status || 'Planning',
      updatedAt: 'Just now',
      updatedTimestamp: Date.now(),
      thumbnailGradient: 'radial-gradient(circle at 50% 50%, #2f343b 0%, #16171b 100%)',
      thumbnailStyle: 'gradient',
      stack: p.stack || ['Cloudflare Workers'],
      category: 'core',
    };
    setProjects([newProject, ...projects]);
    showToast(`Project "${newProject.name}" created.`);
  };

  const handleCreateNote = (n: Partial<NoteItem>) => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: n.title || 'Untitled Note',
      excerpt: n.excerpt || '',
      content: n.content || '',
      updatedAt: 'Just now',
      updatedTimestamp: Date.now(),
      tags: n.tags || ['Thought'],
      readTime: '1 min read',
    };
    setNotes([newNote, ...notes]);
    showToast(`Note "${newNote.title}" saved.`);
  };

  const handleCreateExperiment = (e: Partial<ToolItem>) => {
    const newExp: ToolItem = {
      id: `exp-${Date.now()}`,
      name: e.name || 'New Experiment',
      tagline: e.tagline || 'Exploratory service',
      description: 'Independent edge experiment.',
      status: 'Exploring',
      updatedAt: 'Just now',
      workerEndpoint: e.workerEndpoint || 'exp.rachg.workers.dev',
      isExternal: false,
      category: 'experiment',
      thumbnailGradient: 'radial-gradient(circle at 50% 50%, #303742 0%, #0d0f14 100%)',
    };
    setExperiments([newExp, ...experiments]);
    showToast(`Experiment "${newExp.name}" added.`);
  };

  // Upload file via file-service Worker (R2 + D1) with fallback
  const handleUploadFile = async (file: File, expiry: string = '48 hours') => {
    setIsUploading(true);
    try {
      const { file: uploadedFile, isLive } = await uploadFileService(file, expiry);
      setTransfers([uploadedFile, ...transfers]);
      setRecentFiles([uploadedFile, ...recentFiles]);
      if (isLive) {
        showToast(`Uploaded "${file.name}" to Cloudflare R2 (D1 registered).`);
      } else {
        showToast(`Saved "${file.name}" (local demo fallback).`);
      }
    } catch (err: any) {
      showToast(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    const item = transfers.find((t) => t.id === id);
    await deleteFileService(id, item?.deleteToken);
    setTransfers(transfers.filter((t) => t.id !== id));
    showToast('File transfer revoked.');
  };

  const handleUpdateNote = (updated: NoteItem) => {
    setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
    showToast(`Note "${updated.title}" updated.`);
  };

  const handleResetWorkspace = () => {
    setProjects(INITIAL_PROJECTS);
    setRecentFiles(INITIAL_FILES);
    setTransfers(INITIAL_TRANSFERS);
    setNotes(INITIAL_NOTES);
    setExperiments(INITIAL_EXPERIMENTS);
    showToast('Workspace state reset to defaults.');
  };

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'dark bg-[#0f1013]' : 'bg-[#f7f7f8]'}`}>
      {/* Sidebar (Permanent dark obsidian sidebar matching screenshot) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main Workspace Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <TopBar
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />

        {/* Content View Container */}
        <main className="flex-1 px-10 pt-1 pb-12 w-full">
          {activeTab === 'home' && (
            <DashboardView
              projects={projects}
              recentFiles={recentFiles}
              transfers={transfers}
              notes={notes}
              experiments={experiments}
              onNavigate={setActiveTab}
              onSelectProject={(p) => {
                setDetailItem(p);
                setDetailType('project');
              }}
              onSelectNote={(n) => {
                setActiveTab('notes');
              }}
              onSelectExperiment={(e) => {
                setDetailItem(e);
                setDetailType('tool');
              }}
              onUploadFile={handleUploadFile}
              onOpenNewModal={(type) => setNewModalType(type)}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              onSelectProject={(p) => {
                setDetailItem(p);
                setDetailType('project');
              }}
              onNewProject={() => setNewModalType('project')}
            />
          )}

          {activeTab === 'notes' && (
            <NotesView
              notes={notes}
              onSelectNote={(n) => {
                setDetailItem(n);
                setDetailType('note');
              }}
              onNewNote={() => setNewModalType('note')}
              onUpdateNote={handleUpdateNote}
            />
          )}

          {activeTab === 'files' && (
            <FilesView
              files={recentFiles}
              transfers={transfers}
              onUploadFile={handleUploadFile}
              onDeleteTransfer={handleDeleteTransfer}
              isUploading={isUploading}
            />
          )}

          {activeTab === 'tools' && (
            <ToolsView
              tools={experiments}
              onSelectTool={(t) => {
                setDetailItem(t);
                setDetailType('tool');
              }}
              onNewTool={() => setNewModalType('experiment')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
              onResetWorkspace={handleResetWorkspace}
            />
          )}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setActiveTab}
        projects={projects}
        notes={notes}
        tools={experiments}
        transfers={transfers}
        onSelectProject={(p) => {
          setDetailItem(p);
          setDetailType('project');
        }}
        onSelectNote={(n) => {
          setDetailItem(n);
          setDetailType('note');
        }}
        onOpenNewModal={(type) => setNewModalType(type)}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      />

      {/* Create Modal */}
      <NewItemModal
        isOpen={newModalType !== null}
        type={newModalType}
        onClose={() => setNewModalType(null)}
        onCreateProject={handleCreateProject}
        onCreateNote={handleCreateNote}
        onCreateTransfer={async (name, size, expiry) => {
          const fakeBlob = new Blob(['sample content'], { type: 'text/plain' });
          const file = new (window as any).File([fakeBlob], name, { type: 'text/plain' });
          await handleUploadFile(file, expiry);
        }}
        onCreateExperiment={handleCreateExperiment}
      />

      {/* Detail Inspection Drawer */}
      <DetailDrawer
        isOpen={detailItem !== null}
        onClose={() => {
          setDetailItem(null);
          setDetailType(null);
        }}
        item={detailItem}
        itemType={detailType}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 text-white dark:bg-white dark:text-black px-4 py-2.5 rounded-xl text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
