import React, { useMemo, useState } from 'react';
import { Inbox, Mail as MailIcon, RefreshCw, Trash2 } from 'lucide-react';
import type { MailItem, MailMessage } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface MailViewProps {
  messages: MailItem[];
  selectedMessage: MailMessage | null;
  isLoading: boolean;
  isMessageLoading: boolean;
  onSelect: (message: MailItem) => void;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<void>;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

export const MailView: React.FC<MailViewProps> = ({ messages, selectedMessage, isLoading, isMessageLoading, onSelect, onRefresh, onDelete }) => {
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MailItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const filteredMessages = useMemo(() => messages.filter((message) =>
    `${message.from} ${message.subject} ${message.preview}`.toLowerCase().includes(search.toLowerCase())), [messages, search]);

  const removeMessage = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try { await onDelete(pendingDelete.id); setPendingDelete(null); }
    catch { /* WorkspaceApp already reports the failure in its toast. */ }
    finally { setIsDeleting(false); }
  };

  return (
    <div className="workspace-view space-y-6 pb-20">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div><h1 className="type-display text-neutral-900 dark:text-white">Mail</h1><p className="type-secondary mt-2">Messages received at hello@rachg.com.</p></div>
        <button type="button" onClick={onRefresh} disabled={isLoading} aria-label="Refresh mail" className="workspace-button workspace-button-secondary cursor-pointer disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /><span>Refresh</span></button>
      </header>

      {messages.length === 0 && !isLoading ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16">
          <div className="workspace-empty-icon"><Inbox className="w-6 h-6 stroke-[1.5]" /></div>
          <h2 className="type-section-heading text-neutral-900 dark:text-white">Your inbox is quiet</h2>
          <p className="type-secondary mt-1 max-w-sm leading-relaxed">New messages sent to hello@rachg.com will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 min-h-[30rem]">
          <section className="workspace-card xl:col-span-4 p-3 flex flex-col min-h-72" aria-label="Inbox messages">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mail…" aria-label="Search mail" className="workspace-input mb-3" />
            <div className="overflow-y-auto space-y-1">
              {isLoading && messages.length === 0 ? <p className="type-secondary p-4">Loading mail…</p> : filteredMessages.map((message) => (
                <button type="button" key={message.id} onClick={() => onSelect(message)} className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer ${selectedMessage?.id === message.id ? 'border-neutral-300 bg-neutral-50 dark:border-white/15 dark:bg-white/[0.04]' : 'border-transparent hover:bg-neutral-50 dark:hover:bg-white/[0.03]'}`}>
                  <span className="type-body block truncate font-medium text-neutral-900 dark:text-white">{message.from}</span>
                  <span className="type-body mt-1 block truncate text-neutral-800 dark:text-neutral-200">{message.subject || '(无标题)'}</span>
                  <span className="type-caption mt-1 block line-clamp-2">{message.preview || 'No text preview'}</span>
                  <span className="type-caption mt-2 block">{formatDate(message.receivedAt)}</span>
                </button>
              ))}
              {!isLoading && filteredMessages.length === 0 && <p className="type-secondary p-4">No matching messages.</p>}
            </div>
          </section>

          <section className="workspace-card xl:col-span-8 min-w-0 p-5 sm:p-7" aria-label="Selected email">
            {!selectedMessage ? (
              <div className="workspace-empty min-h-72 h-full"><MailIcon className="w-5 h-5 text-neutral-300 dark:text-neutral-600 mb-3" /><p className="type-secondary">Choose a message to read.</p></div>
            ) : isMessageLoading ? <p className="type-secondary">Loading message…</p> : (
              <article>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-4 dark:border-white/[0.06]">
                  <div className="min-w-0"><h2 className="type-modal-heading break-words text-neutral-900 dark:text-white">{selectedMessage.subject || '(无标题)'}</h2><p className="type-secondary mt-3 break-all">From: {selectedMessage.from}</p><p className="type-caption mt-1 break-all">To: {selectedMessage.to} · {formatDate(selectedMessage.receivedAt)}</p></div>
                  <button type="button" onClick={() => setPendingDelete(selectedMessage)} aria-label="Delete email" title="Delete email" className="workspace-button workspace-button-secondary min-h-8 px-2 text-red-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <pre className="type-body whitespace-pre-wrap break-words font-sans pt-5 text-neutral-700 dark:text-neutral-300">{selectedMessage.text || 'This email has no text content.'}</pre>
              </article>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog isOpen={pendingDelete !== null} title="Delete email?" description={pendingDelete ? `“${pendingDelete.subject || '(无标题)'}” and its stored message will be permanently removed.` : 'This message will be permanently removed.'} confirmLabel="Delete email" isConfirming={isDeleting} onConfirm={() => void removeMessage()} onCancel={() => !isDeleting && setPendingDelete(null)} />
    </div>
  );
};
