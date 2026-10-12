/** An expires_at value of 0 means the file is kept until manually deleted. */
export function getFileExpiry(expiry: string | null, now: number): number {
  const value = expiry?.trim().toLowerCase() || '48 hours';
  if (value === 'permanent') return 0;
  const match = /^(\d+)\s*(h|hours?|d|days?)?$/.exec(value);
  const requested = match ? Number(match[1]) * (match[2]?.startsWith('d') ? 24 : 1) : 48;
  const hours = Math.max(1, Math.min(168, requested));
  return now + hours * 3600 * 1000;
}

export function isFileExpired(expiresAt: number, now: number = Date.now()): boolean {
  return expiresAt !== 0 && expiresAt <= now;
}
