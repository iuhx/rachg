export interface PagesBuildInfo {
  service: 'rachg-workspace';
  buildTimestamp: number;
  commit: string | null;
  branch: string | null;
}

export interface SystemHealth {
  service: 'rachg-system-health';
  checkedAt: number;
  worker: { status: 'reachable'; versionId: string | null; versionCreatedAt: number | null };
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
