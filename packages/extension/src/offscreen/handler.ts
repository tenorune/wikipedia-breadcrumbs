import { BreadcrumbsDB, visitStore, trailStore } from "@wikipedia-breadcrumbs/shared";
import type { Visit } from "@wikipedia-breadcrumbs/shared";
import type { OffscreenRequest, OffscreenResponse } from "../shared/messaging.js";

export async function handleOffscreenMessage(db: BreadcrumbsDB, message: OffscreenRequest): Promise<OffscreenResponse> {
  const visits = visitStore(db);
  const trails = trailStore(db);

  try {
    switch (message.type) {
      case "addVisit": {
        const result = await visits.add(message.visit);
        return { success: true, data: result };
      }
      case "addTrail": {
        const result = await trails.add(message.trail);
        return { success: true, data: result };
      }
      case "finalizeTrail": {
        const result = await trails.finalize(message.trailId);
        return { success: true, data: result };
      }
      case "getActiveTrailForTab": {
        const activeTrails = await trails.getActive();
        for (const trail of activeTrails) {
          const trailVisits = await visits.getByTrailId(trail.id);
          const lastVisit = trailVisits[trailVisits.length - 1];
          if (lastVisit?.tabId === message.tabId) {
            return { success: true, data: { trail, lastVisit, visitCount: trailVisits.length } };
          }
        }
        return { success: true, data: null };
      }
      case "getTrailsAll": {
        const result = await trails.getAll();
        return { success: true, data: result };
      }
      case "getTrailById": {
        const result = await trails.getById(message.trailId);
        return { success: true, data: result };
      }
      case "getVisitsByTrailId": {
        const result = await visits.getByTrailId(message.trailId);
        return { success: true, data: result };
      }
      case "updateTrail": {
        const result = await trails.update(message.trailId, message.changes);
        return { success: true, data: result };
      }
      case "updateVisit": {
        const result = await visits.update(message.visitId, message.changes);
        return { success: true, data: result };
      }
      case "softDeleteTrail": {
        await trails.softDelete(message.trailId);
        return { success: true, data: null };
      }
      case "searchVisits": {
        const query = message.query.toLowerCase();
        const allTrailsList = await trails.getAll();
        const results: Visit[] = [];
        for (const trail of allTrailsList) {
          const trailVisits = await visits.getByTrailId(trail.id);
          for (const visit of trailVisits) {
            if (visit.title.toLowerCase().includes(query) || (visit.note && visit.note.toLowerCase().includes(query))) {
              results.push(visit);
            }
          }
        }
        return { success: true, data: results };
      }
      default: {
        const _exhaustive: never = message;
        return { success: false, error: `Unknown message type: ${(message as any).type}` };
      }
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
