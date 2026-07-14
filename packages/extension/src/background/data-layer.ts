import { BreadcrumbsDB, visitStore, trailStore, SyncStatus } from "@wikipedia-breadcrumbs/shared";
import type { Visit, Trail } from "@wikipedia-breadcrumbs/shared";

export const db = new BreadcrumbsDB();

let _syncUserId: string | null = null;
export function getSyncUserId(): string | null {
  return _syncUserId;
}
export function setSyncUserId(id: string | null): void {
  _syncUserId = id;
}

export async function addVisit(visit: Visit): Promise<unknown> {
  if (getSyncUserId()) {
    visit.syncStatus = SyncStatus.PendingSync;
  }
  return visitStore(db).add(visit);
}

export async function addTrail(trail: Trail): Promise<unknown> {
  const userId = getSyncUserId();
  if (userId) {
    trail.userId = userId;
    trail.syncStatus = SyncStatus.PendingSync;
  }
  return trailStore(db).add(trail);
}

export async function finalizeTrail(trailId: string): Promise<unknown> {
  return trailStore(db).finalize(trailId);
}

export async function getActiveTrailForTab(tabId: number): Promise<{ trail: Trail; lastVisit: Visit; visitCount: number } | null> {
  const trails = trailStore(db);
  const visits = visitStore(db);
  for (const trail of await trails.getActive()) {
    const trailVisits = await visits.getByTrailId(trail.id);
    const lastVisit = trailVisits[trailVisits.length - 1];
    if (lastVisit?.tabId === tabId) {
      return { trail, lastVisit, visitCount: trailVisits.length };
    }
  }
  return null;
}

export async function getActiveTrailByUrl(url: string): Promise<{ trail: Trail; lastVisit: Visit; visitCount: number } | null> {
  const trails = trailStore(db);
  const visits = visitStore(db);
  for (const trail of await trails.getActive()) {
    const trailVisits = await visits.getByTrailId(trail.id);
    if (trailVisits.some((v) => v.url === url)) {
      const lastVisit = trailVisits[trailVisits.length - 1];
      return { trail, lastVisit, visitCount: trailVisits.length };
    }
  }
  return null;
}

export async function getActiveTrails(): Promise<Trail[]> {
  return trailStore(db).getActive();
}

export async function getTrailsAll(): Promise<Trail[]> {
  return trailStore(db).getAll();
}

export async function getTrailById(trailId: string): Promise<Trail | undefined> {
  return trailStore(db).getById(trailId);
}

export async function getVisitsByTrailId(trailId: string): Promise<Visit[]> {
  return visitStore(db).getByTrailId(trailId);
}

export async function updateTrail(trailId: string, changes: Partial<Trail>): Promise<unknown> {
  return trailStore(db).update(trailId, changes);
}

export async function updateVisit(visitId: string, changes: Partial<Visit>): Promise<unknown> {
  return visitStore(db).update(visitId, changes);
}

export async function softDeleteTrail(trailId: string): Promise<void> {
  return trailStore(db).softDelete(trailId);
}

export async function softDeleteVisit(visitId: string): Promise<void> {
  return visitStore(db).softDelete(visitId);
}

export async function findVisitByUrl(trailId: string, url: string, title?: string): Promise<Visit | null> {
  const trailVisits = await visitStore(db).getByTrailId(trailId);
  // Exact URL match first
  let match = trailVisits.find((v) => v.url === url);
  // Fallback: match by articleId (handles same redirect URL revisited)
  if (!match) {
    let articleId = url.split("/wiki/")[1];
    // Remove query parameters if present
    if (articleId) {
      articleId = articleId.split("?")[0];
      match = trailVisits.find((v) => v.articleId === articleId);
    }
  }
  // Fallback: match by title, case-insensitive
  if (!match && title) {
    const lowerTitle = title.toLowerCase();
    match = trailVisits.find((v) => v.title.toLowerCase() === lowerTitle);
  }
  return match ?? null;
}

export async function searchVisits(query: string): Promise<Visit[]> {
  const lowerQuery = query.toLowerCase();
  const results: Visit[] = [];
  for (const trail of await trailStore(db).getAll()) {
    for (const visit of await visitStore(db).getByTrailId(trail.id)) {
      if (visit.title.toLowerCase().includes(lowerQuery) || (visit.note && visit.note.toLowerCase().includes(lowerQuery))) {
        results.push(visit);
      }
    }
  }
  return results;
}
