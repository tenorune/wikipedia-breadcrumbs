import Dexie from "dexie";
import type { Table } from "dexie";
import type { Visit } from "../models/visit.js";
import type { Trail } from "../models/trail.js";
import type { ConflictLog } from "../models/conflict-log.js";

export class BreadcrumbsDB extends Dexie {
  visits!: Table<Visit, string>;
  trails!: Table<Trail, string>;
  conflictLogs!: Table<ConflictLog, string>;

  constructor(name = "breadcrumbs") {
    super(name);
    this.version(1).stores({
      visits: "id, trailId, [trailId+position], timestamp, syncStatus, articleId, deletedAt",
      trails: "id, userId, status, startedAt, syncStatus, deviceId, deletedAt",
      conflictLogs: "id, recordType, recordId, resolvedAt, createdAt",
    });
  }
}
