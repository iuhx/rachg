import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { deleteMailMessage, fetchMail, fetchMailMessage, fetchSentMail, fetchSentMailMessage, sendMail } from '../services/mailService';
import type { NavTab, Project, FileItem, NoteItem, MailItem, MailMessage, SentMailItem, SentMailMessage, MailSendRequest } from '../types';

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
  const [mailMessages, setMailMessages] = useState<MailItem[]>([]);
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);
  const [isMailLoading, setIsMailLoading] = useState(false);
  const [isMailMessageLoading, setIsMailMessageLoading] = useState(false);
  const [sentMessages, setSentMessages] = useState<SentMailItem[]>([]);
  const [selectedSentMail, setSelectedSentMail] = useState<SentMailMessage | null>(null);
  const [isSentMailLoading, setIsSentMailLoading] = useState(false);
  const [isSentMailMessageLoading, setIsSentMailMessageLoading] = useState(false);
  const mailSelection = useRef(0);
  const sentSelection = useRef(0);

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

  const loadSentMail = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    setIsSentMailLoading(true);
    try {
      const messages = await fetchSentMail();
      setSentMessages(messages);
      setSelectedSentMail((current) => current && messages.some((message) => message.id === current.id) ? current : null);
    } catch (error) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : error instanceof Error ? error.message : 'Unable to load sent mail.');
    } finally {
      setIsSentMailLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void loadMail();
      void loadSentMail();
    }
  }, [authStatus, loadMail, loadSentMail]);

  const handleSelectMail = async (item: MailItem) => {
    const selection = ++mailSelection.current;
    setSelectedMail({ ...item, text: '' });
    setIsMailMessageLoading(true);
    try { const message = await fetchMailMessage(item.id); if (selection === mailSelection.current) setSelectedMail(message); }
    catch (error: any) { if (selection === mailSelection.current) showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : (error.message || 'Unable to open email.')); }
    finally { if (selection === mailSelection.current) setIsMailMessageLoading(false); }
  };

  const handleSelectSentMail = async (item: SentMailItem) => {
    const selection = ++sentSelection.current;
    setSelectedSentMail({ ...item, text: '' });
    setIsSentMailMessageLoading(true);
    try { const message = await fetchSentMailMessage(item.id); if (selection === sentSelection.current) setSelectedSentMail(message); }
    catch (error: any) { if (selection === sentSelection.current) showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : (error.message || 'Unable to open sent email.')); }
    finally { if (selection === sentSelection.current) setIsSentMailMessageLoading(false); }
  };

  const handleDeleteMail = async (id: string) => {
    try {
      await deleteMailMessage(id);
      if (selectedMail?.id === id) { mailSelection.current++; setIsMailMessageLoading(false); }
      setMailMessages((current) => current.filter((message) => message.id !== id));
      setSelectedMail((current) => current?.id === id ? null : current);
      showToast('Email deleted.');
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to delete mail.' : (error.message || 'Unable to delete email.'));
      throw error;
    }
  };

  const handleSendMail = async (payload: MailSendRequest) => {
    try {
      await sendMail(payload);
      await loadSentMail();
      showToast('Email sent.');
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to send email.' : (error.message || 'Unable to send email.'));
      throw error;
    }
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
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    try {
      await deleteFileService(id);
      setTransfers((current) => current.filter((t) => t.id !== id));
      showToast('File transfer revoked.');
    } catch (err: any) {
      showToast(err instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to delete files.' : (err.message || 'Delete failed'));
      throw err;
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
              transfers={transfers}
              notes={notes}
              messages={mailMessages}
              sentMessages={sentMessages}
              isLoading={authStatus === 'loading' || (authStatus === 'authenticated' && (isNotesLoading || isFilesLoading || isMailLoading || isSentMailLoading))}
              onNavigate={setActiveTab}
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

          <div hidden={activeTab !== 'notes'}>
            <NotesView
              notes={notes}
              isActive={activeTab === 'notes'}
              isLoading={isNotesLoading}
              onNewNote={() => setNewModalType('note')}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
            />
          </div>

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              onNewProject={() => setNewModalType('project')}
            />
          )}

          {activeTab === 'mail' && (
            <MailView
              messages={mailMessages}
              sentMessages={sentMessages}
              selectedMessage={selectedMail}
              selectedSentMessage={selectedSentMail}
              isLoading={isMailLoading}
              isMessageLoading={isMailMessageLoading}
              isSentLoading={isSentMailLoading}
              isSentMessageLoading={isSentMailMessageLoading}
              onSelect={handleSelectMail}
              onSelectSent={handleSelectSentMail}
              onRefresh={loadMail}
              onRefreshSent={loadSentMail}
              onDelete={handleDeleteMail}
              onSend={handleSendMail}
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
