export interface SyncResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface SyncReport {
  pushed: { trails: number; visits: number; conflictLogs: number };
  pulled: { trails: number; visits: number };
  conflicts: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
}

export interface SyncStateStore {
  getLastSyncTime(): Promise<string | null>;
  setLastSyncTime(time: string): Promise<void>;
}
