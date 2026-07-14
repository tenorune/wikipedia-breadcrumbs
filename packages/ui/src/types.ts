import type { Trail } from "@wikipedia-breadcrumbs/shared";

export interface TrailSummary {
  trail: Trail;
  displayName: string;
  visitCount: number;
  lastDiscovered: string; // timestamp of last visit, or trail.startedAt
  searchText: string;
}

/** Which field the shared TrailDetail just wrote, so platform containers can react. */
export type TrailChangeKind = "name" | "note" | "star" | "visitNote" | "visitDelete";
