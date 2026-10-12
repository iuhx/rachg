import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Edit3, FolderDot, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { PROJECT_LIMITS, PROJECT_STATUSES, type Project, type ProjectInput, type ProjectStatus } from '@rachg/shared';
import { ProjectEditor } from './ProjectEditor';
import { ConfirmDialog } from './ConfirmDialog';

interface ProjectsViewProps {
  projects: Project[];
  isActive: boolean;
  canManage: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  createRequest: number;
  onRefresh: () => void;
  onSave: (id: string, input: ProjectInput, revision?: number) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
}
const statusClass: Record<ProjectStatus, string> = {
  Planning: 'text-neutral-600 dark:text-neutral-300', 'In Progress': 'text-blue-600 dark:text-blue-300',
  Completed: 'text-emerald-700 dark:text-emerald-300', Archived: 'text-neutral-400',
};
export const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, isActive, canManage, isLoading, isSaving, error, createRequest, onRefresh, onSave, onDelete }) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'All'>('All');
  const [editor, setEditor] = useState<{ id: string; project?: Project } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [actionError, setActionError] = useState('');
  const actionBusy = useRef(false);
  const handledRequest = useRef(0);
  const create = () => { if (canManage && !editor && !actionBusy.current) { setEditor({ id: crypto.randomUUID() }); setActionError(''); } };
  useEffect(() => {
    if (!createRequest || createRequest === handledRequest.current || !canManage) return;
    handledRequest.current = createRequest;
    if (!editor) setEditor({ id: crypto.randomUUID() });
  }, [createRequest, canManage, editor]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter(project => (status === 'All' || project.status === status) &&
      (!needle || `${project.name}\n${project.tagline}\n${project.description}`.toLowerCase().includes(needle)));
  }, [projects, query, status]);
  const run = async (operation: () => Promise<void>) => {
    if (actionBusy.current || isSaving || isLoading || !canManage) return;
    actionBusy.current = true; setActionError('');
    try { await operation(); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'Unable to update this project.'); }
    finally { actionBusy.current = false; }
  };
  return <div className="workspace-view space-y-6 pb-20">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="type-page-heading">Projects</h2><p className="type-secondary mt-1">Keep track of what matters, from first idea to finished work.</p></div>
      <div className="flex gap-2"><button disabled={!canManage || isLoading || isSaving} onClick={onRefresh} aria-label="Refresh projects" className="workspace-button workspace-button-secondary"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button><button disabled={!canManage || isSaving || projects.length >= PROJECT_LIMITS.count} onClick={create} className="workspace-button workspace-button-primary"><Plus className="w-4 h-4" />New Project</button></div>
    </header>
    {(error || actionError) && <p role="alert" className="workspace-panel type-secondary p-3 text-red-600 dark:text-red-300">{actionError || error}</p>}
    {!canManage && <p className="type-secondary">Sign in to load and manage your private projects.</p>}
    <div className="workspace-card p-4 space-y-4">
      <label className="flex gap-2 items-center"><Search className="w-4 h-4 text-neutral-400" /><input aria-label="Search projects" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names, summaries and details…" className="workspace-input" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="workspace-segment flex-wrap" role="group" aria-label="Filter project status">{(['All', ...PROJECT_STATUSES] as const).map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)} className={`workspace-segment-item ${status === value ? 'workspace-segment-item-active' : ''}`}>{value}<span className="type-caption">{value === 'All' ? projects.length : projects.filter(project => project.status === value).length}</span></button>)}</div><span role="status" className="type-caption">{isSaving ? 'Saving…' : isLoading ? 'Loading…' : `${projects.length} / ${PROJECT_LIMITS.count} projects`}</span></div>
    </div>
    {isLoading && projects.length === 0 ? <div className="workspace-card workspace-empty p-12 type-secondary">Loading projects…</div> : visible.length === 0 ? <div className="workspace-card workspace-empty p-10 sm:p-14"><FolderDot className="w-7 h-7 text-neutral-400 mb-3" /><h3 className="type-section-heading">{projects.length || query || status !== 'All' ? 'No matching projects' : error ? 'Projects could not be loaded' : 'Start with one project'}</h3><p className="type-secondary mt-2">{projects.length ? 'Try another search or status filter.' : 'Give it a name, choose a status, and add details as you go.'}</p>{canManage && projects.length === 0 && !error && <button onClick={create} disabled={isSaving} className="workspace-button workspace-button-secondary mt-5">Create First Project</button>}</div> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {visible.map(project => <article key={project.id} className="workspace-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="type-section-heading break-words">{project.name}</h3>{project.tagline && <p className="type-secondary mt-1 break-words">{project.tagline}</p>}</div><span className={`type-caption shrink-0 rounded-full px-2 py-1 bg-neutral-100 dark:bg-white/5 ${statusClass[project.status]}`}>{project.status}</span></div>
        <p className="type-body text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap break-words line-clamp-3">{project.description || 'No details yet. Open this project to add the next steps.'}</p>
        {project.externalUrl && /^https?:\/\//i.test(project.externalUrl) && <a href={project.externalUrl} target="_blank" rel="noopener noreferrer" className="type-secondary flex items-center gap-1 text-blue-600 dark:text-blue-300 w-fit">Open link<ArrowUpRight className="w-3.5 h-3.5" /></a>}
        <div className="border-t border-neutral-100 dark:border-white/5 pt-3 flex flex-wrap items-center justify-between gap-3">
          <div><label className="sr-only" htmlFor={`project-status-${project.id}`}>Status for {project.name}</label><select id={`project-status-${project.id}`} aria-label={`Status for ${project.name}`} value={project.status} disabled={!canManage || isLoading || isSaving} onChange={event => { const next = event.target.value as ProjectStatus; if (next !== project.status) void run(() => onSave(project.id, { name: project.name, tagline: project.tagline, description: project.description, externalUrl: project.externalUrl, status: next }, project.revision)); }} className="workspace-input project-status-select">{PROJECT_STATUSES.map(value => <option key={value}>{value}</option>)}</select><p className="type-caption mt-1">Updated {new Date(project.updatedTimestamp).toLocaleDateString()}</p></div>
          <div className="flex gap-2"><button disabled={!canManage || isSaving} onClick={() => { setEditor({ id: project.id, project }); setActionError(''); }} aria-label={`Edit ${project.name}`} className="workspace-button workspace-button-secondary"><Edit3 className="w-3.5 h-3.5" />Edit</button><button disabled={!canManage || isLoading || isSaving} onClick={() => setPendingDelete(project)} aria-label={`Delete ${project.name}`} className="workspace-button workspace-button-secondary text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></div>
        </div>
      </article>)}
    </div>}
    {editor && <ProjectEditor key={editor.id} project={editor.project} isActive={isActive} disabled={!canManage || isLoading} onSave={input => onSave(editor.id, input, editor.project?.revision)} onClose={() => setEditor(null)} />}
    <ConfirmDialog isOpen={isActive && pendingDelete !== null} title="Delete project?" description={`“${pendingDelete?.name || ''}” will be removed. Your files, notes and emails are unaffected.${actionError ? ` ${actionError}` : ''}`} confirmLabel="Delete project" isConfirming={isSaving} onCancel={() => { if (!isSaving) setPendingDelete(null); }} onConfirm={() => { if (pendingDelete) void run(async () => { await onDelete(pendingDelete); setPendingDelete(null); }); }} />
  </div>;
};
