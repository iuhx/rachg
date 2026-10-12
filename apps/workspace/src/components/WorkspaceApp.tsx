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
import type { FileQrRequest } from './ToolsView';

import {
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
import { fetchProjects, saveProject, deleteProject } from '../services/projectService';
import type { NavTab, Project, ProjectInput, FileItem, NoteItem, MailItem, MailMessage, SentMailItem, SentMailMessage, MailSendRequest } from '../types';

const ToolsView = React.lazy(() => import('./ToolsView').then(module => ({ default: module.ToolsView })));

export const WorkspaceApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [userEmail, setUserEmail] = useState<string>();

  // Authentic data states — no mock data
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isProjectSaving, setIsProjectSaving] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [projectsVisited, setProjectsVisited] = useState(false);
  const [projectCreateRequest, setProjectCreateRequest] = useState(0);
  const projectLoadVersion = useRef(0);
  const projectsMutating = useRef(false);
  const [transfers, setTransfers] = useState<FileItem[]>(INITIAL_TRANSFERS);
  const [isFilesLoading, setIsFilesLoading] = useState(true);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const deletedNotes = useRef(new Set<string>());
  const [isNotesLoading, setIsNotesLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const pendingUploads = useRef(0);
  const deletedTransfers = useRef(new Set<string>());
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
  const mailListVersion = useRef(0);
  const sentListVersion = useRef(0);
  const selectedInboxId = useRef<string | null>(null);
  const selectedSentId = useRef<string | null>(null);
  const [mailVisited, setMailVisited] = useState(false);
  useEffect(() => { if (activeTab === 'mail') setMailVisited(true); }, [activeTab]);
  const [fileQrRequest, setFileQrRequest] = useState<FileQrRequest | null>(null);
  const [toolsVisited, setToolsVisited] = useState(false);
  useEffect(() => { if (activeTab === 'tools') setToolsVisited(true); }, [activeTab]);

  // Command palette & modal
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [newModalType, setNewModalType] = useState<'note' | 'transfer' | null>(null);

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

  const loadProjects = useCallback(async () => {
    if (authStatus !== 'authenticated' || projectsMutating.current) return;
    const version = ++projectLoadVersion.current;
    setIsProjectsLoading(true); setProjectsError('');
    try { const loaded = await fetchProjects(); if (version === projectLoadVersion.current) setProjects(loaded); }
    catch (error) { if (version === projectLoadVersion.current) setProjectsError(error instanceof Error ? error.message : 'Unable to load projects.'); }
    finally { if (version === projectLoadVersion.current) setIsProjectsLoading(false); }
  }, [authStatus]);
  useEffect(() => {
    if (activeTab === 'projects') { setProjectsVisited(true); void loadProjects(); }
  }, [activeTab, loadProjects]);
  const mutateProject = async (operation: () => Promise<void>) => {
    if (authStatus !== 'authenticated') throw new Error('Sign in to manage projects.');
    if (projectsMutating.current) throw new Error('Wait for the current project change to finish.');
    projectsMutating.current = true; setIsProjectSaving(true);
    // Invalidate any list snapshot started before this change.
    projectLoadVersion.current++; setIsProjectsLoading(false);
    try { await operation(); setProjectsError(''); }
    finally { projectsMutating.current = false; setIsProjectSaving(false); }
  };
  const handleSaveProject = (id: string, input: ProjectInput, revision?: number) => mutateProject(async () => {
    const project = await saveProject(id, input, revision);
    setProjects(current => [project, ...current.filter(item => item.id !== project.id)]);
    showToast('Project saved.');
  });
  const handleDeleteProject = (project: Project) => mutateProject(async () => {
    await deleteProject(project.id, project.revision);
    setProjects(current => current.filter(item => item.id !== project.id));
    showToast('Project deleted.');
  });
  const openNewItem = (type: 'project' | 'note' | 'transfer') => {
    if (type === 'project') { setProjectCreateRequest(current => current + 1); setActiveTab('projects'); window.scrollTo(0, 0); }
    else setNewModalType(type);
  };

  const loadMail = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    const version = ++mailListVersion.current;
    setIsMailLoading(true);
    try {
      const messages = await fetchMail();
      if (version !== mailListVersion.current) return;
      setMailMessages(messages);
      if (selectedInboxId.current && !messages.some(message => message.id === selectedInboxId.current)) {
        selectedInboxId.current = null; mailSelection.current++;
        setSelectedMail(null); setIsMailMessageLoading(false);
      }
    } catch (error) {
      if (version === mailListVersion.current) showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : error instanceof Error ? error.message : 'Unable to load mail.');
    } finally {
      if (version === mailListVersion.current) setIsMailLoading(false);
    }
  }, [authStatus]);

  const loadSentMail = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    const version = ++sentListVersion.current;
    setIsSentMailLoading(true);
    try {
      const messages = await fetchSentMail();
      if (version !== sentListVersion.current) return;
      setSentMessages(messages);
      if (selectedSentId.current && !messages.some(message => message.id === selectedSentId.current)) {
        selectedSentId.current = null; sentSelection.current++;
        setSelectedSentMail(null); setIsSentMailMessageLoading(false);
      }
    } catch (error) {
      if (version === sentListVersion.current) showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : error instanceof Error ? error.message : 'Unable to load sent mail.');
    } finally {
      if (version === sentListVersion.current) setIsSentMailLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void loadMail();
      void loadSentMail();
    }
  }, [authStatus, loadMail, loadSentMail]);

  const handleSelectMail = async (item: MailItem) => {
    selectedInboxId.current = item.id;
    const selection = ++mailSelection.current;
    setSelectedMail({ ...item, text: '' });
    setIsMailMessageLoading(true);
    try { const message = await fetchMailMessage(item.id); if (selection === mailSelection.current) setSelectedMail(message); }
    catch (error: any) {
      if (selection === mailSelection.current) {
        selectedInboxId.current = null;
        setSelectedMail(null);
        showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : (error.message || 'Unable to open email.'));
      }
    }
    finally { if (selection === mailSelection.current) setIsMailMessageLoading(false); }
  };

  const handleSelectSentMail = async (item: SentMailItem) => {
    selectedSentId.current = item.id;
    const selection = ++sentSelection.current;
    setSelectedSentMail({ ...item, text: '' });
    setIsSentMailMessageLoading(true);
    try { const message = await fetchSentMailMessage(item.id); if (selection === sentSelection.current) setSelectedSentMail(message); }
    catch (error: any) {
      if (selection === sentSelection.current) {
        selectedSentId.current = null;
        setSelectedSentMail(null);
        showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : (error.message || 'Unable to open sent email.'));
      }
    }
    finally { if (selection === sentSelection.current) setIsSentMailMessageLoading(false); }
  };

  const handleDeleteMail = async (id: string) => {
    try {
      await deleteMailMessage(id);
      mailListVersion.current++; setIsMailLoading(false);
      if (selectedInboxId.current === id) { selectedInboxId.current = null; mailSelection.current++; setIsMailMessageLoading(false); }
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
      // Provider acceptance completes the send. A separate list read must not
      // hold the composer open or make an accepted message appear unsent.
      void loadSentMail();
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
      .then(loaded => setTransfers(current => {
        // A slow initial read must not hide a file just uploaded from Tools or
        // restore a file already deleted while the read was in flight.
        const localIds = new Set(current.map(file => file.id));
        return [...current, ...loaded.filter(file => !localIds.has(file.id) && !deletedTransfers.current.has(file.id))];
      }))
      .catch((error: unknown) => {
        showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : 'Unable to load private files.');
      })
      .finally(() => setIsFilesLoading(false));
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    setIsNotesLoading(true);
    fetchNotes()
      .then(loaded => setNotes(current => {
        // Preserve successful changes made while the initial read was in flight.
        const localIds = new Set(current.map(note => note.id));
        return [...current, ...loaded.filter(note => !localIds.has(note.id) && !deletedNotes.current.has(note.id))];
      }))
      .catch((error: unknown) => {
        showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to continue.' : 'Unable to load private notes.');
      })
      .finally(() => setIsNotesLoading(false));
  }, [authStatus]);

  const handleCreateNote = async (n: Partial<NoteItem>) => {
    try {
      const newNote = await createNote(n.title?.trim() || 'Untitled Note', n.content || '');
      setNotes((current) => [newNote, ...current.filter(note => note.id !== newNote.id)]);
      showToast(`Note "${newNote.title}" saved.`);
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to create notes.' : (error.message || 'Unable to create note.'));
      throw error;
    }
  };

  const handleUploadFile = async (file: File, expiry: string = '48 hours') => {
    pendingUploads.current++;
    setIsUploading(true);
    try {
      const { file: uploadedFile, isLive } = await uploadFileService(file, expiry);
      setTransfers((prev) => [uploadedFile, ...prev.filter((f) => f.id !== uploadedFile.id)]);
      if (isLive) {
        showToast(`Uploaded "${file.name}" to Cloudflare R2.`);
      }
      return uploadedFile;
    } catch (err: any) {
      showToast(err instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to upload files.' : (err.message || 'Upload failed'));
      throw err;
    } finally {
      pendingUploads.current--;
      setIsUploading(pendingUploads.current > 0);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    try {
      await deleteFileService(id);
      deletedTransfers.current.add(id);
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
      deletedNotes.current.add(id);
      setNotes((current) => current.filter((note) => note.id !== id));
      showToast('Note deleted.');
    } catch (error: any) {
      showToast(error instanceof AuthenticationRequiredError ? 'Sign in with Cloudflare Access to delete notes.' : (error.message || 'Unable to delete note.'));
      throw error;
    }
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
          {authStatus === 'unauthenticated' && <p role="status" className="workspace-panel type-secondary p-3 mb-5">Sign in using the account menu to load private files, notes, projects and mail. Local tools remain available.</p>}
          {activeTab === 'home' && (
            <DashboardView
              transfers={transfers}
              notes={notes}
              messages={mailMessages}
              sentMessages={sentMessages}
              isLoading={authStatus === 'loading' || (authStatus === 'authenticated' && (isNotesLoading || isFilesLoading || isMailLoading || isSentMailLoading))}
              onNavigate={setActiveTab}
              canCreate={authStatus === 'authenticated'}
              onNewItem={openNewItem}
            />
          )}

          {activeTab === 'files' && (
            <FilesView
              transfers={transfers}
              onUploadFile={handleUploadFile}
              onDeleteTransfer={handleDeleteTransfer}
              onGenerateQr={(file) => {
                setFileQrRequest(current => ({ fileId: file.id, sequence: (current?.sequence || 0) + 1 }));
                setActiveTab('tools');
                window.scrollTo(0, 0);
              }}
              isUploading={isUploading}
              isLoading={authStatus === 'loading' || (authStatus === 'authenticated' && isFilesLoading)}
            />
          )}

          <div hidden={activeTab !== 'notes'}>
            <NotesView
              notes={notes}
              isActive={activeTab === 'notes'}
              isLoading={authStatus === 'loading' || (authStatus === 'authenticated' && isNotesLoading)}
              onNewNote={() => setNewModalType('note')}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
            />
          </div>

          {(activeTab === 'tools' || toolsVisited) && <div hidden={activeTab !== 'tools'}>
            <React.Suspense fallback={<p className="type-secondary">Loading tools…</p>}>
              <ToolsView files={transfers} fileRequest={fileQrRequest} onUploadFile={handleUploadFile}
                canUpload={authStatus === 'authenticated'} isFilesLoading={authStatus === 'authenticated' && isFilesLoading} isActive={activeTab === 'tools'} />
            </React.Suspense>
          </div>}

          {(activeTab === 'projects' || projectsVisited) && <div hidden={activeTab !== 'projects'}>
            <ProjectsView
              projects={projects}
              isActive={activeTab === 'projects'} canManage={authStatus === 'authenticated'}
              isLoading={isProjectsLoading} isSaving={isProjectSaving} error={projectsError}
              createRequest={projectCreateRequest} onRefresh={loadProjects}
              onSave={handleSaveProject} onDelete={handleDeleteProject}
            />
          </div>}

          {(activeTab === 'mail' || mailVisited) && <div hidden={activeTab !== 'mail'}>
            <MailView
              isActive={activeTab === 'mail'}
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
          </div>}

          {activeTab === 'settings' && (
            <SettingsView
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
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
        onOpenNewModal={openNewItem}
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
