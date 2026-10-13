import React, { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Clock3, FileText, FolderPlus, Inbox, Paperclip, Send, Upload, Wrench } from 'lucide-react';
import type { FileItem, NoteItem, NavTab, MailItem, SentMailItem } from '../types';

interface DashboardViewProps {
  transfers: FileItem[];
  notes: NoteItem[];
  messages: MailItem[];
  sentMessages: SentMailItem[];
  isLoading?: boolean;
  canCreate: boolean;
  onNewItem: (type: 'note' | 'project' | 'transfer') => void;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transfers, notes, messages, sentMessages, isLoading = false, canCreate, onNewItem, onNavigate,
}) => {
  // No date is generated during static rendering: the greeting stays correct after
  // midnight and on cached deployments without a server/client hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const shortcuts = [
    { label: 'New note', description: 'Capture an idea.', icon: FileText, action: () => onNewItem('note'), disabled: !canCreate },
    { label: 'New project', description: 'Set a goal. Track progress.', icon: FolderPlus, action: () => onNewItem('project'), disabled: !canCreate },
    { label: 'Upload a file', description: 'Keep or share a file.', icon: Upload, action: () => onNewItem('transfer'), disabled: !canCreate },
    { label: 'Open tools', description: 'QR, text & image formats.', icon: Wrench, action: () => onNavigate('tools'), disabled: false },
  ];
  const recentNotes = [...notes].sort((a, b) => b.updatedTimestamp - a.updatedTimestamp).slice(0, 4);
  const activity = [
    ...notes.map((note) => ({ id: `note-${note.id}`, title: note.title, detail: 'Note updated', timestamp: note.updatedTimestamp, tab: 'notes' as NavTab })),
    ...messages.map((mail) => ({ id: `mail-${mail.id}`, title: mail.subject || '(No subject)', detail: `From ${mail.from}`, timestamp: mail.receivedAt, tab: 'mail' as NavTab })),
    ...sentMessages.filter((mail) => mail.status === 'sent').map((mail) => ({ id: `sent-${mail.id}`, title: mail.subject || '(No subject)', detail: `Sent to ${mail.to}`, timestamp: mail.sentAt, tab: 'mail' as NavTab })),
  ].filter((item) => Number.isFinite(item.timestamp)).sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);
  const expiring = now ? transfers.filter((file) => file.expiresTimestamp && file.expiresTimestamp > now.getTime() && file.expiresTimestamp <= now.getTime() + 86400_000).sort((a, b) => a.expiresTimestamp! - b.expiresTimestamp!).slice(0, 3) : [];
  const dateLabel = (date: Date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);

  return (
    <div className="workspace-view space-y-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="type-label uppercase tracking-[0.18em] text-neutral-400 mb-3">Your workspace, at a glance</p>
          <h1 className="type-display text-neutral-900 dark:text-white">A little perspective.</h1>
          <p className="type-secondary mt-3">Your recent work and a few useful places to start.</p>
        </div>
        <button onClick={() => onNavigate('projects')} className="workspace-button workspace-button-secondary cursor-pointer">
          <span>Open projects</span><ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="workspace-card overview-today p-5 sm:p-7 flex flex-col justify-between" aria-labelledby="today-heading">
          <div className="flex items-center justify-between text-white/60">
            <h2 id="today-heading" className="type-label uppercase tracking-[0.15em]">Today</h2>
            <CalendarDays className="w-4 h-4" />
          </div>
          <div className="py-8 sm:py-10">
            <p className="font-serif text-5xl sm:text-6xl tracking-tight leading-none break-words">
              {now ? new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now) : 'Welcome back'}
            </p>
            <p className="text-sm text-white/70 mt-4">{now ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(now) : 'A quiet place for your work.'}</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-[11px] text-white/55">Local time<br /><span className="block mt-1">{now ? Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ') : 'Your time zone'}</span></p>
            <span className="font-mono text-2xl tabular-nums">{now ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now) : '—'}</span>
          </div>
        </section>

        <section className="workspace-card p-5 sm:p-7" aria-labelledby="quick-start-heading">
          <div className="mb-5">
            <h2 id="quick-start-heading" className="type-modal-heading text-neutral-900 dark:text-white">Start something.</h2>
            <p className="type-secondary mt-1">One small next step, right from here.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {shortcuts.map(({ label, description, icon: Icon, action, disabled }) => <button key={label} type="button" onClick={action} disabled={disabled} aria-label={label} className="group workspace-panel min-w-0 p-3 sm:p-4 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-white/10 disabled:opacity-45 disabled:cursor-not-allowed">
              <span className="flex items-center justify-between gap-2 mb-3 text-neutral-500 dark:text-neutral-400"><Icon className="w-4 h-4" /><ArrowUpRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" /></span>
              <span className="type-body block font-medium text-neutral-900 dark:text-white">{label}</span>
              <span className="type-secondary block mt-1">{description}</span>
            </button>)}
          </div>
          {!canCreate && <p className="type-caption mt-4">Sign in to create and upload. Local tools are ready to use.</p>}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="workspace-card p-5 sm:p-6" aria-labelledby="recent-notes-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="recent-notes-heading" className="type-section-heading text-neutral-900 dark:text-white">Recent notes</h2>
            <button onClick={() => onNavigate('notes')} aria-label="Open all notes" className="workspace-button workspace-button-secondary min-h-8 px-2 cursor-pointer"><ArrowUpRight className="w-3.5 h-3.5" /></button>
          </div>
          {recentNotes.length === 0 ? <div className="workspace-empty py-9"><FileText className="w-5 h-5 text-neutral-300 mb-3" /><p className="type-secondary">{isLoading ? 'Loading your notes…' : 'Your next idea starts with a note.'}</p></div> :
            <div className="divide-y divide-neutral-100 dark:divide-white/5">{recentNotes.map((note) => <article key={note.id} className="py-3.5 first:pt-1">
              <h3 className="type-body font-medium text-neutral-900 dark:text-white truncate">{note.title}</h3>
            </article>)}</div>}
        </section>

        <section className="workspace-card p-5 sm:p-6" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between mb-4"><h2 id="activity-heading" className="type-section-heading text-neutral-900 dark:text-white">Recent activity</h2><Clock3 className="w-4 h-4 text-neutral-400" /></div>
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
