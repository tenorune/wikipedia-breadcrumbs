import type { TrailStatus, Visibility, StartReason, SyncStatus } from "./enums.js";
import { TrailStatus as TrailStatusEnum, Visibility as VisibilityEnum, SyncStatus as SyncStatusEnum } from "./enums.js";

export interface Trail {
  id: string;
  userId: string | null;
  name: string | null;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  status: TrailStatus;
  isStarred: boolean;
  tags: string[];
  note: string | null;
  visibility: Visibility;
  deviceId: string;
  forkedFromVisitId: string | null;
  startReason: StartReason;
  syncStatus: SyncStatus;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateTrailInput {
  startReason: StartReason;
  deviceId: string;
  userId?: string | null;
  name?: string | null;
  forkedFromVisitId?: string | null;
  tags?: string[];
}

export function createTrail(input: CreateTrailInput): Trail {
  const isForked = input.startReason === "forked";
  const hasForkedVisit = input.forkedFromVisitId != null;
  if (isForked && !hasForkedVisit) {
    throw new Error("forkedFromVisitId is required when startReason is forked");
  }
  if (!isForked && hasForkedVisit) {
    throw new Error("forkedFromVisitId must only be set when startReason is forked");
  }

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId: input.userId ?? null,
    name: input.name ?? null,
    createdAt: now,
    startedAt: now,
    endedAt: null,
    status: TrailStatusEnum.Active,
    isStarred: false,
    tags: input.tags ?? [],
    note: null,
    visibility: VisibilityEnum.Private,
    deviceId: input.deviceId,
    forkedFromVisitId: input.forkedFromVisitId ?? null,
    startReason: input.startReason,
    syncStatus: SyncStatusEnum.LocalOnly,
    updatedAt: now,
    deletedAt: null,
  };
}
