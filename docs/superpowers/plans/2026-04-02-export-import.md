# Export/Import Trails Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add export (JSON + CSV) and import (JSON) for trails, with conflict resolution UI, in both the extension and PWA.

**Architecture:** All data logic (serialization, parsing, validation, conflict detection, import execution) lives in `packages/shared/src/export/`. Extension and PWA add thin UI: buttons, file pickers, conflict dialogs, and result messages.

**Tech Stack:** TypeScript, Dexie (IndexedDB), Vitest + fake-indexeddb, Svelte 5 runes

**Spec:** `docs/superpowers/specs/2026-04-02-export-import-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/export/types.ts` | Import/export type definitions |
| `packages/shared/src/export/export-json.ts` | JSON export logic |
| `packages/shared/src/export/export-csv.ts` | CSV export logic |
| `packages/shared/src/export/import-json.ts` | JSON parse, validate, conflict detect, execute |
| `packages/shared/src/export/index.ts` | Re-exports |
| `packages/shared/tests/export/export-json.test.ts` | JSON export tests |
| `packages/shared/tests/export/export-csv.test.ts` | CSV export tests |
| `packages/shared/tests/export/import-json.test.ts` | Import parse, validate, conflict, execute tests |
| `packages/extension/src/history/ExportMenu.svelte` | Export dropdown (JSON/CSV) for extension |
| `packages/extension/src/history/ImportDialog.svelte` | Import file picker + conflict dialog for extension |
| `packages/pwa/src/lib/components/ExportMenu.svelte` | Export dropdown (JSON/CSV) for PWA |
| `packages/pwa/src/lib/components/ImportDialog.svelte` | Import file picker + conflict dialog for PWA |

### Modified files

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Add `export * from "./export/index.js"` |
| `packages/extension/src/history/TrailDetail.svelte` | Add Export button |
| `packages/extension/src/history/TrailList.svelte` | Add Export all + Import buttons |
| `packages/pwa/src/lib/components/TrailDetail.svelte` | Add Export button |
| `packages/pwa/src/lib/components/TrailList.svelte` | Add Export all + Import buttons |

---

## Chunk 1: Shared Export/Import Library

### Task 1: Types

**Files:**
- Create: `packages/shared/src/export/types.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// packages/shared/src/export/types.ts
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
```

- [ ] **Step 2: Create barrel export**

```typescript
// packages/shared/src/export/index.ts
export * from "./types.js";
export { exportTrailsJson } from "./export-json.js";
export { exportTrailsCsv } from "./export-csv.js";
export { parseImportJson, detectConflicts, executeImport } from "./import-json.js";
```

- [ ] **Step 3: Add to shared package index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from "./export/index.js";
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/export/
git commit -m "feat(export): add type definitions and barrel exports"
```

---

### Task 2: JSON Export

**Files:**
- Create: `packages/shared/src/export/export-json.ts`
- Test: `packages/shared/tests/export/export-json.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/shared/tests/export/export-json.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType } from "../../src/models/enums.js";
import { exportTrailsJson } from "../../src/export/export-json.js";

