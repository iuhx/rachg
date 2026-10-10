/** An expires_at value of 0 means the file is kept until manually deleted. */
export function getFileExpiry(expiry: string | null, now: number): number {
  const value = expiry?.trim().toLowerCase() || '48 hours';
  if (value === 'permanent') return 0;
  let hours = 48;
  if (value.includes('1 hour') || value === '1h') hours = 1;
  else if (value.includes('24 hour') || value === '24h' || value === '1 day') hours = 24;
  else if (value.includes('48 hour') || value === '48h' || value === '2 days') hours = 48;
  else if (value.includes('7 day') || value === '7d' || value === '168h') hours = 168;
  else {
    const numericHours = parseInt(value, 10);
    hours = isNaN(numericHours) ? 48 : Math.max(1, Math.min(168, numericHours));
  }
  return now + hours * 3600 * 1000;
}

export function isFileExpired(expiresAt: number, now: number = Date.now()): boolean {
  return expiresAt !== 0 && expiresAt <= now;
}
