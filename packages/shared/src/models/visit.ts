import type { SourceType, SyncStatus } from "./enums.js";
import { SyncStatus as SyncStatusEnum } from "./enums.js";

export interface Visit {
  id: string;
  trailId: string;
  url: string;
  title: string;
  timestamp: string;
  lastVisitedAt: string;
  position: number;
  sourceType: SourceType;
  sourceDetail: string | null;
  tabId: number | null;
  windowId: number | null;
  note: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  language: string;
  articleId: string;
  syncStatus: SyncStatus;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateVisitInput {
  trailId: string;
  url: string;
  title: string;
  position: number;
  sourceType: SourceType;
  language: string;
  articleId: string;
  sourceDetail?: string | null;
  tabId?: number | null;
  windowId?: number | null;
  note?: string | null;
  summary?: string | null;
  thumbnailUrl?: string | null;
}

export function createVisit(input: CreateVisitInput): Visit {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    trailId: input.trailId,
    url: input.url,
    title: input.title,
    timestamp: now,
    lastVisitedAt: now,
    position: input.position,
    sourceType: input.sourceType,
    sourceDetail: input.sourceDetail ?? null,
    tabId: input.tabId ?? null,
    windowId: input.windowId ?? null,
    note: input.note ?? null,
    summary: input.summary ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    language: input.language,
    articleId: input.articleId,
    syncStatus: SyncStatusEnum.LocalOnly,
    updatedAt: now,
    deletedAt: null,
  };
}
