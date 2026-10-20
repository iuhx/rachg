import React, { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, LoaderCircle, Save, Video } from 'lucide-react';
import type { StorageBackend } from '@rachg/shared';
import { fetchDouyinFile, fetchDouyinInfo, douyinDownloadUrl } from '../services/douyinService';
import { AuthenticationRequiredError } from '../services/apiRead';
import { StoragePicker } from './StoragePicker';
import type { FileItem } from '../types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function field(source: UnknownRecord, names: string[]): unknown {
  for (const name of names) if (source[name] !== undefined && source[name] !== null && source[name] !== '') return source[name];
  return undefined;
}

function display(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return '';
}

function getDetails(payload: unknown) {
  const root = record(payload);
  const meta = record(root.meta);
  const authorValue = field(meta, ['author', 'nickname', 'author_name', 'username']);
  const authorRecord = record(authorValue);
  const author = display(field(authorRecord, ['name', 'nickname'])) || display(authorValue);
  const values = [
    ['Author', author],
    ['Duration', display(field(meta, ['duration_text', 'duration']))],
    ['Resolution', display(field(meta, ['resolution', 'quality']))],
    ['Likes', display(field(meta, ['likes', 'digg_count']))],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const candidates = Array.isArray(root.candidate_urls) ? root.candidate_urls.length : 0;
  return {
    title: display(field(meta, ['title', 'desc', 'description'])) || 'Douyin video',
    values,
    candidates,
  };
}

interface Props {
  canDownload: boolean;
  isActive: boolean;
  webdavAvailable: boolean;
  onUploadFile: (file: File, expiry: string, storageBackend?: StorageBackend) => Promise<FileItem>;
}

export function DouyinDownloader({ canDownload, isActive, webdavAvailable, onUploadFile }: Props) {
  const [link, setLink] = useState('');
  const [info, setInfo] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageBackend, setStorageBackend] = useState<StorageBackend>('webdav');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isActive) request.current?.abort();
    return () => request.current?.abort();
  }, [isActive]);

  const details = info ? getDetails(info) : null;

  const inspect = async (event: React.FormEvent) => {
    event.preventDefault();
    const source = link.trim();
    if (!source || !canDownload || loading || saving) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setInfo(null);
    try {
      setInfo(await fetchDouyinInfo(source, controller.signal));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof AuthenticationRequiredError
        ? 'Your Cloudflare Access session needs to reconnect.'
        : cause instanceof Error ? cause.message : 'Unable to read this Douyin link.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  };

  const saveToFiles = async () => {
    if (!details || !canDownload || saving || (storageBackend === 'webdav' && !webdavAvailable)) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setSaving(true);
    setError('');
    try {
      const file = await fetchDouyinFile(link.trim(), details.title, controller.signal);
      if (!controller.signal.aborted) await onUploadFile(file, 'permanent', storageBackend);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof AuthenticationRequiredError
        ? 'Your Cloudflare Access session needs to reconnect.'
        : cause instanceof Error ? cause.message : 'Unable to save this video to Files.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setSaving(false);
      }
    }
  };

  return <section className="workspace-card min-w-0 p-5 sm:p-6 space-y-5" aria-label="Douyin video downloader">
    <header className="flex items-start gap-3">
      <span className="workspace-panel flex h-10 w-10 shrink-0 items-center justify-center text-neutral-500 dark:text-neutral-300"><Video className="h-5 w-5" /></span>
      <div><h3 className="type-section-heading text-neutral-900 dark:text-white">Douyin video downloader</h3><p className="type-secondary mt-1">Paste a Douyin share link or copied share text.</p></div>
    </header>

    <form onSubmit={event => void inspect(event)} className="space-y-3">
      <label className="type-label block" htmlFor="douyin-link">Video link</label>
      <textarea id="douyin-link" value={link} onChange={event => { setLink(event.target.value); setError(''); setInfo(null); }}
        disabled={loading || saving} maxLength={4096} rows={3} placeholder={'https://v.douyin.com/…\nOr paste copied share text'} className="workspace-input block w-full resize-y" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-caption">{link.length.toLocaleString()} / 4,096 characters</p>
        <button type="submit" disabled={!canDownload || !link.trim() || loading || saving} className="workspace-button workspace-button-primary">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          {loading ? 'Reading video…' : 'Get video details'}
        </button>
      </div>
    </form>

    {!canDownload && <p className="type-secondary">Sign in to use the Douyin downloader.</p>}
    {error && <p className="type-secondary text-red-600 dark:text-red-300" role="alert">{error}</p>}
    {details && <div className="workspace-panel space-y-4 p-4" aria-live="polite">
      <div><p className="type-caption">Video</p><h4 className="type-body mt-1 break-words font-medium text-neutral-900 dark:text-white">{details.title}</h4></div>
      {details.values.length > 0 && <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {details.values.map(([label, value]) => <div key={label} className="min-w-0"><dt className="type-caption">{label}</dt><dd className="type-body mt-0.5 break-words">{value}</dd></div>)}
      </dl>}
      {details.candidates > 0 && <p className="type-caption">{details.candidates} available video source{details.candidates === 1 ? '' : 's'}</p>}
      <a href={douyinDownloadUrl(link.trim())} className="workspace-button workspace-button-primary inline-flex" aria-label="Download Douyin video">
        <Download className="h-4 w-4" />Download
      </a>
      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <StoragePicker value={storageBackend} onChange={setStorageBackend} webdavAvailable={webdavAvailable} disabled={saving} />
          <button type="button" onClick={() => void saveToFiles()} disabled={!canDownload || saving || (storageBackend === 'webdav' && !webdavAvailable)} className="workspace-button workspace-button-primary">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Downloading and saving…' : 'Save permanently to Files'}
          </button>
        </div>
        <p className="type-caption mt-2">Files accepts items up to 99 MB. Saved items are permanent until deleted from Files.</p>
        {storageBackend === 'webdav' && !webdavAvailable && <p className="type-caption mt-1">Set up WebDAV in Settings, or choose Cloudflare R2.</p>}
      </div>
    </div>}
    <p className="type-caption">The download is streamed through the workspace service. Your API key stays on the server.</p>
  </section>;
}
