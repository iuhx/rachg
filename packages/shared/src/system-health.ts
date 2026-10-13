export interface SystemHealth {
  service: 'rachg-system-health';
  checkedAt: number;
  worker: { status: 'reachable' };
  storage: {
    status: 'available' | 'unavailable';
    usedBytes: number | null;
    limitBytes: number | null;
    availableBytes: number | null;
    quotaScope: 'files';
  };
  domain: {
    name: 'rachg.com';
    expiresAt: number | null;
    checkedAt: number | null;
    status: 'current' | 'stale' | 'unavailable';
  };
}
