import React, { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { TODO_LIMITS, type TodoItem } from '@rachg/shared';
import { fetchTodos, createTodo, completeTodo, deleteTodo } from '../services/todoService';
import { API_CONNECT_URL } from '../config/api';
import { calendarDate } from '../utils/calendar';
import { ConfirmDialog } from './ConfirmDialog';

export interface TodoDraft { id: string; text: string }
interface Props {
  date: string;
  today: string;
  canManage: boolean;
  draft?: TodoDraft;
  onDraftChange: (text: string) => void;
  onCreated: (draftId: string) => void;
  onChanged: () => void;
}
const sorted = (items: TodoItem[]) => [...items].sort((a,b) => Number(a.completed)-Number(b.completed) || a.createdTimestamp-b.createdTimestamp || a.id.localeCompare(b.id));

export function DailyTodos({ date, today, canManage, draft, onDraftChange, onCreated, onChanged }: Props) {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [toDelete, setToDelete] = useState<TodoItem | null>(null);
  const active = useRef(true), busyRef = useRef(false), currentDate = useRef(date);
  currentDate.current = date;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setItems([]); setError('');
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    fetchTodos(date).then(result => { if (!cancelled) setItems(result); })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load tasks.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, canManage, refresh]);

  const mutate = async (operation: () => Promise<void>) => {
    if (busyRef.current || loading || !canManage) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await operation(); onChanged(); }
    catch (error) { if (active.current && currentDate.current === date) setError(error instanceof Error ? error.message : 'Unable to save this change. Refresh and retry.'); }
    finally { busyRef.current = false; if (active.current && currentDate.current === date) { setBusy(false); setToDelete(null); } }
  };
  const add = () => {
    if (!draft?.text.trim()) return;
    const snapshot = draft;
    void mutate(async () => {
      const todo = await createTodo(snapshot.id, date, snapshot.text.trim());
      if (active.current && currentDate.current === date) setItems(current => sorted([todo, ...current.filter(item => item.id !== todo.id)]));
      onCreated(snapshot.id);
    });
  };
  const toggle = (todo: TodoItem, completed: boolean) => void mutate(async () => {
    const saved = await completeTodo(todo, completed);
    if (active.current && currentDate.current === date) setItems(current => sorted(current.map(item => item.id === saved.id ? saved : item)));
  });
  const remove = () => {
    if (!toDelete) return;
    const target = toDelete;
    void mutate(async () => {
      await deleteTodo(target);
      if (active.current && currentDate.current === date) setItems(current => current.filter(item => item.id !== target.id));
    });
  };

  return <section className="workspace-card p-5 sm:p-6 flex flex-col min-w-0" aria-labelledby="daily-todos-heading">
    <div className="flex items-start justify-between gap-3 mb-5">
      <div><h2 id="daily-todos-heading" className="type-modal-heading text-neutral-900 dark:text-white">{date === today ? 'Today’s to-do' : 'Daily to-do'}</h2><p className="type-secondary mt-1"><time dateTime={date}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(calendarDate(date))}</time></p></div>
      <button type="button" disabled={loading || busy || !canManage} onClick={() => { setRefresh(value => value + 1); onChanged(); }} aria-label="Refresh daily tasks" className="workspace-button workspace-button-secondary min-h-8 px-2"><RefreshCw className="w-3.5 h-3.5" /></button>
    </div>
    {!canManage ? <div className="workspace-empty flex-1 py-12"><p className="type-secondary">Sign in to view and save your daily tasks.</p><a href={API_CONNECT_URL} className="workspace-button workspace-button-secondary mt-4">Connect workspace</a></div> : <>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); add(); }}>
        <input value={draft?.text || ''} onChange={event => onDraftChange(event.target.value)} maxLength={TODO_LIMITS.text} disabled={busy} aria-label="New daily task" placeholder="One thing to do…" className="workspace-input min-w-0 flex-1" />
        <button type="submit" disabled={busy || loading || !draft?.text.trim() || items.length >= TODO_LIMITS.perDay} aria-label="Add daily task" className="workspace-button workspace-button-primary px-3"><Plus className="w-4 h-4" /></button>
      </form>
      {error && <div role="alert" className="mt-4 space-y-2"><p className="type-secondary text-red-600 dark:text-red-300">{error}</p><a href={API_CONNECT_URL} className="type-secondary underline">Reconnect workspace</a></div>}
      {loading ? <p className="type-secondary flex-1 py-12 text-center" role="status">Loading tasks…</p> : items.length === 0 ? <div className="workspace-empty flex-1 min-h-40 py-8"><p className="type-secondary">{error ? 'Tasks could not be loaded. Refresh or reconnect to try again.' : 'Nothing planned for this day yet.'}</p></div> : <ul className="mt-4 space-y-1 flex-1 max-h-64 overflow-y-auto" aria-label="Tasks for selected date">{items.map(todo => <li key={todo.id} className="group flex items-start gap-3 rounded-lg px-1 py-2.5">
        <input type="checkbox" checked={todo.completed} disabled={busy} onChange={event => toggle(todo, event.target.checked)} aria-label={`${todo.completed ? 'Mark incomplete' : 'Complete'}: ${todo.text}`} className="mt-1 h-4 w-4 shrink-0 accent-neutral-800 dark:accent-neutral-200" />
        <span className={`type-body min-w-0 flex-1 break-words ${todo.completed ? 'line-through text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}`}>{todo.text}</span>
        <button type="button" disabled={busy} onClick={() => setToDelete(todo)} aria-label={`Delete task: ${todo.text}`} className="shrink-0 rounded p-1 text-neutral-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
      </li>)}</ul>}
      <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-white/10 flex flex-wrap justify-between gap-2">
        <span className="type-caption">{items.length ? `${items.filter(item => item.completed).length} / ${items.length} completed` : 'A fresh list for each day.'}</span><span className="type-caption">Choose a calendar date to view history.</span>
      </div>
    </>}
    <ConfirmDialog isOpen={Boolean(toDelete)} title="Delete this task?" description={toDelete ? `“${toDelete.text}” will be removed from ${toDelete.date}.` : ''} confirmLabel="Delete task" isConfirming={busy} onConfirm={remove} onCancel={() => { if (!busyRef.current) setToDelete(null); }} />
  </section>;
}
