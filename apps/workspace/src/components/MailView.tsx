import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, Mail as MailIcon, RefreshCw, Reply, Send, Trash2 } from 'lucide-react';
import type { MailItem, MailMessage, MailQuote, MailSendRequest, SentMailItem, SentMailMessage } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { replyHeaders as buildReplyHeaders, replySubject } from '../utils/mailReply';

type MailFolder = 'inbox' | 'sent';

interface MailViewProps {
  isActive?: boolean;
  messages: MailItem[];
  sentMessages: SentMailItem[];
  selectedMessage: MailMessage | null;
  selectedSentMessage: SentMailMessage | null;
  isLoading: boolean;
  isMessageLoading: boolean;
  isSentLoading: boolean;
  isSentMessageLoading: boolean;
  onSelect: (message: MailItem) => void;
  onSelectSent: (message: SentMailItem) => void;
  onRefresh: () => void;
  onRefreshSent: () => void;
  onDelete: (id: string) => Promise<void>;
  onSend: (payload: MailSendRequest) => Promise<void>;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

export const MailView: React.FC<MailViewProps> = ({
  messages, sentMessages, selectedMessage, selectedSentMessage,
  isLoading, isMessageLoading, isSentLoading, isSentMessageLoading,
  onSelect, onSelectSent, onRefresh, onRefreshSent, onDelete, onSend,
  isActive = true,
}) => {
  const [folder, setFolder] = useState<MailFolder>('inbox');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MailItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyHeaders, setReplyHeaders] = useState<Pick<MailSendRequest, 'inReplyTo' | 'references'>>({});
  const [isReply, setIsReply] = useState(false);
  const [replyContext, setReplyContext] = useState<MailQuote | null>(null);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const deletingRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const hasDraft = Boolean(recipient || subject || body);
  const quoteTooLarge = useMemo(() => Boolean(replyContext && (replyContext.text.length > 200_000 || new TextEncoder().encode(replyContext.text).byteLength > 200_000)), [replyContext]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasDraft || sendingRef.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasDraft]);

  const filteredInbox = useMemo(() => messages.filter((message) =>
    `${message.from} ${message.subject} ${message.preview}`.toLowerCase().includes(search.toLowerCase())), [messages, search]);
  const filteredSent = useMemo(() => sentMessages.filter((message) =>
    `${message.to} ${message.subject} ${message.preview}`.toLowerCase().includes(search.toLowerCase())), [sentMessages, search]);

  const clearDraft = () => {
    setRecipient('');
    setSubject('');
    setBody('');
    setReplyHeaders({});
    setIsReply(false);
    setReplyContext(null);
    setIncludeOriginal(false);
    setSendError(null);
  };

  const openCompose = () => {
    if (!hasDraft) clearDraft();
    setIsComposeOpen(true);
  };

  const openReply = () => {
    if (!selectedMessage) return;
    if (hasDraft || sendingRef.current) {
      setSendError(current => current || 'Finish or discard your current draft before starting a reply.');
      setIsComposeOpen(true);
      return;
    }
    setRecipient(selectedMessage.replyTo || selectedMessage.from);
    setSubject(replySubject(selectedMessage.subject));
    setBody('');
    setReplyHeaders(buildReplyHeaders(selectedMessage));
    setReplyContext({ from: selectedMessage.from, subject: selectedMessage.subject, receivedAt: selectedMessage.receivedAt, text: selectedMessage.text });
    setIncludeOriginal(false);
    setIsReply(true);
    setSendError(null);
    setIsComposeOpen(true);
  };

  const removeMessage = async () => {
    if (!pendingDelete || deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try { await onDelete(pendingDelete.id); setPendingDelete(null); }
    catch { /* WorkspaceApp reports the failure. */ }
    finally { deletingRef.current = false; setIsDeleting(false); }
  };

  const submitMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sendingRef.current) return;
    if (!recipient.trim() || !subject.trim() || !body.trim()) {
      setSendError('A recipient, subject and message are required.');
      return;
    }
    sendingRef.current = true;
    setSendError(null);
    setIsSending(true);
    try {
      await onSend({ to: recipient, subject, text: body, ...replyHeaders,
        ...(includeOriginal && replyContext ? { quote: replyContext } : {}) });
      clearDraft();
      setIsComposeOpen(false);
      setFolder('sent');
      setSearch('');
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Unable to send email.');
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const refresh = folder === 'inbox' ? onRefresh : onRefreshSent;
  const loading = folder === 'inbox' ? isLoading : isSentLoading;
  const emptyFolder = folder === 'inbox' ? messages.length === 0 : sentMessages.length === 0;

  return (
    <div className="workspace-view space-y-6 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div><h1 className="type-display text-neutral-900 dark:text-white">Mail</h1><p className="type-secondary mt-2">Messages sent to any @rachg.com address.</p></div>
        <div className="flex items-center gap-2"><button type="button" onClick={openCompose} className="workspace-button workspace-button-primary cursor-pointer"><Send className="w-3.5 h-3.5" /><span>Compose</span></button><button type="button" onClick={refresh} disabled={loading} aria-label="Refresh mail" className="workspace-button workspace-button-secondary cursor-pointer disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /><span>Refresh</span></button></div>
      </header>

      <div className="workspace-segment" role="group" aria-label="Mail folder">
        <button type="button" onClick={() => { setFolder('inbox'); setSearch(''); }} aria-pressed={folder === 'inbox'} className={`workspace-segment-item ${folder === 'inbox' ? 'workspace-segment-item-active' : ''}`}><Inbox className="w-3.5 h-3.5" /><span>Inbox</span><span className="type-caption">{messages.length}</span></button>
        <button type="button" onClick={() => { setFolder('sent'); setSearch(''); }} aria-pressed={folder === 'sent'} className={`workspace-segment-item ${folder === 'sent' ? 'workspace-segment-item-active' : ''}`}><Send className="w-3.5 h-3.5" /><span>Sent</span><span className="type-caption">{sentMessages.length}</span></button>
      </div>

      {emptyFolder && !loading ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16">
          <div className="workspace-empty-icon">{folder === 'inbox' ? <Inbox className="w-6 h-6 stroke-[1.5]" /> : <Send className="w-5 h-5" />}</div>
          <h2 className="type-section-heading text-neutral-900 dark:text-white">{folder === 'inbox' ? 'Your inbox is quiet' : 'No sent messages yet'}</h2>
          <p className="type-secondary mt-1 max-w-sm leading-relaxed">{folder === 'inbox' ? 'New messages sent to any @rachg.com address will appear here.' : 'Messages you send from rachg will be saved here.'}</p>
          {folder === 'sent' && <button type="button" onClick={openCompose} className="workspace-button workspace-button-secondary mt-5 cursor-pointer">Compose a message</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 min-h-[30rem]">
          <section className="workspace-card xl:col-span-4 p-3 flex flex-col min-h-72" aria-label={folder === 'inbox' ? 'Inbox messages' : 'Sent messages'}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={folder === 'inbox' ? 'Search inbox…' : 'Search sent…'} aria-label="Search mail" className="workspace-input mb-3" />
            <div className="overflow-y-auto space-y-1">
              {loading && (folder === 'inbox' ? messages.length : sentMessages.length) === 0 && <p className="type-secondary p-4">Loading {folder === 'inbox' ? 'inbox' : 'sent mail'}…</p>}
              {folder === 'inbox' ? filteredInbox.map((message) => (
                <button type="button" key={message.id} onClick={() => onSelect(message)} className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer ${selectedMessage?.id === message.id ? 'border-neutral-300 bg-neutral-50 dark:border-white/15 dark:bg-white/[0.04]' : 'border-transparent hover:bg-neutral-50 dark:hover:bg-white/[0.03]'}`}>
                  <span className="type-body block truncate font-medium text-neutral-900 dark:text-white">{message.from}</span>
                  <span className="type-body mt-1 block truncate text-neutral-800 dark:text-neutral-200">{message.subject || '(无标题)'}</span>
                  <span className="type-caption mt-1 block line-clamp-2">{message.preview || 'No text preview'}</span>
                  <span className="type-caption mt-2 block">{formatDate(message.receivedAt)}</span>
                </button>
              )) : filteredSent.map((message) => (
                <button type="button" key={message.id} onClick={() => onSelectSent(message)} className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer ${selectedSentMessage?.id === message.id ? 'border-neutral-300 bg-neutral-50 dark:border-white/15 dark:bg-white/[0.04]' : 'border-transparent hover:bg-neutral-50 dark:hover:bg-white/[0.03]'}`}>
                  <span className="type-caption block truncate">To: {message.to}</span>
                  <span className="type-body mt-1 block truncate font-medium text-neutral-900 dark:text-white">{message.subject || '(无标题)'}</span>
                  <span className="type-caption mt-1 block line-clamp-2">{message.preview || 'No text preview'}</span>
                  <span className="type-caption mt-2 flex items-center justify-between gap-2"><span>{formatDate(message.sentAt)}</span><span className={message.status === 'failed' ? 'text-red-500' : message.status === 'sent' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{message.status === 'sent' ? 'Sent' : message.status === 'failed' ? 'Failed' : message.status === 'unknown' ? 'Unconfirmed' : 'Sending'}</span></span>
                </button>
              ))}
              {!loading && (folder === 'inbox' ? filteredInbox.length : filteredSent.length) === 0 && <p className="type-secondary p-4">No matching messages.</p>}
            </div>
          </section>

          <section className="workspace-card xl:col-span-8 min-w-0 p-5 sm:p-7" aria-label="Selected email">
            {folder === 'inbox' ? (
              !selectedMessage ? <div className="workspace-empty min-h-72 h-full"><MailIcon className="w-5 h-5 text-neutral-300 dark:text-neutral-600 mb-3" /><p className="type-secondary">Choose a message to read.</p></div>
                : isMessageLoading ? <p className="type-secondary">Loading message…</p> : (
                  <article>
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-4 dark:border-white/[0.06]">
                      <div className="min-w-0"><h2 className="type-modal-heading break-words text-neutral-900 dark:text-white">{selectedMessage.subject || '(无标题)'}</h2><p className="type-secondary mt-3 break-all">From: {selectedMessage.from}</p><p className="type-caption mt-1 break-all">To: {selectedMessage.to} · {formatDate(selectedMessage.receivedAt)}</p></div>
                      <div className="flex items-center gap-2"><button type="button" onClick={openReply} className="workspace-button workspace-button-secondary min-h-8 px-2.5 cursor-pointer"><Reply className="w-3.5 h-3.5" /><span>Reply</span></button><button type="button" onClick={() => setPendingDelete(selectedMessage)} aria-label="Delete email" title="Delete email" className="workspace-button workspace-button-secondary min-h-8 px-2 text-red-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>
                    </div>
                    <pre className="type-body whitespace-pre-wrap break-words font-sans pt-5 text-neutral-700 dark:text-neutral-300">{selectedMessage.text || 'This email has no text content.'}</pre>
                  </article>
                )
            ) : (
              !selectedSentMessage ? <div className="workspace-empty min-h-72 h-full"><Send className="w-5 h-5 text-neutral-300 dark:text-neutral-600 mb-3" /><p className="type-secondary">Choose a sent message to read.</p></div>
                : isSentMessageLoading ? <p className="type-secondary">Loading sent message…</p> : (
                  <article>
                    <div className="border-b border-neutral-100 pb-4 dark:border-white/[0.06]"><h2 className="type-modal-heading break-words text-neutral-900 dark:text-white">{selectedSentMessage.subject || '(无标题)'}</h2><p className="type-secondary mt-3 break-all">To: {selectedSentMessage.to}</p><p className="type-caption mt-1">{formatDate(selectedSentMessage.sentAt)} · {selectedSentMessage.status === 'sent' ? 'Accepted by Resend' : selectedSentMessage.status === 'failed' ? 'Send failed' : selectedSentMessage.status === 'unknown' ? 'Delivery unconfirmed' : 'Sending'}</p></div>
                    <pre className="type-body whitespace-pre-wrap break-words font-sans pt-5 text-neutral-700 dark:text-neutral-300">{selectedSentMessage.text || 'This email has no text content.'}</pre>
                  </article>
                )
            )}
          </section>
        </div>
      )}

      <ConfirmDialog isOpen={isActive && pendingDelete !== null} title="Delete email?" description={pendingDelete ? `“${pendingDelete.subject || '(无标题)'}” and its stored message will be permanently removed.` : 'This message will be permanently removed.'} confirmLabel="Delete email" isConfirming={isDeleting} onConfirm={() => void removeMessage()} onCancel={() => !isDeleting && setPendingDelete(null)} />
      <ConfirmDialog isOpen={isActive && discardOpen} title="Discard this draft?" description="The unsent recipient, subject and message will be removed from this tab." confirmLabel="Discard draft" onCancel={() => setDiscardOpen(false)} onConfirm={() => { clearDraft(); setDiscardOpen(false); setIsComposeOpen(false); }} />

      {isComposeOpen && isActive && (
        <div className="workspace-modal-overlay fixed inset-0 z-40 flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSending) setIsComposeOpen(false); }}>
          <form role="dialog" aria-modal="true" aria-label="Email composer" onSubmit={submitMessage} className="workspace-modal w-full max-w-xl bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 p-5 sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><h2 className="type-modal-heading text-neutral-900 dark:text-white">{isReply ? 'Reply' : 'New message'}</h2><p className="type-secondary mt-1">Draft kept in this tab until sent or discarded.</p></div><button type="button" onClick={() => setIsComposeOpen(false)} disabled={isSending} className="type-secondary cursor-pointer">Close</button></div>
            <fieldset disabled={isSending} className="space-y-3 mt-5">
              <input required type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="To" aria-label="Recipient" className="workspace-input" />
              <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" aria-label="Subject" className="workspace-input" />
              <label htmlFor="mail-message-body" className="type-label block">{isReply ? 'Your reply' : 'Your message'}</label>
              <textarea id="mail-message-body" required value={body} onChange={(event) => setBody(event.target.value)} placeholder={isReply ? 'Write only your new reply here…' : 'Write a message…'} aria-label="Message" rows={10} className="workspace-input resize-y" />
              {replyContext && <div className="workspace-panel p-3 space-y-3">
                <p className="type-secondary">Your reply is sent on its own by default. The original stays here for reference.</p>
                <label className="type-secondary flex items-center gap-2"><input type="checkbox" className="workspace-checkbox" checked={includeOriginal} disabled={quoteTooLarge} onChange={event => setIncludeOriginal(event.target.checked)} />Include original message in this reply</label>
                {includeOriginal && <p className="type-caption">It will appear below your reply in a separate gray quote block.</p>}
                {quoteTooLarge && <p className="type-caption">This original is too large to attach as a quote. Your new reply can still be sent.</p>}
                <details><summary className="type-caption cursor-pointer">View original · {replyContext.from} · {formatDate(replyContext.receivedAt)}</summary>
                  <p className="type-caption mt-2 break-words">{replyContext.subject}</p>
                  <blockquote className="mt-2 border-l-2 border-neutral-300 dark:border-white/20 pl-3"><pre className="text-xs whitespace-pre-wrap break-words font-sans max-h-40 overflow-auto text-neutral-500 dark:text-neutral-400">{replyContext.text}</pre></blockquote>
                </details>
              </div>}
              <p className="type-caption">Sent with clean email formatting and a plain-text fallback.</p>
            </fieldset>
            {sendError && <p className="type-secondary mt-3 text-red-600 dark:text-red-300" role="alert">{sendError}</p>}
            <div className="flex justify-between gap-3 mt-5"><button type="button" disabled={isSending || !hasDraft} className="workspace-button workspace-button-secondary" onClick={() => setDiscardOpen(true)}>Discard draft</button><button type="submit" disabled={isSending} className="workspace-button workspace-button-primary cursor-pointer disabled:opacity-50">{isSending ? 'Sending…' : isReply ? 'Send reply' : 'Send email'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
};
