import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DashboardView } from './DashboardView';
import { ProjectsView } from './ProjectsView';
import { NotesView } from './NotesView';
import { FilesView } from './FilesView';
import { SettingsView } from './SettingsView';
import { MailView } from './MailView';
import { CommandPalette } from './CommandPalette';
import { NewItemModal } from './NewItemModal';
import {
  INITIAL_PROJECTS,
  INITIAL_TRANSFERS,
} from '../data/mockData';
import {
  fetchActiveFiles,
  uploadFileService,
  deleteFileService,
  AuthenticationRequiredError,
} from '../services/fileService';
import { createNote, deleteNote, fetchNotes, updateNote as updateNoteService } from '../services/noteService';
import { getAccessIdentity, startAccessLogout } from '../services/accessService';
import { clearScratchpad, fetchScratchpad, saveScratchpad } from '../services/scratchpadService';
import { deleteMailMessage, fetchMail, fetchMailMessage } from '../services/mailService';
import type { NavTab, Project, FileItem, NoteItem, MailItem, MailMessage } from '../types';

export const WorkspaceApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [userEmail, setUserEmail] = useState<string>();

  // Authentic data states — no mock data
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [transfers, setTransfers] = useState<FileItem[]>(INITIAL_TRANSFERS);
  const [isFilesLoading, setIsFilesLoading] = useState(true);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [scratchpad, setScratchpad] = useState<import('../types').ScratchpadItem | null>(null);
  const [isScratchpadLoading, setIsScratchpadLoading] = useState(true);
  const [isScratchpadSaving, setIsScratchpadSaving] = useState(false);
  const [mailMessages, setMailMessages] = useState<MailItem[]>([]);
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);
  const [isMailLoading, setIsMailLoading] = useState(false);
  const [isMailMessageLoading, setIsMailMessageLoading] = useState(false);

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

  useEffect(() => {
    getAccessIdentity().then((identity) => {
      if (identity?.email) {
        setUserEmail(identity.email);
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
      }
    }).catch(() => setAuthStatus('unauthenticated'));
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    setIsScratchpadLoading(true);
    fetchScratchpad().then(setScratchpad).catch((error: unknown) => {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : 'Unable to load scratchpad.');
    }).finally(() => setIsScratchpadLoading(false));
  }, [authStatus]);

  const handleSaveScratchpad = async (content: string, image?: File | null) => {
    setIsScratchpadSaving(true);
    try { setScratchpad(await saveScratchpad(content, image)); showToast('Scratchpad saved.'); }
    catch (error: any) { showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to save scratchpad.' : (error.message || 'Unable to save scratchpad.')); }
    finally { setIsScratchpadSaving(false); }
  };

  const loadMail = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    setIsMailLoading(true);
    try {
      const messages = await fetchMail();
      setMailMessages(messages);
      setSelectedMail((current) => current && messages.some((message) => message.id === current.id) ? current : null);
    } catch (error) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : error instanceof Error ? error.message : 'Unable to load mail.');
    } finally {
      setIsMailLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') void loadMail();
  }, [authStatus, loadMail]);

  const handleSelectMail = async (item: MailItem) => {
    setSelectedMail({ ...item, text: '' });
    setIsMailMessageLoading(true);
    try { setSelectedMail(await fetchMailMessage(item.id)); }
    catch (error: any) { showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : (error.message || 'Unable to open email.')); }
    finally { setIsMailMessageLoading(false); }
  };

  const handleDeleteMail = async (id: string) => {
    try {
      await deleteMailMessage(id);
      setMailMessages((current) => current.filter((message) => message.id !== id));
      setSelectedMail((current) => current?.id === id ? null : current);
      showToast('Email deleted.');
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to delete mail.' : (error.message || 'Unable to delete email.'));
      throw error;
    }
  };

  const handleClearScratchpad = async () => {
    setIsScratchpadSaving(true);
    try { setScratchpad(await clearScratchpad()); showToast('Scratchpad cleared.'); }
    catch (error: any) { showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to clear scratchpad.' : (error.message || 'Unable to clear scratchpad.')); }
    finally { setIsScratchpadSaving(false); }
  };

  // Load active transfers from live Worker on mount
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    setIsFilesLoading(true);
    fetchActiveFiles()
      .then(setTransfers)
      .catch((error: unknown) => {
        showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : 'Unable to load private files.');
      })
      .finally(() => setIsFilesLoading(false));
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    setIsNotesLoading(true);
    fetchNotes()
      .then(setNotes)
      .catch((error: unknown) => {
        showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : 'Unable to load private notes.');
      })
      .finally(() => setIsNotesLoading(false));
  }, [authStatus]);

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

  const handleCreateNote = async (n: Partial<NoteItem>) => {
    try {
      const newNote = await createNote(n.title?.trim() || 'Untitled Note', n.content || '');
      setNotes((current) => [newNote, ...current]);
      showToast(`Note "${newNote.title}" saved.`);
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to create notes.' : (error.message || 'Unable to create note.'));
      throw error;
    }
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

  const handleUpdateNote = async (updated: NoteItem) => {
    try {
      const saved = await updateNoteService(updated);
      setNotes((current) => current.map((note) => (note.id === saved.id ? saved : note)));
      showToast('Note saved.');
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to save notes.' : (error.message || 'Unable to save note.'));
      throw error;
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes((current) => current.filter((note) => note.id !== id));
      showToast('Note deleted.');
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to delete notes.' : (error.message || 'Unable to delete note.'));
      throw error;
    }
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
          authStatus={authStatus}
          userEmail={userEmail}
          onSignOut={startAccessLogout}
        />

        {/* Dynamic Views */}
        <main className="workspace-main flex-1 px-4 pt-2 pb-16 sm:px-6 lg:px-8">
          {activeTab === 'home' && (
            <DashboardView
              projects={projects}
              transfers={transfers}
              notes={notes}
              scratchpad={scratchpad}
              isScratchpadLoading={isScratchpadLoading}
              isScratchpadSaving={isScratchpadSaving}
              onSaveScratchpad={handleSaveScratchpad}
              onClearScratchpad={handleClearScratchpad}
              onNavigate={setActiveTab}
              onUploadFile={handleUploadFile}
              isUploading={isUploading}
            />
          )}

          {activeTab === 'files' && (
            <FilesView
              transfers={transfers}
              onUploadFile={handleUploadFile}
              onDeleteTransfer={handleDeleteTransfer}
              isUploading={isUploading}
              isLoading={isFilesLoading}
            />
          )}

          {activeTab === 'notes' && (
            <NotesView
              notes={notes}
              scratchpad={scratchpad}
              isScratchpadLoading={isScratchpadLoading}
              isScratchpadSaving={isScratchpadSaving}
              onSaveScratchpad={handleSaveScratchpad}
              onClearScratchpad={handleClearScratchpad}
              isLoading={isNotesLoading}
              onNewNote={() => setNewModalType('note')}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              onNewProject={() => setNewModalType('project')}
            />
          )}

          {activeTab === 'mail' && (
            <MailView
              messages={mailMessages}
              selectedMessage={selectedMail}
              isLoading={isMailLoading}
              isMessageLoading={isMailMessageLoading}
              onSelect={handleSelectMail}
              onRefresh={loadMail}
              onDelete={handleDeleteMail}
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
        onOpen={() => setIsCommandPaletteOpen(true)}
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
        <div className="workspace-toast fixed right-4 z-50 bg-neutral-900 text-white dark:bg-white dark:text-black px-4 py-2.5 rounded-xl text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150" role="status" aria-live="polite">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