describe("exportTrailsJson", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-export-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("exports all trails with nested visits", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const json = await exportTrailsJson(db);
    const data = JSON.parse(json);

    expect(data.version).toBe(1);
    expect(data.exportedAt).toBeDefined();
    expect(data.trails).toHaveLength(1);
    expect(data.trails[0].id).toBe(trail.id);
    expect(data.trails[0].visits).toHaveLength(1);
    expect(data.trails[0].visits[0].title).toBe("Test");
  });

  it("excludes soft-deleted trails and visits", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const deletedTrail = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add({ ...deletedTrail, deletedAt: new Date().toISOString() });

    const json = await exportTrailsJson(db);
    const data = JSON.parse(json);
    expect(data.trails).toHaveLength(1);
    expect(data.trails[0].id).toBe(trail.id);
  });

  it("excludes internal fields (userId, syncStatus, deviceId, tabId, windowId, deletedAt)", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add(trail);
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test", tabId: 42, windowId: 1,
    });
    await db.visits.add(visit);

    const json = await exportTrailsJson(db);
    const data = JSON.parse(json);
    const t = data.trails[0];
    const v = t.visits[0];

    expect(t.userId).toBeUndefined();
    expect(t.syncStatus).toBeUndefined();
    expect(t.deviceId).toBeUndefined();
    expect(t.deletedAt).toBeUndefined();
    expect(v.syncStatus).toBeUndefined();
    expect(v.tabId).toBeUndefined();
    expect(v.windowId).toBeUndefined();
    expect(v.deletedAt).toBeUndefined();
    // updatedAt SHOULD be included
    expect(t.updatedAt).toBeDefined();
    expect(v.updatedAt).toBeDefined();
  });

  it("exports specific trails by ID", async () => {
    const t1 = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    const t2 = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.bulkAdd([t1, t2]);

    const json = await exportTrailsJson(db, [t1.id]);
    const data = JSON.parse(json);
    expect(data.trails).toHaveLength(1);
    expect(data.trails[0].id).toBe(t1.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run tests/export/export-json.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement export-json.ts**

```typescript
// packages/shared/src/export/export-json.ts
import type { BreadcrumbsDB } from "../db/schema.js";
import type { ExportData, ExportTrail, ExportVisit } from "./types.js";

export async function exportTrailsJson(db: BreadcrumbsDB, trailIds?: string[]): Promise<string> {
  let trails;
  if (trailIds) {
    const all = await Promise.all(trailIds.map((id) => db.trails.get(id)));
    trails = all.filter((t) => t && !t.deletedAt);
  } else {
    trails = await db.trails.filter((t) => !t.deletedAt).toArray();
  }

  const exportTrails: ExportTrail[] = [];
  for (const trail of trails) {
    if (!trail) continue;
    const visits = await db.visits
      .where("trailId").equals(trail.id)
      .filter((v) => !v.deletedAt)
      .sortBy("position");

    exportTrails.push({
      id: trail.id,
      name: trail.name,
      createdAt: trail.createdAt,
      startedAt: trail.startedAt,
      endedAt: trail.endedAt,
      updatedAt: trail.updatedAt,
      status: trail.status,
      isStarred: trail.isStarred,
      tags: trail.tags,
      note: trail.note,
      visibility: trail.visibility,
      forkedFromVisitId: trail.forkedFromVisitId,
      startReason: trail.startReason,
      visits: visits.map((v): ExportVisit => ({
        id: v.id,
        url: v.url,
        title: v.title,
        timestamp: v.timestamp,
        lastVisitedAt: v.lastVisitedAt,
        updatedAt: v.updatedAt,
        position: v.position,
        sourceType: v.sourceType,
        sourceDetail: v.sourceDetail,
        note: v.note,
        summary: v.summary,
        thumbnailUrl: v.thumbnailUrl,
        language: v.language,
        articleId: v.articleId,
        parentVisitId: v.parentVisitId,
      })),
    });
  }

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    trails: exportTrails,
  };

  return JSON.stringify(data, null, 2);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run tests/export/export-json.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/export/export-json.ts packages/shared/tests/export/export-json.test.ts
git commit -m "feat(export): JSON export with tests"
```

---

### Task 3: CSV Export

**Files:**
- Create: `packages/shared/src/export/export-csv.ts`
- Test: `packages/shared/tests/export/export-csv.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/shared/tests/export/export-csv.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType } from "../../src/models/enums.js";
import { exportTrailsCsv } from "../../src/export/export-csv.js";

describe("exportTrailsCsv", () => {
  let db: BreadcrumbsDB;

  beforeEach(async () => {
    db = new BreadcrumbsDB("test-csv-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("exports header row and one data row per visit", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add({ ...trail, name: "My Trail" });
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test Page", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const csv = await exportTrailsCsv(db);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[0]).toContain("trail_id");
    expect(lines[1]).toContain("My Trail");
    expect(lines[1]).toContain("Test Page");
  });

  it("escapes commas and quotes in fields", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add({ ...trail, name: 'Trail "with" commas, and quotes' });
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const csv = await exportTrailsCsv(db);
    const lines = csv.trim().split("\n");
    // Escaped field should be wrapped in quotes with internal quotes doubled
    expect(lines[1]).toContain('"Trail ""with"" commas, and quotes"');
  });

  it("serializes tags as semicolon-delimited", async () => {
    const trail = createTrail({ startReason: StartReason.AutoNewTab, deviceId: "d1" });
    await db.trails.add({ ...trail, tags: ["history", "science"] });
    const visit = createVisit({
      trailId: trail.id, url: "https://en.wikipedia.org/wiki/Test",
      title: "Test", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Test",
    });
    await db.visits.add(visit);

    const csv = await exportTrailsCsv(db);
    expect(csv).toContain("history;science");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run tests/export/export-csv.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement export-csv.ts**

```typescript
// packages/shared/src/export/export-csv.ts
import type { BreadcrumbsDB } from "../db/schema.js";

const HEADER = [
  "trail_id", "trail_name", "trail_status", "trail_created_at", "trail_started_at",
  "trail_start_reason", "trail_note", "trail_is_starred", "trail_tags", "trail_visibility",
  "visit_id", "visit_title", "visit_url", "visit_timestamp", "visit_last_visited_at",
  "visit_position", "visit_note", "visit_source_type", "visit_source_detail",
  "visit_language", "visit_article_id", "visit_parent_visit_id",
].join(",");

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportTrailsCsv(db: BreadcrumbsDB, trailIds?: string[]): Promise<string> {
  let trails;
  if (trailIds) {
    const all = await Promise.all(trailIds.map((id) => db.trails.get(id)));
    trails = all.filter((t) => t && !t.deletedAt);
  } else {
    trails = await db.trails.filter((t) => !t.deletedAt).toArray();
  }

  const rows: string[] = [HEADER];

  for (const trail of trails) {
    if (!trail) continue;
    const visits = await db.visits
      .where("trailId").equals(trail.id)
      .filter((v) => !v.deletedAt)
      .sortBy("position");

    for (const v of visits) {
      rows.push([
        csvEscape(trail.id), csvEscape(trail.name), csvEscape(trail.status),
        csvEscape(trail.createdAt), csvEscape(trail.startedAt),
        csvEscape(trail.startReason), csvEscape(trail.note),
        csvEscape(trail.isStarred), csvEscape(trail.tags.join(";")),
        csvEscape(trail.visibility),
        csvEscape(v.id), csvEscape(v.title), csvEscape(v.url),
        csvEscape(v.timestamp), csvEscape(v.lastVisitedAt),
        csvEscape(v.position), csvEscape(v.note), csvEscape(v.sourceType),
        csvEscape(v.sourceDetail), csvEscape(v.language), csvEscape(v.articleId),
        csvEscape(v.parentVisitId),
      ].join(","));
    }
  }

  return rows.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run tests/export/export-csv.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/export/export-csv.ts packages/shared/tests/export/export-csv.test.ts
git commit -m "feat(export): CSV export with tests"
```

---

### Task 4: JSON Import — Parse & Validate

**Files:**
- Create: `packages/shared/src/export/import-json.ts`
- Test: `packages/shared/tests/export/import-json.test.ts`

- [ ] **Step 1: Write failing tests for parseImportJson**

```typescript
// packages/shared/tests/export/import-json.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BreadcrumbsDB } from "../../src/db/schema.js";
import { createTrail } from "../../src/models/trail.js";
import { createVisit } from "../../src/models/visit.js";
import { StartReason, SourceType, SyncStatus } from "../../src/models/enums.js";
import { exportTrailsJson } from "../../src/export/export-json.js";
import { parseImportJson, detectConflicts, executeImport } from "../../src/export/import-json.js";

describe("parseImportJson", () => {
  it("parses valid export JSON", () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: "2026-04-02T00:00:00Z",
      trails: [{
        id: "abc", name: "Test", createdAt: "2026-04-02T00:00:00Z",
        startedAt: "2026-04-02T00:00:00Z", endedAt: null, updatedAt: "2026-04-02T00:00:00Z",
        status: "finalized", isStarred: false, tags: [], note: null,
        visibility: "private", forkedFromVisitId: null, startReason: "manual",
        visits: [{
          id: "v1", url: "https://en.wikipedia.org/wiki/Test", title: "Test",
          timestamp: "2026-04-02T00:00:00Z", lastVisitedAt: "2026-04-02T00:00:00Z",
          updatedAt: "2026-04-02T00:00:00Z", position: 1, sourceType: "link",
          sourceDetail: null, note: null, summary: null, thumbnailUrl: null,
          language: "en", articleId: "Test", parentVisitId: null,
        }],
      }],
    });
    const result = parseImportJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.trails).toHaveLength(1);
    expect(result.trails[0].visits).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    const result = parseImportJson("not json");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.trails).toHaveLength(0);
  });

  it("rejects unsupported version", () => {
    const result = parseImportJson(JSON.stringify({ version: 99, exportedAt: "", trails: [] }));
    expect(result.errors[0]).toContain("update");
  });

  it("rejects invalid enum values", () => {
    const json = JSON.stringify({
      version: 1, exportedAt: "2026-04-02T00:00:00Z",
      trails: [{
        id: "abc", name: null, createdAt: "2026-04-02T00:00:00Z",
        startedAt: "2026-04-02T00:00:00Z", endedAt: null, updatedAt: "2026-04-02T00:00:00Z",
        status: "INVALID", isStarred: false, tags: [], note: null,
        visibility: "private", forkedFromVisitId: null, startReason: "manual",
        visits: [],
      }],
    });
    const result = parseImportJson(json);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects missing required fields", () => {
    const json = JSON.stringify({
      version: 1, exportedAt: "2026-04-02T00:00:00Z",
      trails: [{ id: "abc" }],
    });
    const result = parseImportJson(json);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run tests/export/import-json.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement parseImportJson**

```typescript
// packages/shared/src/export/import-json.ts
import type { BreadcrumbsDB } from "../db/schema.js";
import type { ExportTrail, ExportVisit, ConflictItem, ImportPlan, ImportContext, ImportResult } from "./types.js";
import { SyncStatus, TrailStatus, Visibility, StartReason, SourceType } from "../models/enums.js";

const CURRENT_VERSION = 1;

const VALID_STATUS = new Set(Object.values(TrailStatus));
const VALID_VISIBILITY = new Set(Object.values(Visibility));
const VALID_START_REASON = new Set(Object.values(StartReason));
const VALID_SOURCE_TYPE = new Set(Object.values(SourceType));

export function parseImportJson(jsonString: string): { trails: ExportTrail[]; errors: string[] } {
  let data: any;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { trails: [], errors: ["Invalid JSON file."] };
  }

  if (!data || typeof data !== "object") {
    return { trails: [], errors: ["File does not contain valid export data."] };
  }

  if (typeof data.version !== "number") {
    return { trails: [], errors: ["Missing version field."] };
  }
  if (data.version > CURRENT_VERSION) {
    return { trails: [], errors: [`This file requires a newer version of the app (v${data.version}). Please update the app to import this file.`] };
  }

  if (!Array.isArray(data.trails)) {
    return { trails: [], errors: ["Missing trails array."] };
  }

  const errors: string[] = [];
  const trails: ExportTrail[] = [];

  for (let i = 0; i < data.trails.length; i++) {
    const t = data.trails[i];
    const prefix = `Trail ${i + 1}`;

    if (!t.id || typeof t.id !== "string") { errors.push(`${prefix}: missing or invalid id`); continue; }
    if (typeof t.startedAt !== "string") { errors.push(`${prefix}: missing startedAt`); continue; }
    if (typeof t.createdAt !== "string") { errors.push(`${prefix}: missing createdAt`); continue; }
    if (typeof t.updatedAt !== "string") { errors.push(`${prefix}: missing updatedAt`); continue; }
    if (!VALID_STATUS.has(t.status)) { errors.push(`${prefix}: invalid status "${t.status}"`); continue; }
    if (!VALID_VISIBILITY.has(t.visibility)) { errors.push(`${prefix}: invalid visibility "${t.visibility}"`); continue; }
    if (!VALID_START_REASON.has(t.startReason)) { errors.push(`${prefix}: invalid startReason "${t.startReason}"`); continue; }
    if (!Array.isArray(t.visits)) { errors.push(`${prefix}: missing visits array`); continue; }

    const visits: ExportVisit[] = [];
    let visitErrors = false;
    for (let j = 0; j < t.visits.length; j++) {
      const v = t.visits[j];
      const vPrefix = `${prefix}, Visit ${j + 1}`;
      if (!v.id || typeof v.id !== "string") { errors.push(`${vPrefix}: missing id`); visitErrors = true; continue; }
      if (!v.url || typeof v.url !== "string") { errors.push(`${vPrefix}: missing url`); visitErrors = true; continue; }
      if (typeof v.title !== "string") { errors.push(`${vPrefix}: missing title`); visitErrors = true; continue; }
      if (typeof v.position !== "number" || v.position < 0) { errors.push(`${vPrefix}: invalid position`); visitErrors = true; continue; }
      if (!VALID_SOURCE_TYPE.has(v.sourceType)) { errors.push(`${vPrefix}: invalid sourceType "${v.sourceType}"`); visitErrors = true; continue; }
      visits.push(v as ExportVisit);
    }

    if (!visitErrors) {
      trails.push({ ...t, visits } as ExportTrail);
    }
  }

  return { trails, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run tests/export/import-json.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/export/import-json.ts packages/shared/tests/export/import-json.test.ts
git commit -m "feat(import): JSON parse and validate with tests"
```

---

### Task 5: JSON Import — Conflict Detection & Execute

**Files:**
- Modify: `packages/shared/src/export/import-json.ts`
- Modify: `packages/shared/tests/export/import-json.test.ts`

- [ ] **Step 1: Write failing tests for detectConflicts and executeImport**

Add to `import-json.test.ts`:

```typescript
describe("detectConflicts", () => {
  let db: BreadcrumbsDB;
  beforeEach(async () => {
    db = new BreadcrumbsDB("test-import-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  it("separates clean and conflicting trails", async () => {
    const local = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add(local);

    const imported: ExportTrail[] = [
      { id: local.id, name: "Conflict", createdAt: "", startedAt: "", endedAt: null, updatedAt: "", status: "finalized", isStarred: false, tags: [], note: null, visibility: "private", forkedFromVisitId: null, startReason: "manual", visits: [] },
      { id: "new-id", name: "Clean", createdAt: "", startedAt: "", endedAt: null, updatedAt: "", status: "finalized", isStarred: false, tags: [], note: null, visibility: "private", forkedFromVisitId: null, startReason: "manual", visits: [] },
    ];

    const result = await detectConflicts(db, imported);
    expect(result.clean).toHaveLength(1);
    expect(result.clean[0].id).toBe("new-id");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].imported.id).toBe(local.id);
    expect(result.conflicts[0].local.id).toBe(local.id);
  });
});

describe("executeImport", () => {
  let db: BreadcrumbsDB;
  beforeEach(async () => {
    db = new BreadcrumbsDB("test-exec-" + crypto.randomUUID());
    await db.open();
  });
  afterEach(async () => { await db.delete(); });

  const makeTrail = (id: string, visits: ExportVisit[] = []): ExportTrail => ({
    id, name: "Trail", createdAt: "2026-04-02T00:00:00Z", startedAt: "2026-04-02T00:00:00Z",
    endedAt: null, updatedAt: "2026-04-02T00:00:00Z", status: "finalized", isStarred: false,
    tags: [], note: null, visibility: "private", forkedFromVisitId: null, startReason: "manual",
    visits,
  });

  const makeVisit = (id: string, parentVisitId: string | null = null): ExportVisit => ({
    id, url: "https://en.wikipedia.org/wiki/Test", title: "Test",
    timestamp: "2026-04-02T00:00:00Z", lastVisitedAt: "2026-04-02T00:00:00Z",
    updatedAt: "2026-04-02T00:00:00Z", position: 1, sourceType: "link",
    sourceDetail: null, note: null, summary: null, thumbnailUrl: null,
    language: "en", articleId: "Test", parentVisitId,
  });

  it("imports clean trails", async () => {
    const trail = makeTrail("t1", [makeVisit("v1")]);
    const plan: ImportPlan = { items: [{ trail, action: "skip" as const }] };

    // Actually test a real import
    const realPlan: ImportPlan = { items: [{ trail, action: "overwrite" as const }] };
    const result = await executeImport(db, realPlan, { userId: null, deviceId: "dev1" });

    expect(result.trailsImported).toBe(1);
    expect(result.visitsImported).toBe(1);
    const stored = await db.trails.get("t1");
    expect(stored).toBeDefined();
    expect(stored!.deviceId).toBe("dev1");
    expect(stored!.syncStatus).toBe(SyncStatus.LocalOnly);
  });

  it("skips trails marked as skip", async () => {
    const plan: ImportPlan = { items: [{ trail: makeTrail("t1"), action: "skip" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });
    expect(result.skipped).toBe(1);
    expect(result.trailsImported).toBe(0);
  });

  it("overwrites existing trail and its visits", async () => {
    const local = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add(local);
    const localVisit = createVisit({
      trailId: local.id, url: "https://en.wikipedia.org/wiki/Old",
      title: "Old", position: 1, sourceType: SourceType.Link,
      language: "en", articleId: "Old",
    });
    await db.visits.add(localVisit);

    const imported = makeTrail(local.id, [makeVisit("v-new")]);
    const plan: ImportPlan = { items: [{ trail: imported, action: "overwrite" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });

    expect(result.trailsImported).toBe(1);
    const visits = await db.visits.where("trailId").equals(local.id).filter((v) => !v.deletedAt).toArray();
    expect(visits).toHaveLength(1);
    expect(visits[0].id).toBe("v-new");
  });

  it("copies trail with fresh IDs and remaps parentVisitId", async () => {
    const v1 = makeVisit("orig-v1");
    const v2 = { ...makeVisit("orig-v2"), position: 2, parentVisitId: "orig-v1" };
    const imported = makeTrail("orig-t1", [v1, v2]);

    // Put the original in DB so it's a conflict
    const local = createTrail({ startReason: StartReason.Manual, deviceId: "d1" });
    await db.trails.add({ ...local, id: "orig-t1" });

    const plan: ImportPlan = { items: [{ trail: imported, action: "copy" }] };
    const result = await executeImport(db, plan, { userId: null, deviceId: "dev1" });

    expect(result.trailsImported).toBe(1);
    // Should have 2 trails now (original + copy)
    const allTrails = await db.trails.toArray();
    expect(allTrails).toHaveLength(2);
    const copy = allTrails.find((t) => t.id !== "orig-t1")!;
    expect(copy).toBeDefined();

    const copyVisits = await db.visits.where("trailId").equals(copy.id).sortBy("position");
    expect(copyVisits).toHaveLength(2);
    // IDs should be different from originals
    expect(copyVisits[0].id).not.toBe("orig-v1");
    expect(copyVisits[1].id).not.toBe("orig-v2");
    // parentVisitId should point to the NEW v1 id
    expect(copyVisits[1].parentVisitId).toBe(copyVisits[0].id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run tests/export/import-json.test.ts`
Expected: FAIL — detectConflicts and executeImport not defined

- [ ] **Step 3: Implement detectConflicts and executeImport**

Add to `import-json.ts`:

```typescript
export async function detectConflicts(
  db: BreadcrumbsDB,
  trails: ExportTrail[]
): Promise<{ clean: ExportTrail[]; conflicts: ConflictItem[] }> {
  const clean: ExportTrail[] = [];
  const conflicts: ConflictItem[] = [];

  for (const imported of trails) {
    const local = await db.trails.get(imported.id);
    if (local && !local.deletedAt) {
      conflicts.push({ imported, local });
    } else {
      clean.push(imported);
    }
  }

  return { clean, conflicts };
}

export async function executeImport(
  db: BreadcrumbsDB,
  plan: ImportPlan,
  context: ImportContext
): Promise<ImportResult> {
  const result: ImportResult = { trailsImported: 0, visitsImported: 0, skipped: 0, errors: [] };

  for (const item of plan.items) {
    if (item.action === "skip") {
      result.skipped++;
      continue;
    }

    try {
      if (item.action === "overwrite") {
        await importOverwrite(db, item.trail, context);
      } else {
        await importCopy(db, item.trail, context);
      }
      result.trailsImported++;
      result.visitsImported += item.trail.visits.length;
    } catch (err) {
      result.errors.push(`Failed to import "${item.trail.name ?? item.trail.id}": ${err}`);
    }
  }

  return result;
}

async function importOverwrite(db: BreadcrumbsDB, trail: ExportTrail, ctx: ImportContext): Promise<void> {
  await db.transaction("rw", db.trails, db.visits, async () => {
    // Soft-delete existing visits for this trail
    const existing = await db.visits.where("trailId").equals(trail.id).toArray();
    const now = new Date().toISOString();
    for (const v of existing) {
      await db.visits.update(v.id, { deletedAt: now });
    }

    // Upsert trail
    await db.trails.put(buildTrailRecord(trail, ctx));

    // Insert visits
    for (const v of trail.visits) {
      await db.visits.put(buildVisitRecord(v, trail.id, ctx));
    }
  });
}

async function importCopy(db: BreadcrumbsDB, trail: ExportTrail, ctx: ImportContext): Promise<void> {
  const newTrailId = crypto.randomUUID();
  const visitIdMap = new Map<string, string>();

  // Pre-generate new visit IDs
  for (const v of trail.visits) {
    visitIdMap.set(v.id, crypto.randomUUID());
  }

  await db.transaction("rw", db.trails, db.visits, async () => {
    const trailRecord = buildTrailRecord(trail, ctx);
    trailRecord.id = newTrailId;
    // Remap forkedFromVisitId if it points to a visit in this export
    if (trailRecord.forkedFromVisitId && visitIdMap.has(trailRecord.forkedFromVisitId)) {
      trailRecord.forkedFromVisitId = visitIdMap.get(trailRecord.forkedFromVisitId)!;
    }
    await db.trails.add(trailRecord);

    for (const v of trail.visits) {
      const record = buildVisitRecord(v, newTrailId, ctx);
      record.id = visitIdMap.get(v.id)!;
      if (record.parentVisitId && visitIdMap.has(record.parentVisitId)) {
        record.parentVisitId = visitIdMap.get(record.parentVisitId)!;
      }
      await db.visits.add(record);
    }
  });
}

function buildTrailRecord(trail: ExportTrail, ctx: ImportContext): any {
  return {
    id: trail.id,
    userId: ctx.userId,
    name: trail.name,
    createdAt: trail.createdAt,
    startedAt: trail.startedAt,
    endedAt: trail.endedAt,
    updatedAt: trail.updatedAt,
    status: trail.status,
    isStarred: trail.isStarred,
    tags: trail.tags,
    note: trail.note,
    visibility: trail.visibility,
    deviceId: ctx.deviceId,
    forkedFromVisitId: trail.forkedFromVisitId,
    startReason: trail.startReason,
    syncStatus: SyncStatus.LocalOnly,
    deletedAt: null,
  };
}

function buildVisitRecord(v: ExportVisit, trailId: string, ctx: ImportContext): any {
  return {
    id: v.id,
    trailId,
    url: v.url,
    title: v.title,
    timestamp: v.timestamp,
    lastVisitedAt: v.lastVisitedAt,
    updatedAt: v.updatedAt,
    position: v.position,
    sourceType: v.sourceType,
    sourceDetail: v.sourceDetail,
    tabId: null,
    windowId: null,
    note: v.note,
    summary: v.summary,
    thumbnailUrl: v.thumbnailUrl,
    language: v.language,
    articleId: v.articleId,
    parentVisitId: v.parentVisitId,
    syncStatus: SyncStatus.LocalOnly,
    deletedAt: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run tests/export/import-json.test.ts`
Expected: PASS

- [ ] **Step 5: Run all shared tests**

Run: `cd packages/shared && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/export/ packages/shared/tests/export/ packages/shared/src/index.ts
git commit -m "feat(import): conflict detection and import execution with tests"
```

---

## Chunk 2: UI Components

### Task 6: File Download/Upload Helpers

Both platforms need the same browser APIs for file download and file picker. These are simple utility functions.

**Files:**
- Create: `packages/shared/src/export/file-utils.ts`

- [ ] **Step 1: Create file utilities**

```typescript
// packages/shared/src/export/file-utils.ts
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve(await file.text());
    };
    input.click();
  });
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}

export function exportFilename(trailName: string | null, format: "json" | "csv"): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = trailName ? slugify(trailName) : "export";
  return `wikipedia-breadcrumbs-${slug}-${date}.${format}`;
}
```

- [ ] **Step 2: Add to barrel export**

Add to `packages/shared/src/export/index.ts`:
```typescript
export { downloadFile, pickFile, slugify, exportFilename } from "./file-utils.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/export/file-utils.ts packages/shared/src/export/index.ts
git commit -m "feat(export): file download/upload utilities"
```

---

### Task 7: Extension Export Menu Component

**Files:**
- Create: `packages/extension/src/history/ExportMenu.svelte`

- [ ] **Step 1: Create ExportMenu component**

```svelte
<!-- packages/extension/src/history/ExportMenu.svelte -->
<script lang="ts">
  import { BreadcrumbsDB, exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";

  interface Props {
    trailIds?: string[];
    trailName?: string | null;
  }

  let { trailIds, trailName }: Props = $props();
  let open = $state(false);

  const db = new BreadcrumbsDB();

  async function handleExport(format: "json" | "csv") {
    open = false;
    const content = format === "json"
      ? await exportTrailsJson(db, trailIds)
      : await exportTrailsCsv(db, trailIds);
    const filename = trailIds?.length === 1
      ? exportFilename(trailName ?? null, format)
      : exportFilename(null, format);
    downloadFile(content, filename, format === "json" ? "application/json" : "text/csv");
  }
</script>

<div class="export-menu">
  <button class="export-btn" onclick={() => { open = !open; }}>Export</button>
  {#if open}
    <div class="export-dropdown">
      <button onclick={() => handleExport("json")}>JSON</button>
      <button onclick={() => handleExport("csv")}>CSV</button>
    </div>
  {/if}
</div>

<style>
  .export-menu { position: relative; display: inline-block; }
  .export-btn { font-size: 12px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; }
  .export-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; background: white;
    border: 1px solid #ddd; border-radius: 6px; padding: 4px 0; z-index: 50;
    min-width: 80px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .export-dropdown button {
    display: block; width: 100%; text-align: left; padding: 6px 12px;
    border: none; background: none; cursor: pointer; font-size: 12px;
  }
  .export-dropdown button:hover { background: #f5f5f5; }
</style>
```

- [ ] **Step 2: Add ExportMenu to TrailDetail**

In `packages/extension/src/history/TrailDetail.svelte`, add the import and place `<ExportMenu>` in the header alongside the merge button:

```svelte
import ExportMenu from "./ExportMenu.svelte";
```

Place after the merge button:
```svelte
<ExportMenu trailIds={[trail.id]} trailName={trail.name} />
```

- [ ] **Step 3: Add ExportMenu to TrailList**

In `packages/extension/src/history/TrailList.svelte`, add an "Export all" button in the toolbar area:

```svelte
<ExportMenu />
```

- [ ] **Step 4: Build and verify**

Run: `pnpm --filter extension build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/history/ExportMenu.svelte packages/extension/src/history/TrailDetail.svelte packages/extension/src/history/TrailList.svelte
git commit -m "feat(extension): export menu on TrailDetail and TrailList"
```

---

### Task 8: Extension Import Dialog Component

**Files:**
- Create: `packages/extension/src/history/ImportDialog.svelte`

- [ ] **Step 1: Create ImportDialog component**

```svelte
<!-- packages/extension/src/history/ImportDialog.svelte -->
<script lang="ts">
  import { BreadcrumbsDB, parseImportJson, detectConflicts, executeImport, pickFile } from "@wikipedia-breadcrumbs/shared";
  import type { ConflictItem, ImportPlan, ImportResult } from "@wikipedia-breadcrumbs/shared";
  import { getDeviceId } from "../shared/device-id.js";

  interface Props {
    onComplete: () => void;
  }
  let { onComplete }: Props = $props();

  const db = new BreadcrumbsDB();

  let conflicts = $state<ConflictItem[]>([]);
  let cleanTrails = $state<any[]>([]);
  let decisions = $state<Record<string, "skip" | "overwrite" | "copy">>({});
  let result = $state<ImportResult | null>(null);
  let error = $state("");
  let showDialog = $state(false);

  async function handleImport() {
    error = "";
    result = null;
    const content = await pickFile(".json");
    if (!content) return;

    const parsed = parseImportJson(content);
    if (parsed.errors.length > 0) {
      error = parsed.errors.join("\n");
      return;
    }

    const detected = await detectConflicts(db, parsed.trails);
    cleanTrails = detected.clean;

    if (detected.conflicts.length > 0) {
      conflicts = detected.conflicts;
      decisions = {};
      for (const c of detected.conflicts) {
        decisions[c.imported.id] = "skip";
      }
      showDialog = true;
    } else {
      await doImport(detected.clean, []);
    }
  }

  async function confirmImport() {
    showDialog = false;
    const resolved = conflicts.map((c) => ({
      trail: c.imported,
      action: decisions[c.imported.id],
    }));
    await doImport(cleanTrails, resolved);
  }

  async function doImport(clean: any[], resolved: any[]) {
    const plan: ImportPlan = {
      items: [
        ...clean.map((t) => ({ trail: t, action: "overwrite" as const })),
        ...resolved,
      ],
    };
    const deviceId = await getDeviceId();
    result = await executeImport(db, plan, { userId: null, deviceId });
    onComplete();
  }
</script>

<button class="import-btn" onclick={handleImport}>Import</button>

{#if error}
  <div class="import-error">{error}</div>
{/if}

{#if result}
  <div class="import-result">
    Imported {result.trailsImported} trail{result.trailsImported === 1 ? "" : "s"}
    ({result.visitsImported} visit{result.visitsImported === 1 ? "" : "s"}).
    {#if result.skipped > 0}Skipped {result.skipped}.{/if}
    {#if result.errors.length > 0}
      <div class="import-errors">{result.errors.join("; ")}</div>
    {/if}
  </div>
{/if}

{#if showDialog}
  <div class="conflict-overlay">
    <div class="conflict-dialog">
      <h3>Import Conflicts</h3>
      <p>{conflicts.length} trail{conflicts.length === 1 ? "" : "s"} already exist{conflicts.length === 1 ? "s" : ""} locally.</p>
      {#each conflicts as conflict}
        <div class="conflict-item">
          <strong>{conflict.imported.name ?? conflict.imported.id.slice(0, 8)}</strong>
          <span>({conflict.imported.visits.length} visits)</span>
          <div class="conflict-actions">
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="skip" /> Skip</label>
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="overwrite" /> Overwrite</label>
            <label><input type="radio" bind:group={decisions[conflict.imported.id]} value="copy" /> Import as copy</label>
          </div>
        </div>
      {/each}
      <div class="dialog-actions">
        <button onclick={confirmImport}>Import</button>
        <button onclick={() => { showDialog = false; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .import-btn { font-size: 12px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 3px; background: white; cursor: pointer; }
  .import-error { color: #dc3545; font-size: 12px; margin-top: 4px; white-space: pre-wrap; }
  .import-result { font-size: 12px; color: #155724; background: #d4edda; padding: 6px 10px; border-radius: 4px; margin-top: 4px; }
  .import-errors { color: #dc3545; margin-top: 4px; }
  .conflict-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .conflict-dialog { background: white; border-radius: 8px; padding: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .conflict-dialog h3 { margin: 0 0 8px; }
  .conflict-item { margin: 12px 0; padding: 8px; border: 1px solid #eee; border-radius: 4px; }
  .conflict-actions { display: flex; gap: 12px; margin-top: 6px; font-size: 13px; }
  .conflict-actions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .dialog-actions { display: flex; gap: 8px; margin-top: 16px; }
  .dialog-actions button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
  .dialog-actions button:first-child { background: #0066cc; color: white; border: none; }
</style>
```

- [ ] **Step 2: Add ImportDialog to TrailList**

In `packages/extension/src/history/TrailList.svelte`, import and place alongside ExportMenu:

```svelte
import ImportDialog from "./ImportDialog.svelte";
```

```svelte
<ImportDialog onComplete={loadTrails} />
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter extension build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/history/ImportDialog.svelte packages/extension/src/history/TrailList.svelte
git commit -m "feat(extension): import dialog with conflict resolution"
```

---

### Task 9: PWA Export Menu Component

**Files:**
- Create: `packages/pwa/src/lib/components/ExportMenu.svelte`

- [ ] **Step 1: Create ExportMenu component**

Same logic as extension but with PWA styling (rounded corners, slightly different button styles). Uses `db` from `$lib/stores/db`.

```svelte
<!-- packages/pwa/src/lib/components/ExportMenu.svelte -->
<script lang="ts">
  import { exportTrailsJson, exportTrailsCsv, downloadFile, exportFilename } from "@wikipedia-breadcrumbs/shared";
  import { db } from "$lib/stores/db";

  interface Props {
    trailIds?: string[];
    trailName?: string | null;
  }

  let { trailIds, trailName }: Props = $props();
  let open = $state(false);

  async function handleExport(format: "json" | "csv") {
    open = false;
    const content = format === "json"
      ? await exportTrailsJson(db, trailIds)
      : await exportTrailsCsv(db, trailIds);
    const filename = trailIds?.length === 1
      ? exportFilename(trailName ?? null, format)
      : exportFilename(null, format);
    downloadFile(content, filename, format === "json" ? "application/json" : "text/csv");
  }
</script>

<div class="export-menu">
  <button class="export-btn" onclick={() => { open = !open; }}>Export</button>
  {#if open}
    <div class="export-dropdown">
      <button onclick={() => handleExport("json")}>JSON</button>
      <button onclick={() => handleExport("csv")}>CSV</button>
    </div>
  {/if}
</div>

<style>
  .export-menu { position: relative; display: inline-block; }
  .export-btn {
    font-size: 12px; padding: 4px 10px; border: 1px solid #ddd; border-radius: 6px;
    background: #f8f8f8; cursor: pointer; color: #333;
  }
  .export-btn:hover { background: #eee; }
  .export-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; background: white;
    border: 1px solid #ddd; border-radius: 8px; padding: 4px 0; z-index: 50;
    min-width: 80px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  }
  .export-dropdown button {
    display: block; width: 100%; text-align: left; padding: 7px 14px;
    border: none; background: none; cursor: pointer; font-size: 13px;
  }
  .export-dropdown button:hover { background: #f5f5f5; }
</style>
```

- [ ] **Step 2: Add to PWA TrailDetail and TrailList**

In `packages/pwa/src/lib/components/TrailDetail.svelte`, import and add alongside Merge button:
```svelte
import ExportMenu from "./ExportMenu.svelte";
```
```svelte
<ExportMenu trailIds={[trailId]} trailName={trail?.name} />
```

In `packages/pwa/src/lib/components/TrailList.svelte`, import and add in controls area:
```svelte
import ExportMenu from "./ExportMenu.svelte";
```
```svelte
<ExportMenu />
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/pwa/src/lib/components/ExportMenu.svelte packages/pwa/src/lib/components/TrailDetail.svelte packages/pwa/src/lib/components/TrailList.svelte
git commit -m "feat(pwa): export menu on TrailDetail and TrailList"
```

---

### Task 10: PWA Import Dialog Component

**Files:**
- Create: `packages/pwa/src/lib/components/ImportDialog.svelte`

- [ ] **Step 1: Create ImportDialog component**

Same logic as extension ImportDialog but uses PWA's `db` import and `getDeviceId` from `$lib/stores/device-id`. Styled to match PWA design (rounded corners, PWA button classes).

The component structure is identical to the extension version with these differences:
- `import { db } from "$lib/stores/db";`
- `import { getDeviceId } from "$lib/stores/device-id";`
- `const deviceId = getDeviceId();` (synchronous in PWA)
- PWA-appropriate styling (6px radius, #f8f8f8 backgrounds)

- [ ] **Step 2: Add to PWA TrailList**

```svelte
import ImportDialog from "./ImportDialog.svelte";
```
```svelte
<ImportDialog onComplete={loadTrails} />
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter pwa build`
Expected: Build succeeds

- [ ] **Step 4: Run full build**

Run: `pnpm -r build`
Expected: All packages build

- [ ] **Step 5: Commit**

```bash
git add packages/pwa/src/lib/components/ImportDialog.svelte packages/pwa/src/lib/components/TrailList.svelte
git commit -m "feat(pwa): import dialog with conflict resolution"
```

---

## Chunk 3: Integration & Cleanup

### Task 11: End-to-End Verification

- [ ] **Step 1: Run all shared tests**

Run: `cd packages/shared && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Build all packages**

Run: `pnpm -r build`
Expected: All packages build successfully with no errors

- [ ] **Step 3: Manual test — extension export/import**

1. Open extension history page
2. Click Export on a trail → verify JSON downloads with correct data
3. Click Export → CSV → verify CSV downloads
4. Click Export all on trail list → verify bulk export
5. Click Import → select the exported JSON → verify no conflicts, trails imported
6. Delete the imported trail, import again → verify conflict dialog appears

- [ ] **Step 4: Manual test — PWA export/import**

1. Open PWA trails page
2. Repeat steps 2-6 above in PWA context

- [ ] **Step 5: Manual test — cross-platform**

1. Export from extension
2. Import into PWA → verify data transfers correctly
3. Export from PWA → import into extension

- [ ] **Step 6: Final commit and push**

```bash
git push
```
