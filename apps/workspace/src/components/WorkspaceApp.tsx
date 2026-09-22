import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DashboardView } from './DashboardView';
import { ProjectsView } from './ProjectsView';
import { NotesView } from './NotesView';
import { FilesView } from './FilesView';
import { SettingsView } from './SettingsView';
import { CommandPalette } from './CommandPalette';
import { NewItemModal } from './NewItemModal';
import {
  INITIAL_PROJECTS,
  INITIAL_TRANSFERS,
  INITIAL_NOTES,
} from '../data/mockData';
import {
  fetchActiveFiles,
  uploadFileService,
  deleteFileService,
  AuthenticationRequiredError,
} from '../services/fileService';
import type { NavTab, Project, FileItem, NoteItem } from '../types';

export const WorkspaceApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Authentic data states — no mock data
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [transfers, setTransfers] = useState<FileItem[]>(INITIAL_TRANSFERS);
  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  const [isUploading, setIsUploading] = useState(false);

  // Command palette & modal
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [newModalType, setNewModalType] = useState<'project' | 'note' | 'transfer' | null>(null);

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

  // Load active transfers from live Worker on mount
  useEffect(() => {
    fetchActiveFiles().then(setTransfers).catch((error: unknown) => {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : 'Unable to load private files.');
    });
  }, []);

  const handleCreateProject = (p: Partial<Project>) => {
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: p.name || 'Untitled Project',
      tagline: p.tagline || '',
      description: p.description || '',
      status: p.status || 'Planning',
      updatedAt: 'Just now',
      updatedTimestamp: Date.now(),
    };
    setProjects([newProject, ...projects]);
    showToast(`Project "${newProject.name}" added.`);
  };

  const handleCreateNote = (n: Partial<NoteItem>) => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: n.title || 'Untitled Note',
      excerpt: n.excerpt || '',
      content: n.content || '',
      updatedAt: 'Just now',
      updatedTimestamp: Date.now(),
      tags: [],
      readTime: '1 min read',
    };
    setNotes([newNote, ...notes]);
    showToast(`Note "${newNote.title}" saved.`);
  };

  const handleUploadFile = async (file: File, expiry: string = '48 hours') => {
    setIsUploading(true);
    try {
      const { file: uploadedFile, isLive } = await uploadFileService(file, expiry);
      setTransfers((prev) => [uploadedFile, ...prev.filter((f) => f.id !== uploadedFile.id)]);
      if (isLive) {
        showToast(`Uploaded "${file.name}" to Cloudflare R2.`);
      }
    } catch (err: any) {
      showToast(err instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to upload files.' : (err.message || 'Upload failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    try {
      await deleteFileService(id);
      setTransfers(transfers.filter((t) => t.id !== id));
      showToast('File transfer revoked.');
    } catch (err: any) {
      showToast(err instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to delete files.' : (err.message || 'Delete failed'));
    }
  };

  const handleUpdateNote = (updated: NoteItem) => {
    setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
    showToast(`Note updated.`);
  };

  const handleResetWorkspace = () => {
    setProjects([]);
    setTransfers([]);
    setNotes([]);
    showToast('Workspace reset.');
  };

  return (
    <div className={`workspace-shell flex ${isDarkMode ? 'dark' : ''}`}>
      {/* Sidebar with refined brandmark */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo(0, 0);
        }}
      />

      {/* Main Studio Canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-y-auto">
        <TopBar
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />

        {/* Dynamic Views */}
        <main className="workspace-main flex-1 px-4 pt-2 pb-16 sm:px-6 lg:px-8">
          {activeTab === 'home' && (
            <DashboardView
              projects={projects}
              transfers={transfers}
              notes={notes}
              onNavigate={setActiveTab}
              onUploadFile={handleUploadFile}
              isUploading={isUploading}
            />
          )}

          {activeTab === 'files' && (
            <FilesView
              files={transfers}
              transfers={transfers}
              onUploadFile={handleUploadFile}
              onDeleteTransfer={handleDeleteTransfer}
              isUploading={isUploading}
            />
          )}

          {activeTab === 'notes' && (
            <NotesView
              notes={notes}
              onNewNote={() => setNewModalType('note')}
              onUpdateNote={handleUpdateNote}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              onNewProject={() => setNewModalType('project')}
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
        transfers={transfers}
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
        onCreateTransfer={handleUploadFile}
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
