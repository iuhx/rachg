import React, { useState } from 'react';
import type { StorageBackend } from '@rachg/shared';

export function useUploadSettings(webdavAvailable: boolean) {
  const [expiry, setExpiry] = useState('48 hours');
  const [storageOverride, setStorageBackend] = useState<StorageBackend | null>(null);
  const storageBackend: StorageBackend = storageOverride ?? (expiry === 'permanent' && webdavAvailable ? 'webdav' : 'r2');
  const changeExpiry = (next: string) => {
    if (next === expiry) return;
    setExpiry(next);
    setStorageBackend(null);
  };
  return { expiry, setExpiry: changeExpiry, storageBackend, setStorageBackend };
}

export function StoragePicker({ value, onChange, webdavAvailable = false, disabled = false }: {
  value: StorageBackend; onChange: (value: StorageBackend) => void; webdavAvailable?: boolean; disabled?: boolean;
}) {
  return <label className="workspace-field-inline type-label">Save to
    <select aria-label="Storage destination" value={value} disabled={disabled} onChange={event => onChange(event.target.value as StorageBackend)} className="workspace-select">
      <option value="r2">Cloudflare R2</option>
      <option value="webdav" disabled={!webdavAvailable}>InfiniCLOUD{webdavAvailable ? '' : ' · set up in Settings'}</option>
    </select>
  </label>;
}
