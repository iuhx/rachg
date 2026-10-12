import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PROJECT_LIMITS, PROJECT_STATUSES, type Project, type ProjectInput } from '@rachg/shared';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  project?: Project;
  isActive: boolean;
  disabled?: boolean;
  onSave: (input: ProjectInput) => Promise<void>;
  onClose: () => void;
}
export const ProjectEditor: React.FC<Props> = ({ project, isActive, disabled = false, onSave, onClose }) => {
  const [initial] = useState<ProjectInput>(() => ({ name: project?.name || '', tagline: project?.tagline || '',
    description: project?.description || '', status: project?.status || 'Planning', externalUrl: project?.externalUrl || '' }));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const savingRef = useRef(false);
  const dirty = (Object.keys(initial) as (keyof ProjectInput)[]).some(key => initial[key] !== draft[key]);
  const close = () => { if (!savingRef.current) { if (dirty) setDiscard(true); else onClose(); } };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current || disabled) return;
    if (!draft.name.trim() || draft.name.trim().length > PROJECT_LIMITS.name) { setError(`Use a project name of 1–${PROJECT_LIMITS.name} characters.`); return; }
    if (draft.tagline.length > PROJECT_LIMITS.tagline || new TextEncoder().encode(draft.description).byteLength > PROJECT_LIMITS.descriptionBytes) { setError('Keep the summary within 200 characters and details within 10 KB.'); return; }
    if (draft.externalUrl.trim()) {
      try {
        const url = new URL(draft.externalUrl.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > PROJECT_LIMITS.externalUrl) throw new Error();
      } catch { setError('Use a complete HTTP(S) link without embedded credentials.'); return; }
    }
    savingRef.current = true; setSaving(true); setError('');
    try { await onSave({ ...draft, name: draft.name.trim(), tagline: draft.tagline.trim(), externalUrl: draft.externalUrl.trim() }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save. Your input has been kept.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const change = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <>
    {isActive && <div className="workspace-modal-overlay fixed inset-0 z-40 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="project-editor-heading" onSubmit={submit} className="workspace-modal bg-white dark:bg-[#18191d] w-full max-w-xl p-5 sm:p-6 space-y-4" onKeyDown={event => {
        if (event.key === 'Escape' && !discard) { event.preventDefault(); close(); }
        if (event.key === 'Tab' && !discard) {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <div className="flex justify-between gap-3"><div><h3 id="project-editor-heading" className="type-modal-heading">{project ? 'Edit project' : 'New project'}</h3><p className="type-secondary mt-1">A name is enough to start. Add details whenever you need them.</p></div><button type="button" aria-label="Close project editor" disabled={saving} onClick={close}><X className="w-4 h-4" /></button></div>
        {error && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{error}</p>}
        <fieldset disabled={saving || disabled} className="space-y-4">
          <label className="type-label block space-y-1">Name<input autoFocus required value={draft.name} onChange={event => change('name', event.target.value)} aria-label="Project name" placeholder="What are you working on?" className="workspace-input block" /></label>
          <label className="type-label block space-y-1">Short summary<input value={draft.tagline} onChange={event => change('tagline', event.target.value)} aria-label="Project summary" placeholder="One sentence about the goal" className="workspace-input block" /></label>
          <label className="type-label block space-y-1">Status<select value={draft.status} onChange={event => change('status', event.target.value as ProjectInput['status'])} aria-label="Project status" className="workspace-input block">{PROJECT_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="type-label block space-y-1">Details<textarea value={draft.description} onChange={event => change('description', event.target.value)} aria-label="Project details" placeholder="Scope, next steps, or useful context…" rows={5} className="workspace-input block resize-y" /></label>
          <label className="type-label block space-y-1">Project link <span className="type-caption">(optional)</span><input type="url" value={draft.externalUrl} onChange={event => change('externalUrl', event.target.value)} aria-label="Project link" placeholder="https://…" className="workspace-input block" /></label>
          <p className="type-caption">Saved privately to your workspace when you click Save.</p>
          <div className="flex justify-end gap-2"><button type="button" onClick={close} className="workspace-button workspace-button-secondary">Cancel</button><button type="submit" className="workspace-button workspace-button-primary">{saving ? 'Saving…' : 'Save project'}</button></div>
        </fieldset>
      </form>
    </div>}
    <ConfirmDialog isOpen={isActive && discard} title="Discard project changes?" description="Your unsaved changes will be discarded. The saved project will stay unchanged." confirmLabel="Discard changes" onCancel={() => setDiscard(false)} onConfirm={onClose} />
  </>;
};
