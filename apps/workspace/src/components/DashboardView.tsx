import React, { useEffect, useState } from 'react';
import { DailyPlanner } from './DailyPlanner';
import { ArrowUpRight, Clock3, FileText, FolderDot, Inbox, Paperclip, Send } from 'lucide-react';
import type { FileItem, NoteItem, NavTab, MailItem, SentMailItem, Project } from '../types';

interface DashboardViewProps {
  transfers: FileItem[];
  notes: NoteItem[];
  messages: MailItem[];
  sentMessages: SentMailItem[];
  isLoading?: boolean;
  notesLoadError?: string;
  projects?: Project[];
  isProjectsLoading?: boolean;
  projectsLoadError?: string;
  canCreate: boolean;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transfers, notes, messages, sentMessages, isLoading = false, notesLoadError = '', canCreate, onNavigate,
  projects = [], isProjectsLoading = false, projectsLoadError = '',
}) => {
  // No date is generated during static rendering: the greeting stays correct after
  // midnight and on cached deployments without a server/client hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const visible = () => { if (!document.hidden) refresh(); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener?.('visibilitychange', visible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener?.('visibilitychange', visible); };
  }, []);
  const projectCounts = [
    { label: 'In progress', count: projects.filter(project => project.status === 'In Progress').length },
    { label: 'Planning', count: projects.filter(project => project.status === 'Planning').length },
    { label: 'Completed', count: projects.filter(project => project.status === 'Completed').length },
  ];
  const activeProjects = projects.filter(project => project.status === 'In Progress' || project.status === 'Planning')
    .sort((a, b) => Number(b.status === 'In Progress') - Number(a.status === 'In Progress') || b.updatedTimestamp - a.updatedTimestamp)
    .slice(0, 3);
  const activity = [
    ...notes.map((note) => ({ id: `note-${note.id}`, title: note.title, detail: 'Note updated', timestamp: note.updatedTimestamp, tab: 'notes' as NavTab })),
    ...messages.map((mail) => ({ id: `mail-${mail.id}`, title: mail.subject || '(No subject)', detail: `From ${mail.from}`, timestamp: mail.receivedAt, tab: 'mail' as NavTab })),
    ...sentMessages.filter((mail) => mail.status === 'sent').map((mail) => ({ id: `sent-${mail.id}`, title: mail.subject || '(No subject)', detail: `Sent to ${mail.to}`, timestamp: mail.sentAt, tab: 'mail' as NavTab })),
  ].filter((item) => Number.isFinite(item.timestamp)).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const expiring = now ? transfers.filter((file) => file.expiresTimestamp && file.expiresTimestamp > now.getTime() && file.expiresTimestamp <= now.getTime() + 86400_000).sort((a, b) => a.expiresTimestamp! - b.expiresTimestamp!).slice(0, 3) : [];
  const dateLabel = (date: Date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);

  return (
    <div className="workspace-view space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="type-label uppercase tracking-[0.18em] text-neutral-400 mb-3">Your workspace, at a glance</p>
          <h1 className="type-display text-neutral-900 dark:text-white">A little perspective.</h1>
          <p className="type-secondary mt-3">A calendar, a daily list, and your recent work.</p>
        </div>
        <button onClick={() => onNavigate('projects')} className="workspace-button workspace-button-secondary cursor-pointer">
          <span>Open projects</span><ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </header>

      <DailyPlanner now={now} canManage={canCreate} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="workspace-card min-w-0 p-5 sm:p-6" aria-labelledby="project-overview-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="project-overview-heading" className="type-section-heading text-neutral-900 dark:text-white">Project overview</h2>
            <button onClick={() => onNavigate('projects')} aria-label="Open all projects" className="workspace-button workspace-button-secondary min-h-8 px-2 cursor-pointer"><ArrowUpRight className="w-3.5 h-3.5" /></button>
          </div>
          {isProjectsLoading ? <div className="workspace-empty py-9 type-secondary">Loading projects…</div>
            : projectsLoadError ? <div className="workspace-empty py-9"><FolderDot className="w-5 h-5 text-neutral-300 mb-3" /><p className="type-secondary" role="status">Projects could not be loaded. Open Projects to reconnect or retry.</p></div>
            : !canCreate ? <div className="workspace-empty py-9"><FolderDot className="w-5 h-5 text-neutral-300 mb-3" /><p className="type-secondary">Sign in to see your projects.</p></div>
            : <>
              <dl className="grid grid-cols-3 gap-2 mb-4">
                {projectCounts.map(item => <div key={item.label} className="rounded-lg bg-neutral-50 dark:bg-white/5 px-3 py-2.5">
                  <dt className="type-caption">{item.label}</dt><dd className="text-xl font-medium tabular-nums text-neutral-900 dark:text-white mt-1">{item.count}</dd>
                </div>)}
              </dl>
              {activeProjects.length ? <ul className="divide-y divide-neutral-100 dark:divide-white/5">{activeProjects.map(project => <li key={project.id}>
                <button onClick={() => onNavigate('projects')} className="w-full flex items-center justify-between gap-3 py-3 text-left rounded-lg hover:bg-neutral-50 dark:hover:bg-white/5">
                  <span className="type-body min-w-0 truncate font-medium text-neutral-900 dark:text-white">{project.name}</span>
                  <span className={`type-caption shrink-0 rounded-full px-2 py-1 ${project.status === 'In Progress' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-neutral-100 text-neutral-500 dark:bg-white/5 dark:text-neutral-400'}`}>{project.status}</span>
                </button>
              </li>)}</ul> : <p className="type-secondary py-4">{projects.length ? 'No active projects. Completed and archived projects are kept in Projects.' : 'A place for your next idea. Create a project to start tracking its progress.'}</p>}
            </>}
        </section>

        <section className="workspace-card min-w-0 p-5 sm:p-6" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between mb-4"><h2 id="activity-heading" className="type-section-heading text-neutral-900 dark:text-white">Recent activity</h2><Clock3 className="w-4 h-4 text-neutral-400" /></div>
          {notesLoadError && <p className="type-caption mb-3" role="status">Note activity is unavailable. Open Notes to reconnect or retry.</p>}
          {activity.length === 0 ? <div className="workspace-empty py-9"><Inbox className="w-5 h-5 text-neutral-300 mb-3" /><p className="type-secondary">{isLoading ? 'Loading recent activity…' : 'New notes and messages will appear here.'}</p></div> :
            <ol className="space-y-3">{activity.map((item) => <li key={item.id} className="flex items-start gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-50 dark:bg-white/5 text-neutral-400">{item.tab === 'notes' ? <FileText className="w-3.5 h-3.5" /> : item.id.startsWith('sent-') ? <Send className="w-3.5 h-3.5" /> : <Inbox className="w-3.5 h-3.5" />}</span>
              <div className="min-w-0 flex-1"><p className="type-body truncate text-neutral-800 dark:text-neutral-200">{item.title}</p><p className="type-caption truncate mt-0.5">{item.detail}</p></div>
              <time dateTime={new Date(item.timestamp).toISOString()} className="type-caption whitespace-nowrap pt-0.5">{dateLabel(new Date(item.timestamp))}</time>
            </li>)}</ol>}
        </section>
      </div>

      <section className="workspace-panel flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5" aria-labelledby="file-reminders-heading">
        <span className="hidden sm:flex w-9 h-9 rounded-xl bg-neutral-100 dark:bg-white/5 items-center justify-center text-neutral-400"><Paperclip className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="file-reminders-heading" className="type-body font-medium text-neutral-900 dark:text-white">{expiring.length ? 'Coming up in recent files' : 'Keep useful files close'}</h2>
          <p className="type-secondary mt-1">{expiring.length ? `${expiring.map((file) => file.name).join(', ')} — expires within the next 24 hours.` : 'Open your file collection to review downloads and retention times.'}</p>
        </div>
        <button onClick={() => onNavigate('files')} className="workspace-button workspace-button-secondary self-start sm:self-auto cursor-pointer">Open files<ArrowUpRight className="w-3.5 h-3.5" /></button>
      </section>
    </div>
  );
};
