export interface ConflictLog {
  id: string;
  userId: string;
  recordType: "visit" | "trail";
  recordId: string;
  losingSnapshot: Record<string, unknown>;
  winningSnapshot: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}
