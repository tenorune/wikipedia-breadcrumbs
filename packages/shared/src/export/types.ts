import type { Trail } from "../models/trail.js";

export interface ExportData {
  version: number;
  exportedAt: string;
  trails: ExportTrail[];
}

export interface ExportTrail {
  id: string;
  name: string | null;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
  status: string;
  isStarred: boolean;
  tags: string[];
  note: string | null;
  visibility: string;
  forkedFromVisitId: string | null;
  startReason: string;
  visits: ExportVisit[];
}

export interface ExportVisit {
  id: string;
  url: string;
  title: string;
  timestamp: string;
  lastVisitedAt: string;
  updatedAt: string;
  position: number;
  sourceType: string;
  sourceDetail: string | null;
  note: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  language: string;
  articleId: string;
  parentVisitId: string | null;
}

export interface ConflictItem {
  imported: ExportTrail;
  local: Trail;
}

export interface ImportPlan {
  items: Array<{
    trail: ExportTrail;
    action: "skip" | "overwrite" | "copy";
  }>;
}

export interface ImportContext {
  userId: string | null;
  deviceId: string;
}

export interface ImportResult {
  trailsImported: number;
  visitsImported: number;
  skipped: number;
  errors: string[];
}
