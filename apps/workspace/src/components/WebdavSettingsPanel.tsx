import React, { useEffect, useRef, useState } from 'react';
import type { WebdavSettings } from '@rachg/shared';
import { fetchWebdavSettings, saveWebdavSettings, testWebdavConnection } from '../services/storageService';

export function WebdavSettingsPanel({ canManage, onChanged }: { canManage: boolean; onChanged?: (settings: WebdavSettings) => void }) {
  const [config, setConfig] = useState<WebdavSettings | null>(null);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const active = useRef(false), busyRef = useRef(false);
  const apply = (next: WebdavSettings) => { setConfig(next); setUsername(next.username); onChanged?.(next); };
  const run = async (task: () => Promise<void>) => {
    if (busyRef.current || !canManage) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : 'Unable to connect to InfiniCLOUD.'); }
    finally { busyRef.current = false; if (active.current) setBusy(false); }
  };
  const load = () => run(async () => { const result = await fetchWebdavSettings(); if (active.current) apply(result); });
  useEffect(() => { active.current = true; if (canManage) void load(); return () => { active.current = false; }; }, [canManage]);

  return <section className="workspace-card p-5 sm:p-6 space-y-4" aria-labelledby="webdav-settings-heading">
    <div><h3 id="webdav-settings-heading" className="type-section-heading">InfiniCLOUD · WebDAV</h3><p className="type-secondary mt-1">Use your rachg folder as another file storage destination.</p></div>
    {!canManage ? <p className="type-secondary">Sign in to configure storage.</p> : <>
      {config && <>
        <p className="type-caption break-all">{config.baseUrl}</p>
        <p className="type-secondary">{config.configured ? 'Configured. InfiniCLOUD is available in the upload destination selector.' : config.canConfigure ? 'Enter Connection ID and Apps Password from My Page → Apps Connection.' : 'Secure server setup is pending. Please try again after deployment finishes.'}</p>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run(async () => {
          const next = await saveWebdavSettings(username, password, config.revision);
          if (active.current) { apply(next); setPassword(''); setNotice('Credentials saved. Access to your rachg folder was verified.'); }
        }); }}>
          <fieldset disabled={busy || !config.canConfigure} className="grid sm:grid-cols-2 gap-3">
            <label className="type-label space-y-1">Connection ID<input aria-label="InfiniCLOUD Connection ID" autoComplete="off" value={username} disabled={config.configured} maxLength={200} onChange={event => setUsername(event.target.value)} required className="workspace-input" /></label>
            <label className="type-label space-y-1">Apps Password<input aria-label="InfiniCLOUD Apps Password" autoComplete="new-password" type="password" value={password} maxLength={1024} onChange={event => setPassword(event.target.value)} required={!config.configured} placeholder={config.configured ? 'Leave blank to keep the saved password' : 'Application password, not website password'} className="workspace-input" /></label>
          </fieldset>
          <p className="type-caption">Encrypted on the server. The saved password is never returned to the browser. Reissuing it in InfiniCLOUD also affects your other connected apps.</p>
          <div className="flex flex-wrap gap-2"><button disabled={busy || !config.canConfigure || !username.trim()} className="workspace-button workspace-button-primary">{busy ? 'Checking…' : 'Save & check access'}</button>
            {config.configured && <button type="button" disabled={busy} onClick={() => void run(async () => { const next = await testWebdavConnection(); if (active.current) { apply(next); setNotice('The saved connection can access your rachg folder.'); } })} className="workspace-button workspace-button-secondary">Test saved connection</button>}
          </div>
        </form>
      </>}
      {!config && busy && <p className="type-secondary" role="status">Loading storage settings…</p>}
      {error && <div role="alert" className="space-y-2"><p className="type-secondary text-red-600 dark:text-red-300">{error}</p><button disabled={busy} onClick={() => void load()} className="workspace-button workspace-button-secondary">Refresh settings</button></div>}
      {notice && <p role="status" className="type-secondary text-emerald-700 dark:text-emerald-300">{notice}</p>}
    </>}
  </section>;
}
