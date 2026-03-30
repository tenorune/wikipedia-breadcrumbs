export interface ConflictLog {
  id: string;
  recordType: "visit" | "trail";
  recordId: string;
  losingSnapshot: Record<string, unknown>;
  winningSnapshot: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}
