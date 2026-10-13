import React, { useEffect, useRef, useState } from 'react';
import { Cloud, Globe2, HardDrive, History, Radio, RefreshCw } from 'lucide-react';
import { API_CONNECT_URL } from '../config/api';
import { fetchSystemHealth, type HealthSnapshot } from '../services/systemHealthService';

const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GiB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MiB` : value >= 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${value} B`;
const date = (value: number, time = false) => new Date(value).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });

function Status({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`type-caption inline-flex items-center gap-1.5 whitespace-nowrap ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />{label}</span>;
}

export function SystemHealthCard({ canCheck }: { canCheck: boolean }) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false), busyRef = useRef(false), controller = useRef<AbortController | null>(null), lastCheck = useRef(0);
  const refresh = async () => {
    if (!canCheck || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const requestController = new AbortController(); controller.current = requestController;
    try {
      const next = await fetchSystemHealth(requestController.signal);
      if (!active.current || requestController.signal.aborted) return;
      setSnapshot(current => ({
        pages: { ...next.pages, data: next.pages.data ?? current?.pages.data ?? null },
        api: { ...next.api, data: next.api.data ?? current?.api.data ?? null },
      }));
      lastCheck.current = Date.now();
    } catch { if (active.current && !requestController.signal.aborted) setError('Unable to refresh status. Please retry.'); }
    finally { if (controller.current === requestController) { busyRef.current = false; if (active.current) setBusy(false); } }
  };
  useEffect(() => {
    active.current = true;
    if (canCheck) void refresh();
    else { setSnapshot(null); setBusy(false); }
    const visible = () => { if (!document.hidden && Date.now() - lastCheck.current >= 5 * 60_000) void refresh(); };
    const timer = window.setInterval(visible, 5 * 60_000);
    window.addEventListener('focus', visible);
    document.addEventListener?.('visibilitychange', visible);
    return () => { active.current = false; controller.current?.abort(); busyRef.current = false; window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener?.('visibilitychange', visible); };
  }, [canCheck]);

  const api = snapshot?.api.data, pages = snapshot?.pages.data;
  const pagesOk = Boolean(pages && !snapshot?.pages.error && !error);
  const workerOk = Boolean(api && !snapshot?.api.error && !error);
  const storage = api?.storage, domain = api?.domain;
  const storageOk = workerOk && storage?.status === 'available';
  const domainDays = domain?.expiresAt ? Math.ceil((domain.expiresAt - Date.now()) / 86_400_000) : null;
  const domainFresh = workerOk && domain?.status === 'current';
  const available = storage?.availableBytes;
  const usedPercent = storage?.limitBytes && storage.usedBytes !== null ? Math.min(100, storage.usedBytes / storage.limitBytes * 100) : 0;

  return <section className="workspace-card min-w-0 p-5 sm:p-6" aria-labelledby="system-health-heading">
    <div className="flex items-center justify-between gap-3 mb-3"><h2 id="system-health-heading" className="type-section-heading text-neutral-900 dark:text-white">System Health</h2>
      <button onClick={() => void refresh()} disabled={!canCheck || busy} aria-label="Refresh system health" className="workspace-button workspace-button-secondary min-h-8 px-2"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /></button>
    </div>
    {!canCheck ? <p className="type-secondary py-8">Sign in to check your services.</p> : !snapshot ? <p className="type-secondary py-8" role="status">{error || (busy ? 'Checking your services…' : 'Status has not been checked.')}</p> : <>
      <dl className="divide-y divide-neutral-100 dark:divide-white/5">
        <div className="flex items-center justify-between gap-3 py-2.5"><dt className="type-body flex items-center gap-2.5"><Cloud className="w-4 h-4 text-neutral-400" />Pages</dt><dd><Status ok={pagesOk} label={pagesOk ? `Reachable · ${snapshot.pages.latencyMs} ms` : 'Check failed'} /></dd></div>
        <div className="flex items-center justify-between gap-3 py-2.5"><dt className="type-body flex items-center gap-2.5"><Radio className="w-4 h-4 text-neutral-400" />Worker</dt><dd><Status ok={workerOk} label={workerOk ? 'Reachable' : 'Check failed'} /></dd></div>
        <div className="py-2.5">
          <div className="flex items-center justify-between gap-3"><dt className="type-body flex items-center gap-2.5"><HardDrive className="w-4 h-4 text-neutral-400" />R2</dt><dd className="type-caption text-right">{storageOk && available != null ? `${bytes(available)} remaining` : 'Check unavailable'}</dd></div>
          <div className="mt-2 h-1 rounded-full bg-neutral-100 dark:bg-white/10 overflow-hidden" role="meter" aria-label="R2 file quota usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={storageOk ? Math.round(usedPercent) : undefined} aria-valuetext={storageOk ? `${bytes(storage!.usedBytes!)} of ${bytes(storage!.limitBytes!)} used` : 'Unavailable'}><div className={`h-full rounded-full ${usedPercent >= 90 ? 'bg-amber-500' : 'bg-neutral-400 dark:bg-neutral-500'}`} style={{ width: storageOk ? `${usedPercent}%` : '0%' }} /></div>
          <p className="type-caption mt-1.5">{storage?.limitBytes ? `${bytes(storage.limitBytes)} file quota · R2 is pay-as-you-go` : 'File quota unavailable · R2 is pay-as-you-go'}</p>
        </div>
        <div className="py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><dt className="type-body flex items-center gap-2.5"><Globe2 className="w-4 h-4 text-neutral-400" />rachg.com</dt><dd className="type-caption">{domain?.expiresAt ? date(domain.expiresAt) : 'Expiry unavailable'}</dd></div>
          <p className={`type-caption mt-1.5 ${domainDays !== null && domainDays <= 30 ? 'text-amber-700 dark:text-amber-400' : ''}`}>{domainDays === null ? 'Registry lookup unavailable' : `${domainDays <= 0 ? 'Registry expiration reached' : `${domainDays} days until registry expiration`}${domainFresh ? '' : ' · cached, refresh unavailable'}`}</p>
        </div>
        <div className="pt-2.5"><dt className="type-body flex items-center gap-2.5"><History className="w-4 h-4 text-neutral-400" />Current deployment</dt>
          <dd className="type-caption mt-1.5 space-y-1"><p>Pages build: {pages ? date(pages.buildTimestamp, true) : 'Unavailable'}{pages?.commit ? ` · ${pages.commit.slice(0, 7)}` : ''}{pages && !pagesOk ? ' · last known' : ''}</p><p>Worker version: {api?.worker.versionCreatedAt ? date(api.worker.versionCreatedAt, true) : 'Unavailable'}{api?.worker.versionId ? ` · ${api.worker.versionId.slice(0, 8)}` : ''}{api && !workerOk ? ' · last known' : ''}</p></dd>
        </div>
      </dl>
      {(snapshot.pages.error || snapshot.api.error || error) && <p className="type-caption text-amber-700 dark:text-amber-400 mt-3" role="status">{error || snapshot.api.error || snapshot.pages.error} <a href={API_CONNECT_URL} className="underline">Reconnect</a></p>}
      <p className="type-caption mt-3" role="status">{busy ? 'Refreshing…' : `Checked ${new Date(Math.max(snapshot.pages.checkedAt, snapshot.api.checkedAt)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · refreshes every 5 min`}</p>
    </>}
  </section>;
}
