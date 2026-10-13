import React from 'react';
import type { StorageBackend } from '@rachg/shared';

export function StoragePicker({ value, onChange, webdavAvailable = false, disabled = false }: {
  value: StorageBackend; onChange: (value: StorageBackend) => void; webdavAvailable?: boolean; disabled?: boolean;
}) {
  return <label className="type-label flex flex-wrap items-center gap-2">Save to
    <select aria-label="Storage destination" value={value} disabled={disabled} onChange={event => onChange(event.target.value as StorageBackend)} className="workspace-input w-auto max-w-full">
      <option value="r2">Cloudflare R2</option>
      <option value="webdav" disabled={!webdavAvailable}>InfiniCLOUD{webdavAvailable ? '' : ' · set up in Settings'}</option>
    </select>
  </label>;
}
