import React, { useEffect, useRef, useState } from 'react';
import type { WebdavSettings } from '@rachg/shared';
import { API_CONNECT_URL } from '../config/api';
import { fetchWebdavSettings, testWebdavConnection } from '../services/storageService';

export function WebdavSettingsPanel({ canManage, onChanged }: { canManage: boolean; onChanged?: (settings: WebdavSettings) => void }) {
  const [config, setConfig] = useState<WebdavSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const active = useRef(false), busyRef = useRef(false), sequence = useRef(0), request = useRef<AbortController | null>(null);
  const run = async (test = false) => {
    if (busyRef.current || !canManage) return;
    const version = ++sequence.current, controller = new AbortController(); request.current = controller;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const next = await (test ? testWebdavConnection(controller.signal) : fetchWebdavSettings(controller.signal));
      if (!active.current || controller.signal.aborted || version !== sequence.current) return;
      setConfig(next); onChanged?.(next);
      if (test) setNotice('Connected. Your rachg folder is accessible.');
    } catch (error) { if (active.current && !controller.signal.aborted && version === sequence.current) setError(error instanceof Error ? error.message : 'Unable to check InfiniCLOUD.'); }
    finally { if (version === sequence.current) { busyRef.current = false; if (active.current) setBusy(false); } }
  };
  useEffect(() => {
    active.current = true;
    if (canManage) void run(); else { setConfig(null); setBusy(false); }
    return () => { active.current = false; sequence.current++; request.current?.abort(); busyRef.current = false; };
  }, [canManage]);

  return <section className="workspace-card p-5 sm:p-6 space-y-4" aria-labelledby="webdav-settings-heading">
    <div><h3 id="webdav-settings-heading" className="type-section-heading">InfiniCLOUD · WebDAV</h3><p className="type-secondary mt-1">Connection managed by Cloudflare Worker Secrets.</p></div>
    {!canManage ? <p className="type-secondary">Sign in to check storage.</p> : <>
      <p className="type-caption">Worker: rachg-file-service · WEBDAV_USERNAME + WEBDAV_PASSWORD</p>
      {config && <><p className="type-caption break-all">{config.baseUrl}</p><p className="type-secondary">{config.configured ? 'Secrets are configured. Test the connection to verify folder access.' : 'Add both Secrets to the Worker and deploy, then refresh.'}</p></>}
      {!config && busy && <p className="type-secondary" role="status">Loading storage status…</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void run()} className="workspace-button workspace-button-secondary">Refresh status</button>
        <button disabled={busy || !config?.configured} onClick={() => void run(true)} className="workspace-button workspace-button-primary">{busy ? 'Checking…' : 'Test connection'}</button>
      </div>
      {error && <div role="alert" className="space-y-2"><p className="type-secondary text-red-600 dark:text-red-300">{error}</p><a href={API_CONNECT_URL} className="type-secondary underline">Reconnect workspace</a></div>}
      {notice && <p role="status" className="type-secondary text-emerald-700 dark:text-emerald-300">{notice}</p>}
    </>}
  </section>;
}
