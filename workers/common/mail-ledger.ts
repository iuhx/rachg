const ready = new WeakMap<D1Database, Promise<void>>();

/** Additive accounting for mail handled by this version; legacy mail is preserved. */
export function ensureMailLedger(db: D1Database): Promise<void> {
  let pending = ready.get(db);
  if (!pending) {
    pending = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS mail_ingestions (
        id TEXT PRIMARY KEY, r2_key TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_ingestions_created ON mail_ingestions(created_at)').run();
    })().catch((error) => { ready.delete(db); throw error; });
    ready.set(db, pending);
  }
  return pending;
}

export async function mailFingerprint(raw: ArrayBuffer, recipient: string): Promise<string> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), b => b.toString(16).padStart(2, '0')).join('');
  const scoped = new TextEncoder().encode(`${recipient.toLowerCase()}:${hash}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', scoped)), b => b.toString(16).padStart(2, '0')).join('');
}
